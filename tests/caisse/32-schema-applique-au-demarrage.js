// Le serveur applique lui-meme sql/schema.sql a chaque demarrage. Cas reel : l'installation de test
// (PM2) recevait un code a jour mais une base pas migree (la migration etait manuelle) -> les listes du
// catalogue repondaient 500 "Erreur interne du serveur" et la caisse s'affichait vide. Ce test demarre
// VRAIMENT le serveur contre une base "ancienne" (colonne manquante) et verifie qu'elle se repare seule.
const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '../..');
const sql = (q) => execSync(`mariadb -uroot -N salonq -e "${q.replace(/"/g, '\\"')}"`).toString().trim();
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n + (x ? '  [' + x + ']' : '')); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const hasCol = (t) => sql(`SELECT COUNT(*) FROM information_schema.columns WHERE table_schema='salonq' AND table_name='${t}' AND column_name='deleted_at'`) === '1';
const baseEnv = { PATH: process.env.PATH, HOME: process.env.HOME, DB_HOST: '127.0.0.1', DB_NAME: 'salonq', SETTINGS_ENCRYPTION_KEY: 'testkeytestkeytestkeytestkey123456' };

function startServer(port, user, password) {
  const child = spawn('node', ['server.js'], { cwd: ROOT, env: Object.assign({}, baseEnv, { PORT: String(port), DB_USER: user, DB_PASSWORD: password }) });
  child.log = ''; child.stdout.on('data', d => { child.log += d; }); child.stderr.on('data', d => { child.log += d; });
  return child;
}
async function waitHealthy(port, ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) { try { const r = await fetch(`http://127.0.0.1:${port}/healthz`); if (r.ok) return true; } catch (e) { /* pas encore pret */ } await sleep(250); }
  return false;
}
const get = async (port, p) => { const r = await fetch(`http://127.0.0.1:${port}${p}`, { headers: { 'X-Salon-Slug': 'test' } }); return r.status; };

(async () => {
  const children = [];
  try {
    console.log('\n[A] Le mode ligne de commande (Docker) reste identique');
    const out = execSync('node scripts/apply-schema.js', { cwd: ROOT, env: Object.assign({}, baseEnv, { DB_USER: 'sq', DB_PASSWORD: 'sqpass' }) }).toString();
    check('"[schema] schema.sql applique - N tables ..." et code de sortie 0', /^\[schema\] schema\.sql applique - \d+ tables presentes dans salonq/.test(out), out.trim());
    check('le conteneur de production lance toujours le script PUIS le serveur', /node scripts\/apply-schema\.js && exec node server\.js/.test(fs.readFileSync(path.join(ROOT, 'Dockerfile'), 'utf8')));

    console.log('\n[B] Base ANCIENNE (colonne manquante) + code a jour : le serveur la repare tout seul');
    for (const t of ['services', 'extras', 'products']) sql(`ALTER TABLE ${t} DROP COLUMN deleted_at`);
    check('point de depart : la colonne "deleted_at" n\'existe pas (la base est "ancienne")', !hasCol('services') && !hasCol('extras') && !hasCol('products'));
    const s1 = startServer(4010, 'sq', 'sqpass'); children.push(s1);
    check('le serveur demarre', await waitHealthy(4010, 20000), s1.log.split('\n').filter(l => /schema|Erreur/.test(l)).join(' | '));
    check('il annonce "[schema] base a jour"', /\[schema\] base a jour \(\d+ tables dans salonq\)/.test(s1.log));
    check('les 3 colonnes ont ete ajoutees SANS aucune intervention manuelle', hasCol('services') && hasCol('extras') && hasCol('products'));
    const codes = [await get(4010, '/api/catalog/services'), await get(4010, '/api/catalog/extras'), await get(4010, '/api/catalog/products')];
    check('les listes du catalogue repondent 200 (avant : 500 "Erreur interne du serveur")', codes.every(c => c === 200), codes.join('/'));
    s1.kill('SIGTERM'); await sleep(500);

    console.log('\n[C] Schema impossible a appliquer (droits insuffisants) : le serveur demarre QUAND MEME et le dit');
    sql("CREATE USER IF NOT EXISTS 'sq_limite'@'%' IDENTIFIED BY 'limitepass'");
    sql("GRANT SELECT, INSERT, UPDATE, DELETE ON salonq.* TO 'sq_limite'@'%'");
    const s2 = startServer(4011, 'sq_limite', 'limitepass'); children.push(s2);
    check('le serveur demarre malgre l\'echec du schema', await waitHealthy(4011, 25000), s2.log.slice(-300));
    check('il avertit clairement et indique quoi faire (journal)', /\[schema\] ATTENTION - schema NON applique automatiquement/.test(s2.log) && /bash scripts\/run-migration\.sh/.test(s2.log), (s2.log.match(/\[schema\][^\n]*/) || [''])[0].slice(0, 150));
    check('et il reste utilisable (la base etait deja a jour)', (await get(4011, '/api/catalog/services')) === 200);
    s2.kill('SIGTERM'); await sleep(500);

    console.log('\n[D] Le schema est applique AVANT d\'accepter des requetes');
    const srv = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
    check('une seule ecoute reseau (app.listen), a l\'interieur de startServer()', (srv.match(/app\.listen\(/g) || []).length === 1 && /function startServer\(\) \{\napp\.listen\(/.test(srv));
    check('startServer n\'est lance qu\'APRES applySchema (succes OU echec)', /applySchema\([^)]*\)[\s\S]*?\.catch\([\s\S]*?\)\s*\.then\(startServer\)/.test(srv));
  } finally {
    children.forEach(c => { try { c.kill('SIGKILL'); } catch (e) { /* deja arrete */ } });
    try { sql("DROP USER IF EXISTS 'sq_limite'@'%'"); } catch (e) { /* ignore */ }
    try { execSync('node scripts/apply-schema.js', { cwd: ROOT, env: Object.assign({}, baseEnv, { DB_USER: 'sq', DB_PASSWORD: 'sqpass' }), stdio: 'pipe' }); } catch (e) { /* ignore */ }   // laisse la base a jour quoi qu'il arrive
  }
  console.log(`\nRESULTAT : ${pass} verifications reussies, ${fail} echec(s)`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('ERREUR TEST', e); process.exit(2); });
