const mysql = require('mysql2/promise');
const { encryptSecret, decryptSecret } = require('./lib/secretBox');

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
// `conn` (optionnel) : connexion à utiliser à la place du pool - indispensable
// quand on est déjà dans une section verrouillée (voir lib/cashLock.js), sinon
// une requête supplémentaire sur le pool peut se bloquer si toutes les
// connexions sont prises par des requêtes en attente du même verrou.
async function legacyLockedUntil(salonId, settings, conn) {
  const [[lastClosing]] = await (conn || pool).query(
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

  const tz = settings.timezone || 'Europe/Paris';

  // "08:00" dans le réglage est une heure de SALON, pas de l'UTC —
  // appliquer setUTCHours() dessus décalait la réouverture selon le
  // fuseau et la saison (ex: 08:00 réglé -> rouvrait à 10:00 réel en
  // été avec Europe/Paris). On détermine d'abord la date calendaire du
  // lendemain EN HEURE DE SALON (peut différer de la date UTC selon
  // l'heure de la clôture), puis on convertit correctement heure de
  // salon -> UTC.
  const closingParisDateStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(closingDate);
  const nextDay = new Date(closingParisDateStr + 'T00:00:00Z');
  nextDay.setUTCDate(nextDay.getUTCDate() + 1);
  const nextDayStr = nextDay.toISOString().slice(0, 10);

  const reopenAt = parisLocalToUtcDate(nextDayStr, reopenHour + ':00', tz);
  return new Date() < reopenAt ? reopenAt.toISOString() : null;
}

/**
 * Horaires de la caisse (Dashboard > Caisse > Réglages) : une heure d'OUVERTURE et une heure de FERMETURE
 * AUTOMATIQUE, chacune activable. Tant qu'aucun de ces réglages n'a été enregistré, l'ancien fonctionnement
 * (fermée après une clôture jusqu'au lendemain à caisse_reopen_hour) continue de s'appliquer.
 */
function caisseSchedule(settings) {
  const hhmm = (v, d) => (/^\d{2}:\d{2}$/.test(v || '') ? v : d);
  const toMin = (v) => Number(v.slice(0, 2)) * 60 + Number(v.slice(3, 5));
  const configured = settings.caisse_open_enabled !== undefined || settings.caisse_close_enabled !== undefined;
  const openHour = hhmm(settings.caisse_open_hour, '09:00');
  const closeHour = hhmm(settings.caisse_close_hour, '20:00');
  return {
    configured,
    openEnabled: String(settings.caisse_open_enabled) === '1',
    openHour, openMin: toMin(openHour),
    closeEnabled: String(settings.caisse_close_enabled) === '1',
    closeHour, closeMin: toMin(closeHour)
  };
}

const salonDateStr = (d, tz) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
const shiftDay = (dateStr, n) => { const x = new Date(dateStr + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const fmtHm = (hhmm) => hhmm.replace(':', 'h');

/**
 * État de verrouillage de la caisse : null si on peut encaisser, sinon { reason, until (Date|null), message }.
 *  - 'z_pending'   : fermeture automatique passée avec des ventes pas encore clôturées -> fermée jusqu'à ce que
 *                    l'ADMIN fasse la clôture Z (aucune réouverture automatique, même le lendemain) ;
 *  - 'closed'      : fermeture automatique passée (rien à clôturer ou Z déjà faite) -> jusqu'à la prochaine ouverture ;
 *  - 'before_open' : avant l'heure d'ouverture du jour.
 * « Forcer l'ouverture » (mot de passe admin) lève le verrou en cours.
 */
async function getCaisseLock(salonId, settings, conn) {
  const sch = caisseSchedule(settings);
  if (!sch.configured) {
    const until = await legacyLockedUntil(salonId, settings, conn);
    return until ? { reason: 'closed', until: new Date(until), message: 'Caisse fermée suite à la clôture.' } : null;
  }
  const db = conn || pool;
  const tz = settings.timezone || 'Europe/Paris';
  const now = new Date();
  const today = salonDateStr(now, tz);
  const nowLocal = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now);
  const nowMin = Number(nowLocal.slice(0, 2)) * 60 + Number(nowLocal.slice(3, 5));
  const forcedAt = settings.caisse_force_reopen_at ? new Date(settings.caisse_force_reopen_at) : null;
  const forcedAfter = (d) => forcedAt && !Number.isNaN(forcedAt.getTime()) && forcedAt > d;
  const nextOpen = (dateStr) => sch.openEnabled ? parisLocalToUtcDate(dateStr, sch.openHour + ':00', tz) : parisLocalToUtcDate(dateStr, '00:00:00', tz);

  if (sch.closeEnabled) {
    const closeDay = nowMin >= sch.closeMin ? today : shiftDay(today, -1);
    const lastClose = parisLocalToUtcDate(closeDay, sch.closeHour + ':00', tz);  // dernière fermeture automatique passée
    if (!forcedAfter(lastClose)) {
      const [[z]] = await db.query('SELECT MAX(period_end) AS last FROM cash_closings WHERE salon_id = ?', [salonId]);
      const lastZ = z && z.last ? String(z.last).replace(' ', 'T') + 'Z' : null;
      const lastZSql = lastZ ? lastZ.slice(0, 19).replace('T', ' ') : '1970-01-01 00:00:00';
      const [[pending]] = await db.query(
        'SELECT COUNT(*) AS n FROM sales WHERE salon_id = ? AND created_at > ? AND created_at <= ?',
        [salonId, lastZSql, lastClose.toISOString().slice(0, 19).replace('T', ' ')]
      );
      if (Number(pending.n) > 0) {
        return { reason: 'z_pending', until: null,
          message: 'Caisse fermée depuis ' + fmtHm(sch.closeHour) + ' : la clôture Z doit être faite par l\'administrateur avant de pouvoir encaisser à nouveau.' };
      }
      if (nowMin >= sch.closeMin) {
        const until = nextOpen(shiftDay(today, 1));
        return { reason: 'closed', until, message: 'Caisse fermée depuis ' + fmtHm(sch.closeHour) + '.' };
      }
    }
  }
  if (sch.openEnabled && nowMin < sch.openMin) {
    const until = parisLocalToUtcDate(today, sch.openHour + ':00', tz);
    if (!forcedAfter(parisLocalToUtcDate(today, '00:00:00', tz))) {
      return { reason: 'before_open', until, message: 'La caisse ouvre à ' + fmtHm(sch.openHour) + '.' };
    }
  }
  return null;
}

/** Compatibilité : date de réouverture (ISO), 'z_pending' quand seule une clôture admin la rouvrira, ou null. */
async function getCaisseLockedUntil(salonId, settings, conn) {
  const lock = await getCaisseLock(salonId, settings, conn);
  if (!lock) return null;
  return lock.until ? lock.until.toISOString() : 'z_pending';
}

/**
 * Debut de la "journee de caisse" en cours, en UTC ('YYYY-MM-DD HH:MM:SS' comme
 * sales.created_at) : la derniere heure de reouverture de la caisse
 * (reglage caisse_reopen_hour, heure du SALON, 00:00 par defaut) deja passee.
 * L'historique de caisse affiche aux coiffeurs ne remonte pas avant : il se
 * remet a zero tout seul chaque lendemain a l'ouverture de la caisse.
 */
function caisseDayStartUtc(settings, now) {
  const tz = settings.timezone || 'Europe/Paris';
  const sch = caisseSchedule(settings);
  const reopen = sch.configured
    ? (sch.openEnabled ? sch.openHour : '00:00')
    : (/^\d{2}:\d{2}$/.test(settings.caisse_reopen_hour || '') ? settings.caisse_reopen_hour : '00:00');
  const at = now || new Date();
  const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);
  let start = parisLocalToUtcDate(todayStr, reopen + ':00', tz);
  if (at < start) {
    const y = new Date(todayStr + 'T00:00:00Z');
    y.setUTCDate(y.getUTCDate() - 1);
    start = parisLocalToUtcDate(y.toISOString().slice(0, 10), reopen + ':00', tz);
  }
  return start.toISOString().slice(0, 19).replace('T', ' ');
}

/**
 * Convertit une date+heure exprimées en heure LOCALE de salon en le
 * vrai instant UTC correspondant - détecte automatiquement l'écart
 * avec l'UTC selon le fuseau (réglable) et la date. Même logique que
 * dans routes/appointments.js (dupliquée ici volontairement : petit
 * utilitaire autonome, pas de dépendance croisée entre modules).
 */
function parisLocalToUtcDate(dateStr, timeStr, tz) {
  const zone = tz || 'Europe/Paris';
  const [y, mo, d] = dateStr.split('-').map(Number);
  const [hh, mi, se] = String(timeStr).split(':').map(Number);
  const guess = new Date(Date.UTC(y, mo - 1, d, hh, mi, se || 0));
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: zone, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  }).formatToParts(guess);
  const get = (t) => Number(parts.find((p) => p.type === t).value);
  const hour24 = get('hour') === 24 ? 0 : get('hour');
  const asIfParis = Date.UTC(get('year'), get('month') - 1, get('day'), hour24, get('minute'), get('second'));
  const offsetMs = asIfParis - guess.getTime();
  return new Date(guess.getTime() - offsetMs);
}

// Lecture / écriture de la table settings (clé -> valeur), par salon.
// Les secrets (smtp_pass) sont déchiffrés à la lecture et chiffrés à
// l'écriture - en base, la valeur n'est jamais un mot de passe en clair
// (voir lib/secretBox.js ; les valeurs legacy antérieures au chiffrement
// restent lisibles et seront re-chiffrées à leur prochaine réécriture).
const SECRET_SETTING_KEYS = new Set(['smtp_pass']);

async function getSettings(salonId, conn) {
  const [rows] = await (conn || pool).query('SELECT `key`, value FROM settings WHERE salon_id = ?', [salonId]);
  const out = {};
  rows.forEach((r) => { out[r.key] = SECRET_SETTING_KEYS.has(r.key) ? decryptSecret(r.value) : r.value; });
  return out;
}

async function setSettings(salonId, obj) {
  const entries = Object.entries(obj);
  if (!entries.length) return;
  const placeholders = entries.map(() => '(?, ?, ?, NOW())').join(', ');
  const params = [];
  entries.forEach(([k, v]) => {
    const str = v == null ? '' : String(v);
    // '' signifie "champ laissé vide = conserver l'ancien" côté réglages :
    // ne jamais écraser le secret existant par une valeur vide chiffrée.
    params.push(salonId, k, SECRET_SETTING_KEYS.has(k) && str !== '' ? encryptSecret(str) : str);
  });
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
// utilisé pour les emails de la plateforme elle-même. smtp_pass y est
// stocké chiffré, comme dans les réglages par salon ci-dessus.
async function getPlatformSettings() {
  const [rows] = await pool.query('SELECT `key`, value FROM platform_settings');
  const out = {};
  rows.forEach((r) => { out[r.key] = r.key === 'smtp_pass' ? decryptSecret(r.value) : r.value; });
  return out;
}

async function setPlatformSettings(obj) {
  const entries = Object.entries(obj);
  if (!entries.length) return;
  const placeholders = entries.map(() => '(?, ?, NOW())').join(', ');
  const params = [];
  entries.forEach(([k, v]) => {
    const str = v == null ? '' : String(v);
    params.push(k, k === 'smtp_pass' && str !== '' ? encryptSecret(str) : str);
  });
  await pool.query(
    `INSERT INTO platform_settings (\`key\`, value, updated_at) VALUES ${placeholders}
     ON DUPLICATE KEY UPDATE value = VALUES(value), updated_at = VALUES(updated_at)`,
    params
  );
}

module.exports = { pool, getSettings, setSettings, getOwnerSettings, setOwnerSettings, getPlatformSettings, setPlatformSettings, utcIso, getCaisseLockedUntil, getCaisseLock, caisseSchedule, caisseDayStartUtc, parisLocalToUtcDate };
