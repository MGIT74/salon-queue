// Tiroir (admin, caisse, poste) : le client a-t-il un compte client ? Compte (par email, sinon téléphone), proche
// d'un compte (« Mes proches »), sans compte, ou pas de coordonnées. + filtre « Compte » du menu Clients.
// Vraie base + vrai serveur (port 3999).
process.env.DB_HOST = process.env.DB_HOST || '127.0.0.1';
process.env.DB_USER = process.env.DB_USER || 'sq';
process.env.DB_PASSWORD = process.env.DB_PASSWORD || 'sqpass';
process.env.DB_NAME = process.env.DB_NAME || 'salonq';
process.env.SETTINGS_ENCRYPTION_KEY = process.env.SETTINGS_ENCRYPTION_KEY || 'testkeytestkeytestkeytestkey123456';
const path = require('path'), fs = require('fs');
const { pool } = require(path.join(__dirname, '../../src/db'));
const BASE = 'http://127.0.0.1:3999';
const ADMIN = { 'Content-Type': 'application/json', 'X-Salon-Slug': 'test', 'X-Admin-Password': 'adminpw' };
const BOB = { 'Content-Type': 'application/json', 'X-Salon-Slug': 'test', 'X-Barber-Id': 'b2', 'X-Barber-Pin': '2222' };
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n + (x ? '  [' + String(x).slice(0, 220) + ']' : '')); };
const get = async (p, h) => (await fetch(BASE + p, { headers: h || ADMIN })).json();
const acc = (q, h) => get('/api/queue/client-account?' + new URLSearchParams(q).toString(), h);

(async () => {
  const D = new Date(Date.now() - 2 * 864e5).toISOString().slice(0, 10);
  const clean = async () => {
    await pool.query("DELETE FROM queue WHERE client_name LIKE 'T188%' OR client_name = 'Lina'");
    await pool.query("DELETE FROM clients WHERE email LIKE '%@t188.test'");
  };
  await clean();
  try {
    const [[own]] = await pool.query("SELECT owner_id FROM salons WHERE id = 's1'");
    await pool.query("INSERT INTO clients (id, owner_id, salon_id, name, email, phone, password_hash, email_verified, created_at) VALUES ('t188c', ?, 's1', 'T188 Mounir', 'mounir@t188.test', '+33 6 11 22 33 44', 'x', 1, '2026-10-12 09:00:00')", [own.owner_id]);
    await pool.query("INSERT INTO client_relatives (id, client_id, name) VALUES ('t188r', 't188c', 'Lina')");

    console.log('\n[A] Compte ou pas');
    let r = await acc({ email: 'MOUNIR@t188.test', name: 'T188 Mounir' });
    check('email (majuscules ignorées) -> compte client, email vérifié, date de création', r.kind === 'account' && r.email_verified === true && /^2026-10-12/.test(r.created_at || ''), JSON.stringify(r));
    r = await acc({ phone: '06 11 22 33 44', name: 'T188 Mounir' });
    check('sans email, par le téléphone -> compte client', r.kind === 'account', JSON.stringify(r));
    r = await acc({ email: 'mounir@t188.test', name: 'Lina' });
    check('prénom d\'un de ses proches -> « proche de » + titulaire', r.kind === 'relative' && r.holder_name === 'T188 Mounir', JSON.stringify(r));
    r = await acc({ email: 'autre@t188.test', name: 'T188 Autre' });
    check('email inconnu -> sans compte', r.kind === 'none', JSON.stringify(r));
    r = await acc({ name: 'T188 Yh' });
    check('ni email ni téléphone -> on ne sait pas', r.kind === 'unknown', JSON.stringify(r));
    r = await acc({ email: 'mounir@t188.test', name: 'T188 Mounir' }, BOB);
    check('aussi pour un coiffeur (caisse, Mon poste)', r.kind === 'account', JSON.stringify(r));

    console.log('\n[B] Menu Clients : filtre Compte');
    await pool.query(`INSERT INTO queue (id, salon_id, client_name, email, phone, barber_id, service_id, status, checkin_at) VALUES
      ('t188q1','s1','T188 Mounir','mounir@t188.test',NULL,'b2','sv1','done',?), ('t188q2','s1','T188 Autre','autre@t188.test',NULL,'b2','sv1','done',?),
      ('t188q3','s1','Lina','mounir@t188.test',NULL,'b2','sv1','done',?)`, [D + ' 10:00:00', D + ' 11:00:00', D + ' 12:00:00']);
    const h = async (q) => ((await get('/api/queue/history?per_page=100&date_from=' + D + '&date_to=' + D + q)).items || []).filter((x) => /^T188|^Lina$/.test(x.client_name));
    let items = await h('&account=with');
    check('« Avec compte » : le titulaire et son proche', items.length === 2 && items.every((x) => x.account_kind === 'account' || x.account_kind === 'relative'), JSON.stringify(items.map((x) => [x.client_name, x.account_kind])));
    items = await h('&account=without');
    check('« Sans compte » : l\'autre client', items.length === 1 && items[0].client_name === 'T188 Autre', JSON.stringify(items.map((x) => x.client_name)));
    items = await h('');
    check('chaque ligne porte son compte (pastille « Compte »)', items.length === 3 && items.find((x) => x.client_name === 'T188 Mounir').account_kind === 'account', JSON.stringify(items.map((x) => [x.client_name, x.account_kind])));

    console.log('\n[C] Écrans');
    const app = fs.readFileSync(path.join(__dirname, '../../public/app.js'), 'utf8');
    const rd = (f) => fs.readFileSync(path.join(__dirname, '../../public', f), 'utf8');
    check('tiroirs admin, caisse, poste : ligne « compte client »', /function clientAccountHtml\(r\)/.test(app) && /loadClientAccount\('drawer-account', c, api\)/.test(rd('dashboard.html')) && ['caisse.html', 'poste.html'].every((f) => /loadClientAccount\('ad-account', a, barberApi\)/.test(rd(f)) && /id="ad-account"/.test(rd(f))));
    check('menu Clients : filtre « Compte »', /id="client-filter-account"/.test(rd('dashboard.html')) && /'&account=' \+/.test(rd('dashboard.html')));
  } finally {
    await clean();
    await pool.end();
  }
  console.log('\n' + pass + ' OK, ' + fail + ' ECHEC');
  process.exit(fail ? 1 : 0);
})();
