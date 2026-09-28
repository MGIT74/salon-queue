// Inscription publique : ouverte (comportement historique) ou fermee
// (SIGNUP_ENABLED=false, installation d'un client unique). Lance une SECONDE
// copie du serveur, inscription fermee, a cote du serveur de test (ouvert).
// Verifie aussi que fermer l'inscription ne casse RIEN d'autre.
const { spawn, execSync } = require('child_process');
const { JSDOM } = require('jsdom');
const path = require('path');
const OPEN = 'http://127.0.0.1:3999', CLOSED_PORT = 3998, CLOSED = 'http://127.0.0.1:' + CLOSED_PORT;
const sql = (q) => execSync(`mariadb -uroot salonq -N -e "${q.replace(/"/g,'\\"')}"`).toString().trim();
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n + (x ? '  [' + x + ']' : '')); };
const call = async (base, method, p, body, headers = {}) => {
  const r = await fetch(base + p, { method, headers: { 'Content-Type': 'application/json', ...headers }, body: body ? JSON.stringify(body) : undefined });
  let j = null; try { j = await r.json(); } catch (e) {}
  return { status: r.status, body: j };
};
const SIGNUP_BODY = { owner_name: 'Intrus', salon_name: 'Salon Intrus', slug: 'salon-intrus', siret: '12345678901234', email: 'intrus@example.com', phone: '+33612345678', password: 'MotDePasse123!' };

(async () => {
  sql("DELETE FROM salons WHERE slug IN ('salon-intrus','salon-du-client','salon-annexe'); DELETE FROM owners WHERE email IN ('intrus@example.com','client@example.com');");

  console.log('\n[O] Serveur de test : inscription OUVERTE (reglage absent)');
  let r = await call(OPEN, 'GET', '/api/signup/status');
  check('/api/signup/status -> enabled:true', r.status === 200 && r.body.enabled === true, JSON.stringify(r.body));
  r = await call(OPEN, 'POST', '/api/signup', {});
  check('POST /api/signup (corps vide) : refus de VALIDATION 400, pas de blocage 403', r.status === 400 && !r.body.signup_closed, r.status + ' ' + (r.body && r.body.error));
  r = await call(OPEN, 'GET', '/api/signup/check-slug?slug=test');
  check('check-slug repond normalement', r.status === 200 && r.body.available === false, JSON.stringify(r.body));

  console.log('\n[F] Seconde copie du serveur, inscription FERMEE (SIGNUP_ENABLED=false)');
  const child = spawn('node', ['server.js'], {
    cwd: path.join(__dirname, '../..'),
    env: { ...process.env, PORT: String(CLOSED_PORT), SIGNUP_ENABLED: 'false', SUPER_ADMIN_PASSWORD: 'sa-test',
      DB_HOST: process.env.DB_HOST || '127.0.0.1', DB_USER: process.env.DB_USER || 'sq', DB_PASSWORD: process.env.DB_PASSWORD || 'sqpass',
      DB_NAME: process.env.DB_NAME || 'salonq', SETTINGS_ENCRYPTION_KEY: process.env.SETTINGS_ENCRYPTION_KEY || 'testkeytestkeytestkeytestkey123456' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let logs = ''; child.stdout.on('data', d => logs += d); child.stderr.on('data', d => logs += d);
  try {
    for (let i = 0; i < 30; i++) { try { const x = await fetch(CLOSED + '/api/signup/status'); if (x.ok) break; } catch (e) {} await sleep(500); }

    check('le journal de demarrage annonce "FERMEE"', /Inscription publique de salons : FERMEE/.test(logs), logs.split('\n').find(l => /\[config\]/.test(l)));
    r = await call(CLOSED, 'GET', '/api/signup/status');
    check('/api/signup/status -> enabled:false', r.status === 200 && r.body.enabled === false, JSON.stringify(r.body));

    const owners0 = sql("SELECT COUNT(*) FROM owners"), salons0 = sql("SELECT COUNT(*) FROM salons");
    r = await call(CLOSED, 'POST', '/api/signup', SIGNUP_BODY);
    check('POST /api/signup avec un corps VALIDE -> 403 "inscriptions fermees"', r.status === 403 && r.body.signup_closed === true, r.status + ' ' + (r.body && r.body.error));
    check('aucun compte ni salon n\'a ete cree', sql("SELECT COUNT(*) FROM owners") === owners0 && sql("SELECT COUNT(*) FROM salons") === salons0);
    r = await call(CLOSED, 'GET', '/api/signup/check-slug?slug=quelconque');
    check('check-slug -> 403 aussi', r.status === 403 && r.body.signup_closed === true, String(r.status));

    console.log('\n[R] Ce qui doit continuer a marcher inscription fermee');
    r = await call(CLOSED, 'POST', '/api/signup/forgot-password', { email: 'inconnu@example.com' });
    check('mot de passe oublie (compte existant) : pas bloque', r.status !== 403, String(r.status));
    r = await call(CLOSED, 'POST', '/api/signup/resend-verification', { email: 'inconnu@example.com' });
    check('renvoi du mail de verification : pas bloque', r.status !== 403, String(r.status));
    r = await call(CLOSED, 'POST', '/api/signup/login-lookup', { email: 'inconnu@example.com' });
    check('connexion par email : pas bloquee', r.status !== 403, String(r.status));
    r = await call(CLOSED, 'POST', '/api/client-auth/signup', {}, { 'X-Salon-Slug': 'test' });
    check('inscription d\'un CLIENT FINAL d\'un salon : pas concernee (validation 400)', r.status === 400 && !(r.body && r.body.signup_closed), r.status + ' ' + (r.body && r.body.error));
    r = await call(CLOSED, 'POST', '/api/barbers/login', { pin: '1111', source: 'caisse' }, { 'X-Salon-Slug': 'test' });
    check('connexion d\'un coiffeur a la caisse : normale', r.status === 200 && r.body.ok === true, String(r.status));

    console.log('\n[S] Le super administrateur peut creer le compte du client (voie normale quand c\'est ferme)');
    r = await call(CLOSED, 'POST', '/api/super/salons', { name: 'Salon du client', slug: 'salon-du-client', admin_password: 'MotDePasseClient1!', email: 'client@example.com', owner_name: 'Le Client' }, { 'X-Super-Admin-Password': 'sa-test' });
    check('creation d\'un salon + compte propriétaire par le super admin : ' + r.status, r.status === 200 || r.status === 201, JSON.stringify(r.body).slice(0, 120));
    check('le salon existe bien en base', sql("SELECT COUNT(*) FROM salons WHERE slug='salon-du-client'") === '1');
    r = await call(CLOSED, 'POST', '/api/super/salons', { name: 'X', slug: 'x-non', admin_password: 'x' }, {});
    check('sans le mot de passe super admin : refuse', r.status === 401 || r.status === 403, String(r.status));

    console.log('\n[M] "Mes salons" : un proprietaire existant peut toujours ajouter un salon');
    r = await call(CLOSED, 'POST', '/api/owner/salons', { name: 'Salon annexe', slug: 'salon-annexe' }, { 'X-Salon-Slug': 'test', 'X-Admin-Password': 'adminpw' });
    check('ajout d\'un salon par son proprietaire : ' + r.status, r.status === 200 || r.status === 201, JSON.stringify(r.body).slice(0, 120));

    console.log('\n[P] Les pages');
    const page = async (base, file, waitMs) => {
      const dom = await JSDOM.fromURL(base + '/' + file, { runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true,
        beforeParse(w) { w.fetch = (u, o) => fetch(new URL(String(u), base).href, o); } });
      await sleep(waitMs); return dom.window;
    };
    let w = await page(CLOSED, 'signup.html', 1500);
    check('signup.html (ferme) : le formulaire est masque, le message est affiche',
      w.document.getElementById('form-card').style.display === 'none' && w.document.getElementById('closed-card').style.display === 'block');
    check('titre "Inscriptions fermees"', /Inscriptions fermées/.test(w.document.querySelector('.auth-title').textContent));
    w.close();
    w = await page(OPEN, 'signup.html', 1500);
    check('signup.html (ouvert) : le formulaire reste affiche', w.document.getElementById('form-card').style.display !== 'none' && w.document.getElementById('closed-card').style.display === 'none');
    w.close();
    w = await page(CLOSED, 'dashboard.html', 1800);
    check('connexion du dashboard (ferme) : le lien "Creer mon salon" reste MASQUE', w.document.getElementById('signup-link-row').style.display === 'none');
    w.close();
    w = await page(OPEN, 'dashboard.html', 1800);
    check('connexion du dashboard (ouvert) : le lien "Creer mon salon" apparait', w.document.getElementById('signup-link-row').style.display === '');
    w.close();
  } finally {
    child.kill('SIGTERM');
    sql("DELETE FROM salons WHERE slug IN ('salon-intrus','salon-du-client','salon-annexe'); DELETE FROM owners WHERE email IN ('intrus@example.com','client@example.com');");
  }

  console.log(`\nRESULTAT : ${pass} verifications reussies, ${fail} echec(s)`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('ERREUR TEST', e); process.exit(2); });
