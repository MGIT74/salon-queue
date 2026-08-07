const mysql = require('mysql2/promise');

// xCloud a tendance à réécrire le .env avec des fins de ligne Windows (\r\n)
// et laisse parfois un \r collé à la fin des valeurs — ce qui casse la
// résolution DNS/host silencieusement. On nettoie systématiquement.
function clean(v) {
  return typeof v === 'string' ? v.replace(/[\r\n]+$/, '').trim() : v;
}

const pool = mysql.createPool({
  host: clean(process.env.DB_HOST) || '127.0.0.1',
  port: Number(clean(process.env.DB_PORT) || 3306),
  user: clean(process.env.DB_USER),
  password: clean(process.env.DB_PASSWORD),
  database: clean(process.env.DB_NAME),
  waitForConnections: true,
  connectionLimit: 10,
  namedPlaceholders: false,
  dateStrings: true,
  // Sans ce réglage, le driver sérialise un objet Date JS passé en
  // paramètre de requête (ex: `new Date()`) en utilisant le fuseau
  // horaire LOCAL du système d'exploitation - un réglage implicite qui
  // ne dépend d'aucune configuration ici (donc invisible), et qui
  // casserait silencieusement si l'OS du serveur changeait un jour de
  // fuseau par défaut. 'Z' force une sérialisation UTC systématique,
  // cohérente avec le SET time_zone='+00:00' appliqué juste en dessous.
  timezone: 'Z'
});

// Force chaque connexion à travailler en UTC, peu importe le fuseau
// configuré sur le serveur MySQL — sinon NOW() peut renvoyer une heure
// locale ambiguë, et le navigateur (en France, UTC+2) interprète les
// dates reçues comme si elles étaient déjà locales, décalant de 2h
// chaque calcul de temps écoulé/restant.
pool.on('connection', (connection) => {
  connection.query("SET time_zone = '+00:00'");
});

// Les dates viennent de MySQL sans indication de fuseau (ex: "2026-07-30
// 08:30:00"). Comme la session est forcée en UTC ci-dessus, on peut les
// taguer explicitement UTC avant de les renvoyer au navigateur, pour que
// `new Date(...)` soit interprété correctement quel que soit le fuseau
// du client (navigateur ou serveur Node).
function utcIso(v) {
  if (!v) return v;
  return v.replace(' ', 'T') + 'Z';
}

/**
 * Renvoie la date de reouverture (ISO) si la caisse est actuellement
 * verrouillee suite a une cloture, ou null si elle est ouverte. La
 * caisse ne se rouvre JAMAIS le meme jour qu'une cloture - toujours
 * le LENDEMAIN, a l'heure configuree (par defaut minuit) - SAUF si
 * l'admin a force l'ouverture manuellement depuis cette cloture
 * (settings.caisse_force_reopen_at, un forçage plus ancien que la
 * derniere cloture ne compte plus - une nouvelle cloture re-verrouille
 * normalement).
 */
async function getCaisseLockedUntil(salonId, settings) {
  const [[lastClosing]] = await pool.query(
    'SELECT period_end FROM cash_closings WHERE salon_id = ? ORDER BY period_end DESC LIMIT 1',
    [salonId]
  );
  if (!lastClosing) return null;

  const closingDate = new Date(lastClosing.period_end + 'Z'); // vrai instant UTC de la clôture

  if (settings.caisse_force_reopen_at) {
    const forcedAt = new Date(settings.caisse_force_reopen_at);
    if (!Number.isNaN(forcedAt.getTime()) && forcedAt > closingDate) return null;
  }

  const reopenHour = /^\d{2}:\d{2}$/.test(settings.caisse_reopen_hour || '') ? settings.caisse_reopen_hour : '00:00';

  // "08:00" dans le réglage est une heure de SALON (Europe/Paris), pas de
  // l'UTC — appliquer setUTCHours() dessus décalait la réouverture de
  // 1h à 2h selon la saison (ex: 08:00 réglé -> rouvrait à 10:00 réel
  // en été). On détermine d'abord la date calendaire du lendemain EN
  // HEURE DE SALON (peut différer de la date UTC selon l'heure de la
  // clôture), puis on convertit correctement heure de salon -> UTC.
  const closingParisDateStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(closingDate);
  const nextDay = new Date(closingParisDateStr + 'T00:00:00Z');
  nextDay.setUTCDate(nextDay.getUTCDate() + 1);
  const nextDayStr = nextDay.toISOString().slice(0, 10);

  const reopenAt = parisLocalToUtcDate(nextDayStr, reopenHour + ':00');
  return new Date() < reopenAt ? reopenAt.toISOString() : null;
}

/**
 * Convertit une date+heure exprimées en heure LOCALE de salon
 * (Europe/Paris) en le vrai instant UTC correspondant - détecte
 * automatiquement l'écart CET/CEST selon la date. Même logique que
 * dans routes/appointments.js (dupliquée ici volontairement : petit
 * utilitaire autonome, pas de dépendance croisée entre modules).
 */
function parisLocalToUtcDate(dateStr, timeStr) {
  const [y, mo, d] = dateStr.split('-').map(Number);
  const [hh, mi, se] = String(timeStr).split(':').map(Number);
  const guess = new Date(Date.UTC(y, mo - 1, d, hh, mi, se || 0));
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Paris', hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  }).formatToParts(guess);
  const get = (t) => Number(parts.find((p) => p.type === t).value);
  const hour24 = get('hour') === 24 ? 0 : get('hour');
  const asIfParis = Date.UTC(get('year'), get('month') - 1, get('day'), hour24, get('minute'), get('second'));
  const offsetMs = asIfParis - guess.getTime();
  return new Date(guess.getTime() - offsetMs);
}

// Lecture / écriture de la table settings (clé -> valeur), par salon
async function getSettings(salonId) {
  const [rows] = await pool.query('SELECT `key`, value FROM settings WHERE salon_id = ?', [salonId]);
  const out = {};
  rows.forEach((r) => { out[r.key] = r.value; });
  return out;
}

async function setSettings(salonId, obj) {
  const entries = Object.entries(obj);
  if (!entries.length) return;
  const placeholders = entries.map(() => '(?, ?, ?, NOW())').join(', ');
  const params = [];
  entries.forEach(([k, v]) => { params.push(salonId, k, v == null ? '' : String(v)); });
  await pool.query(
    `INSERT INTO settings (salon_id, \`key\`, value, updated_at) VALUES ${placeholders}
     ON DUPLICATE KEY UPDATE value = VALUES(value), updated_at = VALUES(updated_at)`,
    params
  );
}

// Réglages marketing au niveau de l'ENSEIGNE (owner_id) — fidélité,
// pourcentages de remise, cohérents avec le cumul de points partagé
// entre tous les salons du même propriétaire.
async function getOwnerSettings(ownerId) {
  const [rows] = await pool.query('SELECT `key`, value FROM owner_settings WHERE owner_id = ?', [ownerId]);
  const out = {};
  rows.forEach((r) => { out[r.key] = r.value; });
  return out;
}

async function setOwnerSettings(ownerId, obj) {
  const entries = Object.entries(obj);
  if (!entries.length) return;
  const placeholders = entries.map(() => '(?, ?, ?, NOW())').join(', ');
  const params = [];
  entries.forEach(([k, v]) => { params.push(ownerId, k, v == null ? '' : String(v)); });
  await pool.query(
    `INSERT INTO owner_settings (owner_id, \`key\`, value, updated_at) VALUES ${placeholders}
     ON DUPLICATE KEY UPDATE value = VALUES(value), updated_at = VALUES(updated_at)`,
    params
  );
}

// Réglages globaux de la plateforme (pas liés à un salon), ex: SMTP
// utilisé pour les emails de la plateforme elle-même.
async function getPlatformSettings() {
  const [rows] = await pool.query('SELECT `key`, value FROM platform_settings');
  const out = {};
  rows.forEach((r) => { out[r.key] = r.value; });
  return out;
}

async function setPlatformSettings(obj) {
  const entries = Object.entries(obj);
  if (!entries.length) return;
  const placeholders = entries.map(() => '(?, ?, NOW())').join(', ');
  const params = [];
  entries.forEach(([k, v]) => { params.push(k, v == null ? '' : String(v)); });
  await pool.query(
    `INSERT INTO platform_settings (\`key\`, value, updated_at) VALUES ${placeholders}
     ON DUPLICATE KEY UPDATE value = VALUES(value), updated_at = VALUES(updated_at)`,
    params
  );
}

module.exports = { pool, getSettings, setSettings, getOwnerSettings, setOwnerSettings, getPlatformSettings, setPlatformSettings, utcIso, getCaisseLockedUntil };
