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
  dateStrings: true
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

module.exports = { pool, getSettings, setSettings, getPlatformSettings, setPlatformSettings, utcIso };
