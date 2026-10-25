// Journal des erreurs serveur : chaque « Erreur interne du serveur » est notee (quand, salon, page, cause) et lisible
// par le super admin (onglet « Erreurs »), sans acces au serveur. Jamais le contenu de la requete ni la requete SQL.
process.env.DB_HOST = process.env.DB_HOST || '127.0.0.1'; process.env.DB_USER = process.env.DB_USER || 'sq';
process.env.DB_PASSWORD = process.env.DB_PASSWORD || 'sqpass'; process.env.DB_NAME = process.env.DB_NAME || 'salonq';
const fs = require('fs'), path = require('path');
const { execSync } = require('child_process');
const sql = (q) => execSync(`mariadb -uroot salonq -N -e "${q.replace(/"/g, '\\"')}"`).toString().trim();
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n + (x ? '  [' + String(x).slice(0, 160) + ']' : '')); };
const root = path.join(__dirname, '../..');
const rd = (f) => fs.readFileSync(path.join(root, f), 'utf8');

(async () => {
  console.log('\n[A] Enregistrement');
  sql(`DELETE FROM server_errors WHERE path LIKE '/api/t123%';`);
  const { recordServerError } = require(path.join(root, 'src/lib/errorLog'));
  const err = new Error("Unknown column 'x' in 'field list'"); err.code = 'ER_BAD_FIELD_ERROR'; err.sql = "INSERT INTO appointments ... 'Da Silva'";
  recordServerError({ method: 'POST', originalUrl: '/api/t123/admin-create?token=secret', salon: { id: 's1' }, body: { client_name: 'Da Silva' } }, err);
  await new Promise((r) => setTimeout(r, 600));
  const row = sql(`SELECT CONCAT(method, '|', path, '|', IFNULL(salon_id,''), '|', message) FROM server_errors WHERE path LIKE '/api/t123%' ORDER BY id DESC LIMIT 1`);
  check('erreur notee : methode, page (sans parametres), salon, message', row === "POST|/api/t123/admin-create|s1|Unknown column 'x' in 'field list'", row);
  const detail = sql(`SELECT detail FROM server_errors WHERE path LIKE '/api/t123%' ORDER BY id DESC LIMIT 1`);
  check('detail : code + pile d\'appels', /Code : ER_BAD_FIELD_ERROR/.test(detail) && /123-journal-erreurs-serveur\.js/.test(detail));
  check('jamais le contenu de la requete ni le SQL (donnees clients)', !/Da Silva/.test(detail + row) && !/secret/.test(row));
  sql(`DELETE FROM server_errors WHERE path LIKE '/api/t123%';`);
  require(path.join(root, 'src/db')).pool.end().catch(() => {});

  console.log('\n[B] Branchements');
  check('toutes les routes (wrap) notent leurs erreurs', /recordServerError\(req, err\);/.test(rd('src/lib/wrap.js')));
  check('middlewares (salon, admin) aussi', ['src/middleware/requireSalon.js', 'src/middleware/resolveSalon.js', 'src/middleware/auth.js'].every((f) => /recordServerError\(req, err\)/.test(rd(f))));
  check('table creee au demarrage, 500 dernieres gardees', /CREATE TABLE IF NOT EXISTS server_errors/.test(rd('sql/schema.sql')) && /OFFSET 500/.test(rd('src/lib/errorLog.js')));
  const s = rd('src/routes/salons.js');
  check('lecture et vidage reserves au super admin', /router\.get\('\/errors', requireSuperAdmin/.test(s) && /router\.delete\('\/errors', requireSuperAdmin/.test(s));
  const p = rd('public/super-admin.html');
  check('onglet « Erreurs » dans le super admin, detail depliable', /data-t="errors"/.test(p) && /id="t-errors"/.test(p) && /superApi\('\/api\/super\/errors'\)/.test(p) && /<details class="err-row">/.test(p));
  console.log(`\n${pass} OK, ${fail} ECHEC`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
