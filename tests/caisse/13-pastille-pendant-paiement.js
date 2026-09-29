// Bug signale chez un client : la pastille TPE/imprimante passe au rouge en
// PLEINE transaction carte, alors que le pont fonctionne normalement (il est
// juste occupe a attendre la reponse du TERMINAL PHYSIQUE, jusqu'a 120s,
// pendant lesquelles il ne rappelle pas le serveur). Verifie que
// GET /api/tpe/bridge-status tolere ce silence UNIQUEMENT s'il y a reellement
// un paiement 'processing' en cours pour ce salon - sinon la detection rapide
// (10s) d'un vrai pont hors ligne doit rester intacte.
const { execSync } = require('child_process');
const BASE = 'http://127.0.0.1:3999';
const sql = (q) => execSync(`mariadb -uroot salonq -e "${q.replace(/"/g,'\\"')}"`, { stdio: 'pipe' }).toString();
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n + (x ? '  [' + x + ']' : '')); };
const status = async () => (await (await fetch(BASE + '/api/tpe/bridge-status', { headers: { 'X-Salon-Slug': 'test', 'X-Admin-Password': 'adminpw' } })).json());
const AUTRE_SALON = execSync("mariadb -uroot -N salonq -e \"SELECT id FROM salons WHERE id != 's1' LIMIT 1\"").toString().trim();

(async () => {
  sql("DELETE FROM tpe_charge_jobs WHERE salon_id='s1'; DELETE FROM bridge_keys WHERE salon_id='s1';");
  sql("INSERT INTO bridge_keys (id, salon_id, key_hash, key_preview, created_at, last_seen_at) VALUES (UUID(), 's1', SHA2('fakekey',256), 'abcdef...', NOW(), NOW() - INTERVAL 25 SECOND)");

  console.log('\n[A] Pont silencieux depuis 25s, AUCUN paiement en cours : vrai defaut de connexion');
  let r = await status();
  check('hors ligne (25s > seuil rapide de 10s)', r.online === false, JSON.stringify(r));

  console.log('\n[B] Meme silence de 25s, mais un paiement carte est REELLEMENT en cours (statut processing)');
  sql("INSERT INTO tpe_charge_jobs (id, salon_id, amount_cents, status, created_at, updated_at) VALUES (UUID(), 's1', 2000, 'processing', NOW() - INTERVAL 25 SECOND, NOW() - INTERVAL 25 SECOND)");
  r = await status();
  check('en ligne quand meme (25s < tolerance de 130s pendant un paiement)', r.online === true, JSON.stringify(r));

  console.log('\n[C] Silence de 25s ET un paiement, mais DEJA termine (status done, plus en cours)');
  sql("UPDATE tpe_charge_jobs SET status='done' WHERE salon_id='s1'");
  r = await status();
  check('redevient hors ligne (le paiement termine ne justifie plus le silence)', r.online === false, JSON.stringify(r));

  console.log('\n[D] Un paiement en cours pour un AUTRE salon ne tolere pas le silence de CELUI-CI');
  sql(`INSERT INTO tpe_charge_jobs (id, salon_id, amount_cents, status, created_at, updated_at) VALUES (UUID(), '${AUTRE_SALON}', 2000, 'processing', NOW(), NOW())`);
  r = await status();
  check('reste hors ligne (paiement d\'un salon different, sans rapport)', r.online === false, JSON.stringify(r));

  console.log('\n[E] Un paiement en cours mais silence de PLUS de 130s : redevient hors ligne (le pont a fini par vraiment lacher)');
  sql("UPDATE bridge_keys SET last_seen_at = NOW() - INTERVAL 140 SECOND WHERE salon_id='s1'");
  sql("UPDATE tpe_charge_jobs SET status='processing' WHERE salon_id='s1' AND amount_cents=2000 AND salon_id='s1'");
  r = await status();
  check('hors ligne (140s > 130s, meme avec un paiement en cours)', r.online === false, JSON.stringify(r));

  sql(`DELETE FROM tpe_charge_jobs WHERE salon_id IN ('s1','${AUTRE_SALON}'); DELETE FROM bridge_keys WHERE salon_id='s1';`);
  console.log(`\nRESULTAT : ${pass} verifications reussies, ${fail} echec(s)`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('ERREUR TEST', e); process.exit(2); });
