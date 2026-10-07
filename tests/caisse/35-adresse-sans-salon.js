// Adresse SANS nom de salon (compte.html, rdv.html sans ?salon=...). Signale : la page "Mon compte" s'ouvrait sur
// "LE SALON" avec "Creer un compte" - en realite le salon "par defaut" que la base cree toute seule - sans que la
// personne sache dans quel salon elle s'inscrit (ou reserve). Quand la plateforme heberge PLUSIEURS salons, une telle
// adresse est ambigue : message neutre "Lien incomplet", sans formulaire, et appels du compte client refuses cote
// serveur. Une installation a UN seul salon garde son comportement. Verifie aussi : AUCUN moyen de creer un salon
// (enseigne) depuis ces pages (SIGNUP_ENABLED=false).
const { spawn, execSync } = require('child_process');
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '../..');
const sql = (q) => execSync(`mariadb -uroot -N salonq -e "${q.replace(/"/g, '\\"')}"`).toString().trim();
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n + (x ? '  [' + x + ']' : '')); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const PORT = 4040, BASE = 'http://127.0.0.1:' + PORT;
const call = async (method, p, body, slug) => { const h = { 'Content-Type': 'application/json' }; if (slug) h['X-Salon-Slug'] = slug; const r = await fetch(BASE + p, { method, headers: h, body: body ? JSON.stringify(body) : undefined }); return { s: r.status, b: await r.json().catch(() => ({})) }; };

(async () => {
  const clean = () => { sql("DELETE FROM clients WHERE email LIKE 'zt-salon-%'"); sql("DELETE FROM salons WHERE id='s2'"); };
  clean();
  const wasActive = sql("SELECT GROUP_CONCAT(id) FROM salons WHERE active=1");   // etat de depart, a retablir a la fin
  const server = spawn('node', ['server.js'], { cwd: ROOT, env: { PATH: process.env.PATH, HOME: process.env.HOME, DB_HOST: '127.0.0.1', DB_USER: 'sq', DB_PASSWORD: 'sqpass', DB_NAME: 'salonq', PORT: String(PORT), SIGNUP_ENABLED: 'false', SETTINGS_ENCRYPTION_KEY: 'testkeytestkeytestkeytestkey123456' } });
  try {
    for (let i = 0; i < 60; i++) { try { if ((await fetch(BASE + '/healthz')).ok) break; } catch (e) { /* pas pret */ } await sleep(250); }
    const nSalons = Number(sql("SELECT COUNT(*) FROM salons s JOIN owners o ON o.id=s.owner_id WHERE s.active=1 AND o.active=1"));
    console.log('\n[A] Plusieurs salons (cas de la production) : une adresse sans nom de salon n\'ouvre rien (salons actifs avant : ' + nSalons + ')');
    sql("INSERT INTO salons (id, owner_id, name, slug, admin_password) VALUES ('s2','o1','Salon Deux','salon-deux','')");
    let r = await call('GET', '/api/signup/status');
    check('la plateforme se declare multi-salons (/api/signup/status)', r.s === 200 && r.b.multi_salon === true, JSON.stringify(r.b));
    r = await call('POST', '/api/client-auth/signup', { name: 'X', email: 'zt-salon-1@example.com', phone: '+33600000021', password: 'motdepasse1' });
    check('inscription client SANS salon : refusee (400, "Salon non precise"), pas de 500', r.s === 400 && r.b.needs_salon === true && /Salon non précisé/.test(r.b.error), r.s + ' ' + JSON.stringify(r.b));
    check('...et AUCUN compte n\'a ete cree dans le salon par defaut', sql("SELECT COUNT(*) FROM clients WHERE email='zt-salon-1@example.com'") === '0');
    check('connexion client SANS salon : refusee (400)', (await call('POST', '/api/client-auth/login', { email: 'a@b.fr', password: 'x' })).s === 400);
    check('mot de passe oublie client SANS salon : refuse (400)', (await call('POST', '/api/client-auth/forgot-password', { email: 'a@b.fr' })).s === 400);
    r = await call('POST', '/api/client-auth/signup', { name: 'Client', email: 'zt-salon-2@example.com', phone: '+33600000022', password: 'motdepasse1' }, 'salon-deux');
    check('MEME inscription AVEC le nom du salon : acceptee, rattachee a CE salon', r.s === 200 && sql("SELECT COUNT(*) FROM clients c JOIN salons s ON s.id=c.salon_id WHERE c.email='zt-salon-2@example.com' AND s.slug='salon-deux'") === '1', r.s + ' ' + JSON.stringify(r.b));
    check('un nom de salon INCONNU reste refuse comme avant (404)', (await call('POST', '/api/client-auth/login', { email: 'a@b.fr', password: 'x' }, 'salon-qui-n-existe-pas')).s === 404);

    console.log('\n[B] Aucun moyen de CREER un salon depuis ces pages (inscriptions fermees)');
    r = await call('GET', '/api/signup/status');
    check('inscriptions fermees (enabled=false)', r.b.enabled === false, JSON.stringify(r.b));
    r = await call('POST', '/api/signup', { name: 'Mon salon', email: 'pirate@example.com', password: 'motdepasse1', salon_name: 'Mon salon', slug: 'mon-salon' });
    check('creer une enseigne : refuse (403, "inscriptions fermees")', r.s === 403 && r.b.signup_closed === true, r.s + ' ' + JSON.stringify(r.b));
    check('verifier la disponibilite d\'un identifiant de salon : refuse aussi (403)', (await call('GET', '/api/signup/check-slug?slug=mon-salon')).s === 403);
    check('aucune enseigne ni salon cree', sql("SELECT COUNT(*) FROM owners WHERE email='pirate@example.com'") === '0' && sql("SELECT COUNT(*) FROM salons WHERE slug='mon-salon'") === '0');

    console.log('\n[C] UN seul salon (installation simple) : rien ne change');
    sql("DELETE FROM clients WHERE salon_id='s2'"); sql("DELETE FROM salons WHERE id='s2'");
    sql("UPDATE salons SET active=0 WHERE slug <> 'test'");   // un seul salon actif : 'test'
    r = await call('GET', '/api/signup/status');
    check('la plateforme n\'est plus multi-salons', r.b.multi_salon === false, JSON.stringify(r.b));
    r = await call('POST', '/api/client-auth/signup', { name: 'Client', email: 'zt-salon-3@example.com', phone: '+33600000023', password: 'motdepasse1' });
    check('inscription sans nom de salon : acceptee comme avant (salon par defaut)', r.s === 200 && sql("SELECT s.slug FROM clients c JOIN salons s ON s.id=c.salon_id WHERE c.email='zt-salon-3@example.com'") === 'test', r.s + ' ' + JSON.stringify(r.b));
  } finally {
    server.kill('SIGKILL'); clean();
    sql("UPDATE salons SET active=1 WHERE FIND_IN_SET(id, '" + wasActive + "')");   // remet les salons exactement comme avant le test
  }

  console.log('\n[D] Pages : message neutre, aucun formulaire (vraies fonctions)');
  for (const page of ['compte', 'rdv']) {
    const html = fs.readFileSync(path.join(ROOT, 'public', page + '.html'), 'utf8');
    check(page + '.html : entete qui masque la page sans ?salon=, regle CSS, message "Lien incomplet" et appel du controle', /classList\.add\('no-slug'\)/.test(html) && /html\.no-slug body > \*:not\(#no-salon\)/.test(html) && /<div id="no-salon" role="alert">[\s\S]*?Lien incomplet[\s\S]*?<\/div>/.test(html) && /guardMissingSalon\(\);/.test(html));
    const i = html.indexOf('function guardMissingSalon()'); const guardSrc = html.slice(i, html.indexOf('\n}\n', i) + 3);
    const make = (slug) => { const dom = new JSDOM('<html class="no-slug"><body><div id="no-salon" style="display:none"></div></body></html>', { runScripts: 'outside-only', url: 'http://localhost/' }); const w = dom.window; w.SALON_SLUG = slug; w.__fetched = 0; w.eval(guardSrc); return w; };
    const state = (w) => ({ hidden: w.document.documentElement.classList.contains('no-slug'), msg: w.document.getElementById('no-salon').style.display });
    let w = make(''); w.fetch = () => { w.__fetched++; return Promise.resolve({ json: () => Promise.resolve({ ok: true, enabled: false, multi_salon: true }) }); }; w.guardMissingSalon(); await sleep(40);
    check(page + ' : plusieurs salons -> message affiche, page toujours masquee', state(w).msg === 'flex' && state(w).hidden === true, JSON.stringify(state(w)));
    w = make(''); w.fetch = () => Promise.resolve({ json: () => Promise.resolve({ ok: true, multi_salon: false }) }); w.guardMissingSalon(); await sleep(40);
    check(page + ' : un seul salon -> la page est REVELEE, pas de message', state(w).hidden === false && state(w).msg === 'none', JSON.stringify(state(w)));
    w = make(''); w.fetch = () => Promise.reject(new Error('reseau')); w.guardMissingSalon(); await sleep(40);
    check(page + ' : serveur injoignable -> la page s\'ouvre comme avant (jamais bloquee)', state(w).hidden === false && state(w).msg === 'none');
    w = make('mon-salon'); w.fetch = () => { w.__fetched++; return Promise.resolve({ json: () => Promise.resolve({ multi_salon: true }) }); }; w.guardMissingSalon(); await sleep(40);
    check(page + ' : AVEC un nom de salon -> aucun appel, rien ne change (la page de tous les clients)', w.__fetched === 0 && state(w).msg === 'none');
  }
  { // filet de securite : si le serveur ne repond jamais, la page est quand meme revelee (4 s)
    const html = fs.readFileSync(path.join(ROOT, 'public/compte.html'), 'utf8'); const i = html.indexOf('function guardMissingSalon()');
    const dom = new JSDOM('<html class="no-slug"><body><div id="no-salon" style="display:none"></div></body></html>', { runScripts: 'outside-only', url: 'http://localhost/' });
    const w = dom.window; w.SALON_SLUG = ''; w.fetch = () => new Promise(() => {}); w.eval(html.slice(i, html.indexOf('\n}\n', i) + 3)); w.guardMissingSalon(); await sleep(4300);
    check('serveur qui ne repond jamais : la page est revelee apres 4 s (filet de securite)', !w.document.documentElement.classList.contains('no-slug'));
  }

  console.log(`\nRESULTAT : ${pass} verifications reussies, ${fail} echec(s)`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('ERREUR TEST', e); process.exit(2); });
