// Creation de compte CLIENT (compte.html). Signale en PRODUCTION : "Erreur interne du serveur" a l'inscription.
// Cause : la table clients exige owner_id (NOT NULL, sans valeur par defaut) et la requete ne l'envoyait plus depuis
// le passage "par salon" (10/08). Sur une base STRICTE - toute base neuve, donc la production - : 500. Ce test rejoue
// le parcours d'un client contre un VRAI serveur ; [F] verifie que AUCUNE requete du code n'oublie une colonne
// obligatoire (le defaut ne se voit que sur une base neuve) ; [G] l'ecran, avec les vraies fonctions.
const { spawn, execSync } = require('child_process');
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '../..');
const sql = (q) => execSync(`mariadb -uroot -N salonq -e "${q.replace(/"/g, '\\"')}"`).toString().trim();
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n + (x ? '  [' + x + ']' : '')); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const PORT = 4030, BASE = 'http://127.0.0.1:' + PORT;
const post = async (p, body, slug) => { const r = await fetch(BASE + p, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Salon-Slug': slug || 'test' }, body: JSON.stringify(body) }); return { s: r.status, b: await r.json().catch(() => ({})) }; };
const E = (n) => `zt-client-${n}@example.com`;

(async () => {
  const clean = () => { sql("DELETE FROM clients WHERE email LIKE 'zt-client-%'"); sql("DELETE FROM salons WHERE id='s2'"); };
  clean(); sql("INSERT INTO salons (id, owner_id, name, slug, admin_password) VALUES ('s2','o1','Salon Deux','salon-deux','')");
  const ownerOfTest = sql("SELECT owner_id FROM salons WHERE slug='test'");
  const server = spawn('node', ['server.js'], { cwd: ROOT, env: { PATH: process.env.PATH, HOME: process.env.HOME, DB_HOST: '127.0.0.1', DB_USER: 'sq', DB_PASSWORD: 'sqpass', DB_NAME: 'salonq', PORT: String(PORT), SETTINGS_ENCRYPTION_KEY: 'testkeytestkeytestkeytestkey123456' } });
  let log = ''; server.stdout.on('data', d => { log += d; }); server.stderr.on('data', d => { log += d; });
  try {
    for (let i = 0; i < 60; i++) { try { if ((await fetch(BASE + '/healthz')).ok) break; } catch (e) { /* pas pret */ } await sleep(250); }

    console.log('\n[A] Inscription d\'un client (base STRICTE) : plus d\'erreur 500');
    let r = await post('/api/client-auth/signup', { name: 'Client Test', email: E(1), phone: '+33600000011', password: 'motdepasse1', base_url: BASE + '/compte.html?salon=test' });
    check('inscription acceptee (200) - avant : 500 "Erreur interne du serveur"', r.s === 200 && r.b.ok === true, r.s + ' ' + JSON.stringify(r.b));
    check('aucune erreur "owner_id" dans le journal du serveur', !/owner_id|ER_NO_DEFAULT_FOR_FIELD/.test(log), (log.match(/Field[^\n]*/) || [''])[0]);
    const row = sql(`SELECT CONCAT(owner_id = '${ownerOfTest}', '/', salon_id = (SELECT id FROM salons WHERE slug='test'), '/', email_verified, '/', verify_token IS NOT NULL, '/', password_hash <> 'motdepasse1' AND LENGTH(password_hash) > 20) FROM clients WHERE email = '${E(1)}'`);
    check('rattache au proprietaire ET au salon du client, non confirme, jeton present, mot de passe CHIFFRE', row === '1/1/0/1/1', row);
    check('la reponse dit la verite sur l\'email : "email_sent" present (ici false : aucun SMTP configure sur ce salon)', r.b.email_sent === false && r.b.needs_email_verification === true, JSON.stringify(r.b));

    console.log('\n[B] Parcours complet : confirmation de l\'email puis connexion');
    r = await post('/api/client-auth/login', { email: E(1), password: 'motdepasse1' });
    check('connexion AVANT confirmation : refusee (403) avec l\'indication "confirmez votre email"', r.s === 403 && r.b.needs_email_verification === true, r.s + ' ' + JSON.stringify(r.b));
    const t0 = sql(`SELECT verify_token FROM clients WHERE email = '${E(1)}'`);
    r = await post('/api/client-auth/resend-verification', { email: E(1), base_url: BASE + '/compte.html?salon=test' });
    const t1 = sql(`SELECT verify_token FROM clients WHERE email = '${E(1)}'`);
    check('"Renvoyer le lien" : reponse neutre (ne revele pas si le compte existe) et NOUVEAU jeton genere', r.s === 200 && r.b.ok === true && t1 && t1 !== t0, r.s);
    r = await post('/api/client-auth/verify-email', { token: t1 });
    check('le lien du nouveau jeton confirme le compte', r.s === 200 && sql(`SELECT email_verified FROM clients WHERE email='${E(1)}'`) === '1');
    r = await post('/api/client-auth/login', { email: E(1), password: 'motdepasse1' });
    check('connexion APRES confirmation : acceptee, avec un jeton de session', r.s === 200 && typeof r.b.token === 'string' && r.b.token.length > 20);
    const me = await (await fetch(BASE + '/api/client-auth/me', { headers: { 'X-Salon-Slug': 'test', 'X-Client-Token': r.b.token } })).json();
    check('"Mon compte" repond avec ce client', JSON.stringify(me).includes(E(1)), JSON.stringify(me).slice(0, 80));
    check('mauvais mot de passe : 401', (await post('/api/client-auth/login', { email: E(1), password: 'faux-mot-de-passe' })).s === 401);

    console.log('\n[C] Regles inchangees');
    check('meme email, meme salon : 409 "Un compte existe deja"', (await post('/api/client-auth/signup', { name: 'Autre', email: E(1), phone: '+33600000012', password: 'motdepasse1' })).s === 409);
    r = await post('/api/client-auth/signup', { name: 'Client Test', email: E(1), phone: '+33600000013', password: 'motdepasse1' }, 'salon-deux');
    check('meme email dans un AUTRE salon : accepte (un compte par salon), rattache a CE salon', r.s === 200 && sql(`SELECT COUNT(*) FROM clients c JOIN salons s ON s.id=c.salon_id WHERE c.email='${E(1)}' AND s.slug='salon-deux'`) === '1', r.s + ' ' + JSON.stringify(r.b));
    check('email invalide : 400', (await post('/api/client-auth/signup', { name: 'X', email: 'pas-un-email', phone: '+33600000014', password: 'motdepasse1' })).s === 400);
    check('telephone manquant : 400', (await post('/api/client-auth/signup', { name: 'X', email: E(2), password: 'motdepasse1' })).s === 400);
  } finally { server.kill('SIGKILL'); clean(); }

  console.log('\n[F] AUCUNE requete d\'insertion du code n\'oublie une colonne obligatoire (le defaut ne se voit que sur une base neuve)');
  {
    const rows = execSync(`mariadb -uroot -N salonq -e "SELECT table_name, column_name FROM information_schema.columns WHERE table_schema='salonq' AND is_nullable='NO' AND column_default IS NULL AND extra NOT LIKE '%auto_increment%' AND extra NOT LIKE '%GENERATED%'"`).toString().trim().split('\n').map(l => l.split('\t'));
    const required = {}; rows.forEach(([t, c]) => { (required[t] = required[t] || new Set()).add(c); });
    const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? (e.name === 'node_modules' ? [] : walk(path.join(d, e.name))) : (e.name.endsWith('.js') ? [path.join(d, e.name)] : []));
    const files = [...walk(path.join(ROOT, 'src')), path.join(ROOT, 'server.js'), ...walk(path.join(ROOT, 'scripts'))];
    let found = 0, clientsSeen = false; const bad = [];
    for (const f of files) {
      const src = fs.readFileSync(f, 'utf8').replace(/\\`/g, '`');   // les accents graves echappes d'un gabarit JS
      const re = /INSERT\s+(?:IGNORE\s+)?INTO\s+([`\w$\{\}\.]+)\s*\(([^)]*)\)/gi; let m;
      while ((m = re.exec(src))) {
        const table = m[1].replace(/`/g, ''); if (/\$\{/.test(table)) continue;   // table dynamique : verifiee par ses propres tests
        const cols = m[2].split(',').map(s => s.trim().replace(/`/g, '')).filter(Boolean); found++;
        if (table === 'clients' && cols.includes('owner_id')) clientsSeen = true;
        const missing = [...(required[table] || [])].filter(c => !cols.includes(c));
        if (missing.length) bad.push(path.relative(ROOT, f) + ' : INSERT INTO ' + table + ' sans ' + missing.join(', '));
      }
    }
    check('l\'analyse couvre bien le code (' + found + ' requetes INSERT lues, dont celle des clients avec owner_id)', found >= 60 && clientsSeen, found + ' / clients ok=' + clientsSeen);
    check('aucune requete INSERT ne manque de colonne obligatoire', bad.length === 0, bad.join(' | '));
  }

  console.log('\n[G] Ecran (compte.html) : vraies fonctions');
  {
    const html = fs.readFileSync(path.join(ROOT, 'public/compte.html'), 'utf8');
    const fn = (name) => { const i = html.indexOf('function ' + name + '('); const j = html.indexOf('\nfunction ', i + 10); return html.slice(i, j === -1 ? undefined : j); };
    const mk = () => {
      const dom = new JSDOM(`<input id="su-name" value="Adel"><input id="su-email" value="a@b.fr"><input id="su-phone" value="619720883"><select id="su-phone-country"><option value="+33">+33</option></select><input id="su-pass" value="secret1">
        <div id="signup-err"></div><h1 id="check-title">Vérifiez vos emails</h1><div id="check-msg">Un email de confirmation vient de vous être envoyé. X</div>
        <input id="li-email" value="a@b.fr"><input id="li-pass" value="secret1"><div id="login-err"></div><button id="resend-btn" style="display:none"></button>`, { runScripts: 'outside-only', url: 'http://localhost/' });
      const w = dom.window; w.__calls = []; w.__shown = []; w.SALON_SLUG = 'le-salon';
      w.composePhone = (c, p) => c + p; w.show = (id) => w.__shown.push(id); w.baseUrl = () => 'http://x/compte.html?salon=le-salon'; w.loadProfile = () => {};
      w.eval(fn('api') + fn('doSignup') + fn('doLogin') + fn('doResendVerification'));
      return w;
    };
    const respond = (w, status, data) => { w.fetch = (p, o) => { w.__calls.push({ p, body: o.body && JSON.parse(o.body) }); return Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(data) }); }; };
    let w = mk(); respond(w, 200, { ok: true, needs_email_verification: true, email_sent: false }); w.doSignup(); await sleep(30);
    check('email NON envoye : l\'ecran ne ment plus - "Compte cree" + explication', /Compte créé/.test(w.document.getElementById('check-title').textContent) && /n'a pas pu être envoyé/.test(w.document.getElementById('check-msg').textContent) && w.__shown.includes('p-check-email'));
    w = mk(); respond(w, 200, { ok: true, needs_email_verification: true, email_sent: true }); w.doSignup(); await sleep(30);
    check('email envoye : message habituel "Vérifiez vos emails"', w.document.getElementById('check-title').textContent === 'Vérifiez vos emails' && /vient de vous être envoyé/.test(w.document.getElementById('check-msg').textContent));
    w = mk(); respond(w, 200, { ok: true, needs_email_verification: true }); w.doSignup(); await sleep(30);
    check('ancien serveur (sans "email_sent") : message habituel, rien ne casse', w.document.getElementById('check-title').textContent === 'Vérifiez vos emails' && w.__shown.includes('p-check-email'));
    w = mk(); respond(w, 403, { error: 'Confirmez votre email avant de vous connecter', needs_email_verification: true }); w.doLogin(); await sleep(30);
    check('connexion refusee faute de confirmation : message + bouton "Renvoyer le lien" AFFICHE', /Confirmez votre email/.test(w.document.getElementById('login-err').textContent) && w.document.getElementById('resend-btn').style.display === '');
    w = mk(); respond(w, 401, { error: 'Email ou mot de passe incorrect' }); w.doLogin(); await sleep(30);
    check('autre erreur (mot de passe faux) : le bouton reste CACHE', w.document.getElementById('resend-btn').style.display === 'none');
    w = mk(); respond(w, 403, { error: 'x', needs_email_verification: true }); w.doLogin(); await sleep(30);
    respond(w, 200, { ok: true, message: 'Si un compte existe avec cet email et n\'est pas encore confirmé, un nouveau lien vient d\'être envoyé.' }); w.doResendVerification(); await sleep(30);
    const sent = w.__calls.filter(c => /resend-verification/.test(c.p))[0];
    check('"Renvoyer le lien" : appelle le serveur avec l\'email saisi et l\'adresse de retour', sent && sent.body.email === 'a@b.fr' && /compte\.html/.test(sent.body.base_url), JSON.stringify(sent && sent.body));
    check('...affiche la reponse et cache le bouton', /un nouveau lien/.test(w.document.getElementById('login-err').textContent) && w.document.getElementById('resend-btn').style.display === 'none');
  }

  console.log(`\nRESULTAT : ${pass} verifications reussies, ${fail} echec(s)`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('ERREUR TEST', e); process.exit(2); });
