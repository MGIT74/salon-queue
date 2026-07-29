const mysql = require('mysql2/promise');

// Valeurs de connexion. Les variables d'environnement ont la priorité ;
// les valeurs ci-dessous servent de fallback quand le .env est vide
// (comportement observé sur xCloud qui réécrit le .env à chaque déploiement).
const pool = mysql.createPool({
  host:     process.env.DB_HOST     || '127.0.0.1',
  port:     Number(process.env.DB_PORT || 3306),
  user:     process.env.DB_USER     || 'u_solitary_rain',
  password: process.env.DB_PASSWORD || 'AFm6JNqplvdytXvS',
  database: process.env.DB_NAME     || 's_solitary_rain',
  waitForConnections: true,
  connectionLimit: 10,
  namedPlaceholders: false,
  dateStrings: true
});

// Lecture / écriture de la table settings (clé -> valeur)
async function getSettings() {
  const [rows] = await pool.query('SELECT `key`, value FROM settings');
  const out = {};
  rows.forEach((r) => { out[r.key] = r.value; });
  return out;
}

async function setSettings(obj) {
  const entries = Object.entries(obj);
  if (!entries.length) return;
  const values = entries.map(([, v]) => (v == null ? '' : String(v)));
  const placeholders = entries.map(() => '(?, ?, NOW())').join(', ');
  const params = [];
  entries.forEach(([k], i) => { params.push(k, values[i]); });
  await pool.query(
    `INSERT INTO settings (\`key\`, value, updated_at) VALUES ${placeholders}
     ON DUPLICATE KEY UPDATE value = VALUES(value), updated_at = VALUES(updated_at)`,
    params
  );
}

module.exports = { pool, getSettings, setSettings };
