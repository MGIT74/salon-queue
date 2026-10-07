// Applique sql/schema.sql (idempotent : CREATE TABLE IF NOT EXISTS + migrations
// conditionnelles) a chaque demarrage - equivalent de scripts/run-migration.sh,
// mais sans client mysql ni intervention manuelle : une base vierge est creee au
// premier lancement, et une nouvelle colonne livree par un redeploiement est
// appliquee toute seule, sans oubli possible (c'est l'oubli de cette etape qui a
// deja cause des erreurs 500 sur le serveur de test : code a jour, base pas
// migree -> "Erreur interne du serveur" et listes vides).
//
// Deux usages :
//  - en ligne de commande (`node scripts/apply-schema.js`, CMD du conteneur Docker) :
//    echoue (code 1) si le schema ne peut pas etre applique ;
//  - appele par server.js a CHAQUE demarrage (applySchema) : donc aussi sur
//    l'installation de test sous PM2, ou la migration etait manuelle.
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

const clean = (v, d) => (v === undefined ? d : String(v).replace(/[\r\n]+$/, '').trim());

// Seules les erreurs de CONNEXION sont reessayees (la base demarre peut-etre
// encore) - un mauvais mot de passe ou une base inexistante echoue tout de
// suite avec un message clair, au lieu de faire attendre 2 minutes pour rien.
const RETRYABLE = new Set(['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'EAI_AGAIN', 'PROTOCOL_CONNECTION_LOST', 'ECONNRESET']);

async function connectWithRetry(cfg, attempts, delayMs) {
  let lastErr;
  for (let i = 1; i <= attempts; i++) {
    try { return await mysql.createConnection(cfg); }
    catch (e) {
      lastErr = e;
      if (!RETRYABLE.has(e.code)) throw e;
      console.log('[schema] base pas encore prete (' + i + '/' + attempts + ') : ' + e.code);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw lastErr;
}

/** Applique schema.sql ; renvoie { tables, database }. */
async function applySchema(opts) {
  opts = opts || {};
  const cfg = {
    host: clean(process.env.DB_HOST, '127.0.0.1'),
    port: Number(clean(process.env.DB_PORT, '3306')),
    user: clean(process.env.DB_USER),
    password: clean(process.env.DB_PASSWORD),
    database: clean(process.env.DB_NAME),
    multipleStatements: true
  };
  const conn = await connectWithRetry(cfg, opts.attempts || 40, opts.delayMs || 3000);
  try {
    const sql = fs.readFileSync(path.join(__dirname, '..', 'sql', 'schema.sql'), 'utf8');
    await conn.query(sql);
    const [[{ n }]] = await conn.query('SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = DATABASE()');
    return { tables: n, database: cfg.database };
  } finally {
    await conn.end();
  }
}

module.exports = { applySchema };

if (require.main === module) {
  applySchema().then((r) => {
    console.log('[schema] schema.sql applique - ' + r.tables + ' tables presentes dans ' + r.database);
  }).catch((e) => { console.error('[schema] ECHEC :', e.message); process.exit(1); });
}
