// Le schema (sql/schema.sql) est rejoue a CHAQUE demarrage. Il creait un proprietaire "Le Salon" (mot de passe connu
// 'change-moi') + un salon par defaut + des donnees de depart des qu'il n'y avait plus de salon par defaut : supprimer
// l'enseigne qui le possedait le faisait REAPPARAITRE au demarrage suivant, et vider les supplements d'un salon les
// faisait revenir au deploiement suivant. Tout ce qui est "de depart" ne se cree plus que sur une base VIERGE.
// Contre de vraies bases jetables + un vrai demarrage du serveur.
const { spawn, execSync } = require('child_process');
const path = require('path');
const ROOT = path.join(__dirname, '../..');
const DB = 'salonq_seedtest';
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n + (x ? '  [' + x + ']' : '')); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const q = (sql) => execSync(`mariadb -uroot -N ${DB}`, { input: sql }).toString().trim();
const root = (sql) => execSync('mariadb -uroot', { input: sql }).toString().trim();
const env = { PATH: process.env.PATH, HOME: process.env.HOME, DB_HOST: '127.0.0.1', DB_USER: 'sq', DB_PASSWORD: 'sqpass', DB_NAME: DB };
const apply = () => execSync('node scripts/apply-schema.js', { cwd: ROOT, env, stdio: 'pipe' }).toString().trim();   // leve une erreur si le schema echoue (code de sortie 1)
const counts = () => q("SELECT CONCAT(owners,'/',salons,'/',services,'/',extras,'/',defaut) FROM (SELECT (SELECT COUNT(*) FROM owners) owners, (SELECT COUNT(*) FROM salons) salons, (SELECT COUNT(*) FROM services) services, (SELECT COUNT(*) FROM extras) extras, (SELECT COUNT(*) FROM salons WHERE is_default=1) defaut) t");   // proprietaires/salons/prestations/supplements/salons par defaut
const reset = () => { root(`DROP DATABASE IF EXISTS ${DB}; CREATE DATABASE ${DB} CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci; GRANT ALL ON ${DB}.* TO 'sq'@'127.0.0.1'; FLUSH PRIVILEGES;`); };

(async () => {
  try {
    console.log('\n[A] PREMIERE installation (base vierge) : comme avant');
    reset(); apply();
    check('1 proprietaire "Le Salon", 1 salon par defaut "le-salon", 4 prestations et 6 supplements de depart', counts() === '1/1/4/6/1', counts());
    check('reglages de depart du salon par defaut presents (nom "Le Salon")', q("SELECT value FROM settings WHERE `key`='salon_name'") === 'Le Salon');
    apply();
    check('on rejoue le schema (chaque demarrage) : rien n\'est duplique', counts() === '1/1/4/6/1', counts());

    console.log('\n[B] Instance en SERVICE (ton cas) : supprimer l\'enseigne du salon par defaut ne la fait plus reapparaitre');
    q("INSERT INTO owners (id, name, email, email_verified) VALUES ('m1','Mounir','mounir@example.com',1)");
    q("INSERT INTO salons (id, owner_id, name, slug, is_default) VALUES ('m1s','m1','THE BARBER ONE - OYONNAX','oyonnax',0)");
    q("DELETE FROM owners WHERE name='Le Salon'");   // = "Supprimer" dans le super-admin (les salons partent en cascade)
    check('avant : plus de salon par defaut, une seule enseigne (Mounir)', counts() === '1/1/0/0/0', counts());
    let ok = true, out = ''; try { out = apply(); } catch (e) { ok = false; out = String(e.stderr || e.message); }
    check('le schema s\'applique SANS erreur meme sans salon par defaut (sinon le demarrage echouerait)', ok, out.slice(0, 120));
    check('"Le Salon" / "change-moi" NE REAPPARAIT PAS : toujours 1 enseigne (Mounir), 1 salon, 0 salon par defaut', counts() === '1/1/0/0/0' && q("SELECT COUNT(*) FROM owners WHERE name='Le Salon' OR admin_password='change-moi'") === '0', counts());
    check('aucune donnee de depart n\'est rattachee au vrai salon', q("SELECT COUNT(*) FROM services") === '0' && q("SELECT COUNT(*) FROM extras") === '0');
    apply(); check('et ca reste stable au demarrage suivant', counts() === '1/1/0/0/0', counts());

    console.log('\n[C] Salon par defaut REEL (Oyonnax) : ses donnees ne reviennent plus toutes seules');
    reset(); apply();
    q("UPDATE salons SET name='THE BARBER ONE - OYONNAX' WHERE is_default=1"); q("UPDATE owners SET name='Mounir', email='mounir@example.com', admin_password=NULL");
    q("DELETE FROM extras");   // le gerant retire tous ses supplements
    q("DELETE FROM services WHERE name <> 'Coupe'");
    apply();
    check('supplements supprimes : ILS NE REVIENNENT PAS au demarrage suivant (avant : les 6 d\'origine reapparaissaient)', q("SELECT COUNT(*) FROM extras") === '0', q("SELECT COUNT(*) FROM extras"));
    check('prestations supprimees : elles ne reviennent pas non plus (reste "Coupe")', q("SELECT GROUP_CONCAT(name) FROM services") === 'Coupe');
    check('aucun proprietaire ni salon ajoute', counts() === '1/1/1/0/1', counts());

    console.log('\n[D] Vraiment tout supprime : c\'est une installation neuve, comme au premier jour');
    q("DELETE FROM owners"); apply();
    check('plus aucun proprietaire -> base vierge -> le salon d\'attente est recree (comportement d\'une premiere installation)', counts() === '1/1/4/6/1', counts());

    console.log('\n[E] Vrai serveur sur une base SANS salon par defaut (etat de [B])');
    reset(); apply();
    q("INSERT INTO owners (id, name, email, email_verified) VALUES ('m1','Mounir','mounir@example.com',1)");
    q("INSERT INTO salons (id, owner_id, name, slug, is_default) VALUES ('m1s','m1','THE BARBER ONE - OYONNAX','oyonnax',0)");
    q("DELETE FROM owners WHERE name='Le Salon'");
    const server = spawn('node', ['server.js'], { cwd: ROOT, env: Object.assign({}, env, { PORT: '4050', SIGNUP_ENABLED: 'false', SETTINGS_ENCRYPTION_KEY: 'testkeytestkeytestkeytestkey123456' }) });
    let log = ''; server.stdout.on('data', d => { log += d; }); server.stderr.on('data', d => { log += d; });
    let up = false, exited = null; server.on('exit', (c) => { exited = c; });
    for (let i = 0; i < 80 && !up && exited === null; i++) { try { up = (await fetch('http://127.0.0.1:4050/healthz')).ok; } catch (e) { /* pas encore pret */ } if (!up) await sleep(250); }
    check('le serveur DEMARRE normalement', up, up ? '' : 'sorti=' + exited + ' | ' + log.replace(/\n/g, ' | ').slice(0, 300));
    check('...et annonce "[schema] base a jour", sans avertissement', /\[schema\] base a jour/.test(log) && !/ATTENTION/.test(log));
    if (up) {
      const bare = await fetch('http://127.0.0.1:4050/api/settings/public');
      check('adresse SANS nom de salon : refusee proprement (404 "Aucun salon par defaut"), pas de 500', bare.status === 404 && /Aucun salon par défaut/.test((await bare.json()).error));
      check('AVEC le nom du salon : tout fonctionne', (await fetch('http://127.0.0.1:4050/api/settings/public', { headers: { 'X-Salon-Slug': 'oyonnax' } })).status === 200);
    }
    server.kill('SIGKILL');
  } finally { try { root(`DROP DATABASE IF EXISTS ${DB}`); } catch (e) { /* ignore */ } }

  console.log('\n[F] Ta base de test habituelle : le schema n\'y change rien');
  {
    const sq = (s) => execSync('mariadb -uroot -N salonq', { input: s }).toString().trim();
    const before = sq("SELECT CONCAT((SELECT COUNT(*) FROM owners),'/',(SELECT COUNT(*) FROM salons),'/',(SELECT COUNT(*) FROM services),'/',(SELECT COUNT(*) FROM extras))");
    execSync('node scripts/apply-schema.js', { cwd: ROOT, env: Object.assign({}, env, { DB_NAME: 'salonq' }), stdio: 'pipe' });
    const after = sq("SELECT CONCAT((SELECT COUNT(*) FROM owners),'/',(SELECT COUNT(*) FROM salons),'/',(SELECT COUNT(*) FROM services),'/',(SELECT COUNT(*) FROM extras))");
    check('rejouer le schema sur une base deja en service ne cree ni ne supprime rien (' + before + ')', before === after, before + ' -> ' + after);
  }
  console.log(`\nRESULTAT : ${pass} verifications reussies, ${fail} echec(s)`);
  process.exit(fail ? 1 : 0);
})().catch(e => { try { root(`DROP DATABASE IF EXISTS ${DB}`); } catch (x) { /* ignore */ } console.error('ERREUR TEST', e); process.exit(2); });
