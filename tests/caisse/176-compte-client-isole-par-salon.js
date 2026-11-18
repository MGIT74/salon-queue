// Compte client : un compte appartient à UN salon. Avant, le jeton d'Oyonnax ouvrait « Mon compte » de Valleiry
// (même enseigne) et y montrait le compte d'Oyonnax, sans pouvoir changer de salon.
// Maintenant : jeton refusé dans un autre salon (wrong_salon) ; un client qui a un compte confirmé (même email)
// dans les deux salons peut changer de salon sans retaper de mot de passe ; chaque salon garde son compte.
const { execSync } = require('child_process');
const fs = require('fs'), path = require('path');
const BASE = 'http://127.0.0.1:3999';
const sql = (q) => execSync(`mariadb -uroot salonq -N -e "${q.replace(/"/g, '\\"')}"`).toString().trim();
let pass = 0, fail = 0;
const check = (n, ok, extra) => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n + (ok || extra === undefined ? '' : '  -> ' + JSON.stringify(extra))); };
const call = async (slug, method, p, body, token) => {
  const h = { 'Content-Type': 'application/json', 'X-Salon-Slug': slug };
  if (token) h['X-Client-Token'] = token;
  const r = await fetch(BASE + p, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
  let j = null; try { j = await r.json(); } catch (e) {}
  return { status: r.status, body: j };
};

(async () => {
  const { hashPassword } = require('../../src/lib/password');
  const hash = await hashPassword('MotDePasse1!');
  const clean = "DELETE FROM clients WHERE id LIKE 't176-%'; DELETE FROM salons WHERE id IN ('t176-s2','t176-s3'); DELETE FROM owners WHERE id = 't176-o2'";
  sql(clean);
  sql("INSERT INTO salons (id, owner_id, name, slug, active) VALUES ('t176-s2', 'o1', 'Salon Deux', 't176-deux', 1)");
  sql("INSERT INTO owners (id, name, email, active) VALUES ('t176-o2', 'Autre enseigne', 't176@exemple.fr', 1)");
  sql("INSERT INTO salons (id, owner_id, name, slug, active) VALUES ('t176-s3', 't176-o2', 'Salon Ailleurs', 't176-ailleurs', 1)");
  const ins = (id, salon, email, verified) => sql(`INSERT INTO clients (id, owner_id, salon_id, name, email, phone, password_hash, email_verified) VALUES ('${id}', (SELECT owner_id FROM salons WHERE id='${salon}'), '${salon}', 'Eric', '${email}', '+33600000000', '${hash}', ${verified})`);
  ins('t176-a1', 's1', 'eric176@exemple.fr', 1);
  ins('t176-a2', 't176-s2', 'Eric176@exemple.fr', 1);         // même email (casse différente), salon 2 de la même enseigne
  ins('t176-a3', 't176-s3', 'eric176@exemple.fr', 1);         // même email, AUTRE enseigne : jamais proposé
  ins('t176-b1', 's1', 'solo176@exemple.fr', 1);              // compte seulement dans le salon 1
  ins('t176-c2', 't176-s2', 'nonconf176@exemple.fr', 0);      // compte non confirmé dans le salon 2
  ins('t176-c1', 's1', 'nonconf176@exemple.fr', 1);

  let r = await call('test', 'POST', '/api/client-auth/login', { email: 'solo176@exemple.fr', password: 'MotDePasse1!' });
  const solo = r.body && r.body.token;
  check('connexion au salon 1', !!solo, r);
  r = await call('t176-deux', 'GET', '/api/client-auth/me', null, solo);
  check('le jeton du salon 1 n\'ouvre PAS le salon 2 (wrong_salon)', r.status === 401 && r.body.wrong_salon === true, r);
  r = await call('test', 'GET', '/api/client-auth/me', null, solo);
  check('…mais ouvre toujours son salon', r.status === 200, r.status);
  r = await call('test', 'GET', '/api/client-auth/salons', null, solo);
  check('compte dans un seul salon : pas de sélecteur (1 salon)', r.body.items.length === 1, r.body);
  r = await call('test', 'POST', '/api/client-auth/switch', { slug: 't176-deux' }, solo);
  check('impossible de passer dans un salon où il n\'a pas de compte', r.status === 403, r);

  r = await call('test', 'POST', '/api/client-auth/login', { email: 'eric176@exemple.fr', password: 'MotDePasse1!' });
  const eric = r.body.token;
  r = await call('test', 'GET', '/api/client-auth/salons', null, eric);
  const slugs = (r.body.items || []).map((x) => x.slug).sort();
  check('deux comptes confirmés (même enseigne) : les 2 salons proposés, jamais l\'autre enseigne', JSON.stringify(slugs) === JSON.stringify(['t176-deux', 'test']) && r.body.current === 'test', r.body);
  r = await call('test', 'POST', '/api/client-auth/switch', { slug: 't176-deux' }, eric);
  check('changer de salon sans mot de passe -> nouveau jeton du salon 2', r.status === 200 && r.body.token && r.body.slug === 't176-deux', r);
  const eric2 = r.body.token;
  r = await call('t176-deux', 'GET', '/api/client-auth/me', null, eric2);
  check('le salon 2 montre SON compte (pas celui du salon 1)', r.status === 200 && sql("SELECT client_id FROM client_sessions WHERE token='" + eric2 + "'") === 't176-a2', r.status);
  r = await call('test', 'GET', '/api/client-auth/me', null, eric2);
  check('le nouveau jeton n\'ouvre pas le salon 1', r.status === 401 && r.body.wrong_salon === true, r);
  r = await call('test', 'POST', '/api/client-auth/switch', { slug: 't176-ailleurs' }, eric);
  check('jamais vers une autre enseigne', r.status === 403, r);

  r = await call('test', 'POST', '/api/client-auth/login', { email: 'nonconf176@exemple.fr', password: 'MotDePasse1!' });
  r = await call('test', 'GET', '/api/client-auth/salons', null, r.body.token);
  check('compte non confirmé dans l\'autre salon : pas proposé', r.body.items.length === 1, r.body);

  const c = fs.readFileSync(path.join(__dirname, '../../public/compte.html'), 'utf8');
  check('navigateur : un jeton par salon (client_token:<salon>), plus de jeton commun écrit', c.includes("function ctKey() { return 'client_token:' + (SALON_SLUG || ''); }") && !/localStorage\.setItem\('client_token',/.test(c) && c.includes('function adoptLegacyToken()'));
  check('sélecteur de salon dans « Mon compte »', c.includes('id="salon-switch"') && c.includes("api('/api/client-auth/switch'"));

  sql("DELETE FROM client_sessions WHERE client_id LIKE 't176-%'");
  sql(clean);
  console.log('\n' + pass + ' OK, ' + fail + ' ECHEC');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
