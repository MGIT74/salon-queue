// Changer l'identifiant (slug) d'un salon - ex. "le-salon" -> "the-barber-one-oyonnax" - SANS casser aucun lien deja
// distribue : l'ancien identifiant reste valable pour toujours (alias) et reste reserve. Reserve au super-admin.
// Contre un VRAI serveur (SUPER_ADMIN_PASSWORD et SIGNUP_ENABLED fournis) et la vraie base de test.
const { spawn, execSync } = require('child_process');
const path = require('path');
const ROOT = path.join(__dirname, '../..');
const sql = (q) => execSync('mariadb -uroot -N salonq', { input: q }).toString().trim();
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n + (x ? '  [' + x + ']' : '')); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const PORT = 4060, BASE = 'http://127.0.0.1:' + PORT, SUPER = 'superpw-test';
const call = async (method, p, body, headers) => { const r = await fetch(BASE + p, { method, headers: Object.assign({ 'Content-Type': 'application/json' }, headers || {}), body: body ? JSON.stringify(body) : undefined }); return { s: r.status, b: await r.json().catch(() => ({})) }; };
const sa = (method, p, body, pw) => call(method, p, body, { 'X-Super-Admin-Password': pw === undefined ? SUPER : pw });
const asSalon = (slug, p) => call('GET', p, null, { 'X-Salon-Slug': slug });
const setSlug = (id, slug) => sa('PUT', '/api/super/salons/' + id + '/slug', { slug });

(async () => {
  const clean = () => { sql("DELETE FROM queue WHERE client_name='ZT Alias'; DELETE FROM salons WHERE id IN ('zt-a','zt-b'); DELETE FROM owners WHERE id='zt-o';"); };
  clean();
  sql("INSERT INTO owners (id, name, email, email_verified) VALUES ('zt-o','ZT Proprietaire','zt-owner-alias@example.com',1);" +
      "INSERT INTO salons (id, owner_id, name, slug, admin_password) VALUES ('zt-a','zt-o','ZT Salon A','zt-ancien',''),('zt-b','zt-o','ZT Salon B','zt-autre','');" +
      "INSERT INTO settings (salon_id, `key`, value) VALUES ('zt-a','salon_name','ZT Salon A'),('zt-b','salon_name','ZT Salon B');" +
      "INSERT INTO queue (id,salon_id,client_name,barber_id,service_id,status,checkin_at,is_appointment,total_price_cents) VALUES ('zt-q-alias','zt-a','ZT Alias',NULL,NULL,'waiting',NOW(),0,0);");
  const server = spawn('node', ['server.js'], { cwd: ROOT, env: { PATH: process.env.PATH, HOME: process.env.HOME, DB_HOST: '127.0.0.1', DB_USER: 'sq', DB_PASSWORD: 'sqpass', DB_NAME: 'salonq', PORT: String(PORT), SUPER_ADMIN_PASSWORD: SUPER, SIGNUP_ENABLED: 'true', SETTINGS_ENCRYPTION_KEY: 'testkeytestkeytestkeytestkey123456' } });
  try {
    for (let i = 0; i < 80; i++) { try { if ((await fetch(BASE + '/healthz')).ok) break; } catch (e) { /* pas pret */ } await sleep(250); }
    const nameOf = async (slug) => { const r = await asSalon(slug, '/api/settings/public'); return r.s === 200 ? r.b.salon_name : 'HTTP ' + r.s; };

    console.log('\n[A] Changer l\'identifiant : le NOUVEAU marche, l\'ANCIEN aussi (meme salon)');
    check('avant : seul "zt-ancien" existe', await nameOf('zt-ancien') === 'ZT Salon A' && await nameOf('zt-nouveau') === 'HTTP 404');
    let r = await setSlug('zt-a', 'zt-nouveau');
    check('changement accepte (200) : zt-ancien -> zt-nouveau', r.s === 200 && r.b.slug === 'zt-nouveau' && r.b.previous === 'zt-ancien', r.s + ' ' + JSON.stringify(r.b));
    check('le NOUVEL identifiant mene au salon', await nameOf('zt-nouveau') === 'ZT Salon A');
    check('l\'ANCIEN identifiant mene TOUJOURS au meme salon (les liens deja distribues continuent de marcher)', await nameOf('zt-ancien') === 'ZT Salon A');
    const q1 = await asSalon('zt-ancien', '/api/queue'), q2 = await asSalon('zt-nouveau', '/api/queue');
    check('les DONNEES sont les memes avec l\'un ou l\'autre (file d\'attente : meme client)', q1.s === 200 && q2.s === 200 && JSON.stringify(q1.b.queue.map(x => x.id)) === JSON.stringify(q2.b.queue.map(x => x.id)) && q2.b.queue.some(x => x.id === 'zt-q-alias'));
    check('un identifiant inconnu reste refuse (404)', await nameOf('zt-inconnu') === 'HTTP 404');
    check('le salon voisin n\'est pas touche', await nameOf('zt-autre') === 'ZT Salon B');
    check('en base : slug actuel + ancien identifiant en alias', sql("SELECT slug FROM salons WHERE id='zt-a'") === 'zt-nouveau' && sql("SELECT slug FROM salon_slug_aliases WHERE salon_id='zt-a'") === 'zt-ancien');

    console.log('\n[B] Plusieurs changements de suite : TOUS les anciens identifiants restent valables');
    await setSlug('zt-a', 'zt-final');
    check('3 identifiants (ancien, intermediaire, final) menent au meme salon', await nameOf('zt-ancien') === 'ZT Salon A' && await nameOf('zt-nouveau') === 'ZT Salon A' && await nameOf('zt-final') === 'ZT Salon A');
    r = await setSlug('zt-a', 'zt-ancien');
    check('revenir a un ancien identifiant du MEME salon est permis', r.s === 200 && sql("SELECT slug FROM salons WHERE id='zt-a'") === 'zt-ancien', r.s + ' ' + JSON.stringify(r.b));
    check('...il n\'est plus un alias, les deux autres le restent', sql("SELECT GROUP_CONCAT(slug ORDER BY slug) FROM salon_slug_aliases WHERE salon_id='zt-a'") === 'zt-final,zt-nouveau');
    check('...et les trois fonctionnent toujours', await nameOf('zt-ancien') === 'ZT Salon A' && await nameOf('zt-nouveau') === 'ZT Salon A' && await nameOf('zt-final') === 'ZT Salon A');
    check('changer pour l\'identifiant qu\'il a deja : aucun effet (200, "unchanged")', (await setSlug('zt-a', 'zt-ancien')).b.unchanged === true);

    console.log('\n[C] Un ancien identifiant reste RESERVE : personne d\'autre ne peut le reprendre');
    check('un AUTRE salon ne peut pas prendre un identifiant actuel (409)', (await setSlug('zt-b', 'zt-ancien')).s === 409);
    check('un AUTRE salon ne peut pas prendre un ANCIEN identifiant (409) - sinon il detournerait les liens', (await setSlug('zt-b', 'zt-nouveau')).s === 409);
    check('creer un salon avec un ancien identifiant (super-admin) : refuse (409)', (await sa('POST', '/api/super/salons', { name: 'Intrus', slug: 'zt-nouveau', admin_password: 'motdepasse1' })).s === 409);
    let cs = await call('GET', '/api/signup/check-slug?slug=zt-nouveau');
    check('la verification d\'identifiant de l\'inscription : "zt-nouveau" indisponible', cs.s === 200 && cs.b.available === false, JSON.stringify(cs.b));
    cs = await call('GET', '/api/signup/check-slug?slug=zt-libre-' + Date.now());
    check('...et un identifiant vraiment libre : disponible', cs.b.available === true);

    console.log('\n[D] Regles et securite');
    check('majuscules refusees (400)', (await setSlug('zt-a', 'Zt-Majuscule')).s === 400);
    check('espace refuse (400)', (await setSlug('zt-a', 'deux mots')).s === 400);
    check('accent refuse (400)', (await setSlug('zt-a', 'caf\u00e9')).s === 400);
    check('vide refuse (400)', (await setSlug('zt-a', '')).s === 400);
    check('plus de 80 caracteres refuse (400)', (await setSlug('zt-a', 'a'.repeat(81))).s === 400);
    check('salon inconnu : 404', (await setSlug('zt-n-existe-pas', 'zt-x')).s === 404);
    check('SANS le mot de passe super-admin : refuse (401)', (await sa('PUT', '/api/super/salons/zt-a/slug', { slug: 'zt-pirate' }, '')).s === 401 && sql("SELECT slug FROM salons WHERE id='zt-a'") === 'zt-ancien');
    check('un proprietaire ne peut PAS le faire lui-meme (pas de route cote tableau de bord)', (await call('PUT', '/api/owner/salons/zt-a/slug', { slug: 'zt-x' }, { 'X-Salon-Slug': 'zt-ancien' })).s >= 400);

    console.log('\n[E] Cas limites');
    const own = await sa('GET', '/api/super/owners');
    const salonA = own.b.items.find(o => o.id === 'zt-o').salons.find(x => x.id === 'zt-a');
    check('la liste du super-admin indique les anciens identifiants du salon', JSON.stringify(salonA.old_slugs.slice().sort()) === JSON.stringify(['zt-final', 'zt-nouveau']), JSON.stringify(salonA.old_slugs));
    sql("UPDATE salons SET active=0 WHERE id='zt-a'");
    check('salon DESACTIVE : l\'ancien identifiant est refuse comme l\'actuel (404)', await nameOf('zt-nouveau') === 'HTTP 404' && await nameOf('zt-ancien') === 'HTTP 404');
    sql("UPDATE salons SET active=1 WHERE id='zt-a'");
    sql("INSERT INTO salon_slug_aliases (slug, salon_id) VALUES ('zt-autre','zt-a')");   // cas anormal force : alias == identifiant actuel d'un autre salon
    check('si un alias et un identifiant actuel se confondaient (cas anormal), l\'identifiant ACTUEL l\'emporte', await nameOf('zt-autre') === 'ZT Salon B');
    sql("DELETE FROM salon_slug_aliases WHERE slug='zt-autre'");
    sql("DELETE FROM salons WHERE id='zt-a'");
    check('supprimer un salon supprime aussi ses anciens identifiants', sql("SELECT COUNT(*) FROM salon_slug_aliases WHERE salon_id='zt-a'") === '0');
  } finally { server.kill('SIGKILL'); clean(); }
  console.log(`\nRESULTAT : ${pass} verifications reussies, ${fail} echec(s)`);
  process.exit(fail ? 1 : 0);
})().catch(e => { try { execSync('mariadb -uroot salonq', { input: "DELETE FROM salons WHERE id IN ('zt-a','zt-b'); DELETE FROM owners WHERE id='zt-o';" }); } catch (x) { /* ignore */ } console.error('ERREUR TEST', e); process.exit(2); });
