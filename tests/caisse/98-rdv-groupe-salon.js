// RDV pour plusieurs personnes saisi par le SALON (base et serveur reels, voir README) : dashboard, caisse et
// Mon poste passent par POST /api/appointments/admin-group (email facultatif, coiffeur au choix par personne).
const { execSync } = require('child_process');
const fs = require('fs');
const BASE = 'http://127.0.0.1:3999';
const sql = (q) => execSync(`mariadb -uroot salonq -N -e "${q.replace(/"/g, '\\"')}"`).toString().trim();
const ADMIN = { 'Content-Type': 'application/json', 'X-Salon-Slug': 'test', 'X-Admin-Password': 'adminpw' };
const BARBER = { 'Content-Type': 'application/json', 'X-Salon-Slug': 'test', 'X-Barber-Id': 'b1', 'X-Barber-Pin': '1111' };
const PUBLIC = { 'Content-Type': 'application/json', 'X-Salon-Slug': 'test' };
const post = async (path, body, h) => { const r = await fetch(BASE + path, { method: 'POST', headers: h, body: JSON.stringify(body) }); return { status: r.status, body: await r.json().catch(() => null) }; };
let pass = 0, fail = 0;
const check = (n, ok, extra) => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n + (ok || extra === undefined ? '' : '  -> ' + JSON.stringify(extra))); };

(async () => {
  const D = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
  sql("DELETE FROM appointments; UPDATE barbers SET accepts_appointments=1, active=1; DELETE FROM barber_schedules WHERE barber_id IN ('b1','b2')");
  sql("INSERT INTO barber_schedules (id,barber_id,weekday,start_time,end_time,active) SELECT UUID(),b.id,d.n,'09:00','19:00',1 FROM barbers b JOIN (SELECT 0 n UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5 UNION SELECT 6) d WHERE b.id IN ('b1','b2')");
  const people = [{ name: '', service_id: 'sv1', barber_id: 'b1', date: D, time: '10:00' }, { name: 'Lucas', service_id: 'sv1', barber_id: 'b2', date: D, time: '10:00' }];

  let r = await post('/api/appointments/admin-group', { client_name: 'Karim', phone: '0600000000', people }, ADMIN);
  check('admin : groupe accepte sans email', r.status === 200 && r.body.appointments.length === 2, r.body);
  check('...deux RDV, meme groupe, chacun son coiffeur, nom du parent pour la 1re personne', sql("SELECT GROUP_CONCAT(CONCAT(client_name,':',barber_id) ORDER BY client_name) FROM appointments") === 'Karim:b1,Lucas:b2' && sql('SELECT COUNT(DISTINCT group_id) FROM appointments') === '1');
  r = await post('/api/appointments/admin-group', { client_name: 'Autre', people: [{ name: '', service_id: 'sv1', barber_id: 'b1', date: D, time: '10:00' }] }, ADMIN);
  check('creneau deja pris refuse (409), rien d\'enregistre', r.status === 409 && sql('SELECT COUNT(*) FROM appointments') === '2', r.body);
  r = await post('/api/appointments/admin-group', { client_name: 'Famille', people: [{ name: 'A', service_id: 'sv1', barber_id: 'b1', date: D, time: '14:00' }, { name: 'B', service_id: 'sv1', barber_id: 'b1', date: D, time: '14:10' }] }, ADMIN);
  check('deux personnes qui se chevauchent chez le meme coiffeur : refuse, tout annule', r.status === 409 && sql('SELECT COUNT(*) FROM appointments') === '2', r.body);
  r = await post('/api/appointments/admin-group', { client_name: 'Coiffeur', people: [{ name: '', service_id: 'sv1', barber_id: 'b1', date: D, time: '16:00' }, { name: 'Fils', service_id: 'sv1', barber_id: 'b2', date: D, time: '16:00' }] }, BARBER);
  check('coiffeur (code PIN, caisse / Mon poste) : accepte', r.status === 200, r.body);
  r = await post('/api/appointments/admin-group', { client_name: 'X', people }, PUBLIC);
  check('sans authentification : refuse', r.status === 401, r.status);
  r = await post('/api/appointments/group', { client_name: 'Public', people: [{ name: '', service_id: 'sv1', date: D, time: '17:00' }] }, PUBLIC);
  check('reservation en ligne : email toujours obligatoire', r.status === 400 && /email/i.test(r.body.error), r.body);

  const files = ['dashboard', 'caisse', 'poste'].map((f) => fs.readFileSync(__dirname + '/../../public/' + f + '.html', 'utf8'));
  check('bouton « Plusieurs personnes » dans Ajouter un RDV : dashboard, caisse, Mon poste', files.every((h) => /staff-group\.js/.test(h) && /StaffGroupBooking\.buttonHtml\(/.test(h) && /StaffGroupBooking\.open\(/.test(h)));
  check('dashboard : clic sur la ligne d\'un coiffeur (etape Prestation en premier) -> « Plusieurs personnes » propose d\'emblee', /\(preselectedBarberId \? StaffGroupBooking\.buttonHtml\('aaOpenGroup\(\)'\) : ''\)/.test(files[0]));
  const sg = fs.readFileSync(__dirname + '/../../public/staff-group.js', 'utf8');
  const rdv = fs.readFileSync(__dirname + '/../../public/rdv.html', 'utf8');
  check('meme ecran que la reservation en ligne : rdv.html?staff=1 ouverte dans la fenetre', /rdv\.html\?staff=1/.test(sg) && /StaffBookingBridge/.test(sg) && /STAFF_BRIDGE/.test(rdv) && /\/api\/appointments\/admin-group/.test(rdv));
  const H = (u) => fetch(BASE + u).then((x) => ({ xfo: x.headers.get('x-frame-options'), csp: x.headers.get('content-security-policy') || '' }));
  const hr = await H('/rdv.html'), hd = await H('/dashboard.html');
  check('rdv.html affichable seulement par notre propre domaine, les autres pages restent interdites en iframe', hr.xfo === 'SAMEORIGIN' && /frame-ancestors 'self'/.test(hr.csp) && hd.xfo === 'DENY' && /frame-ancestors 'none'/.test(hd.csp));
  sql('DELETE FROM appointments');
  console.log('\nRESULTAT : ' + pass + ' verifications reussies, ' + fail + ' echec(s)');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
