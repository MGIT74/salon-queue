// « Premier disponible » : le client (ou l'admin) ne choisit pas de coiffeur, le systeme prend celui qui a le plus
// de creneaux libres ce jour-la ; le nom du coiffeur choisi est renvoye pour l'afficher apres confirmation.
// La borne (sans RDV) n'a PAS cette option.
const fs = require('fs'), path = require('path');
const { execSync } = require('child_process');
const BASE = 'http://127.0.0.1:3999';
const sql = (q) => execSync(`mariadb -uroot salonq -N -e "${q.replace(/"/g, '\\"')}"`).toString().trim();
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n + (x ? '  [' + (typeof x === 'string' ? x : JSON.stringify(x)).slice(0, 160) + ']' : '')); };
const ADMIN = { 'Content-Type': 'application/json', 'X-Salon-Slug': 'test', 'X-Admin-Password': 'adminpw' };
const PUB = { 'Content-Type': 'application/json', 'X-Salon-Slug': 'test' };
const call = async (m, u, h, b) => { const r = await fetch(BASE + u, { method: m, headers: h, body: b ? JSON.stringify(b) : undefined }); let j = null; try { j = await r.json(); } catch (e) {} return { status: r.status, body: j }; };

(async () => {
  const d = new Date(Date.now() + 10 * 86400000);
  const DAY = d.toISOString().slice(0, 10), wd = d.getUTCDay();
  sql(`DELETE FROM appointments WHERE client_name LIKE 'T115%';
       DELETE FROM barber_walkin_days WHERE barber_id IN ('b1','b2'); DELETE FROM barber_leaves WHERE barber_id IN ('b1','b2');
       DELETE FROM salon_closures WHERE salon_id = 's1';
       UPDATE barbers SET active = 1, accepts_appointments = 1, kiosk_hidden = 1 WHERE id IN ('b1','b2');
       DELETE FROM barber_schedules WHERE barber_id IN ('b1','b2') AND weekday = ${wd};
       INSERT INTO barber_schedules (id, barber_id, weekday, start_time, end_time, active) VALUES
         (UUID(),'b1',${wd},'09:00','19:00',1),(UUID(),'b2',${wd},'09:00','19:00',1);
       INSERT INTO appointments (id, salon_id, barber_id, client_name, phone, service_id, scheduled_at, status, cancel_token) VALUES
         (UUID(),'s1','b1','T115 Busy1','0600','sv1','${DAY} 14:00:00','confirmed',UUID()),
         (UUID(),'s1','b1','T115 Busy2','0600','sv1','${DAY} 15:00:00','confirmed',UUID());`);
  const nameOf = (id) => sql(`SELECT name FROM barbers WHERE id = '${id}'`);
  const bobName = nameOf('b2'), aliceName = nameOf('b1');

  console.log('\n[A] Disponibilites sans coiffeur');
  let r = await call('GET', `/api/appointments/availability?date=${DAY}&service_id=sv1`, PUB);
  const s10 = r.body && r.body.slots && r.body.slots.find((s) => s.time === '10:00');
  check('reponse « any » avec un coiffeur par creneau', r.status === 200 && r.body.any === true && !!s10, r.body);
  check('10:00 : le systeme propose le coiffeur le moins charge (Bob)', s10 && s10.barber_id === 'b2', s10);
  check('14:00 (Alice prise) : reste propose, avec Bob', r.body.slots.some((s) => s.time === '14:00' && s.barber_id === 'b2'));

  console.log('\n[B] Reservation en ligne sans coiffeur');
  r = await call('POST', '/api/appointments', PUB, { client_name: 'T115 Solo', email: 't115@example.com', phone: '0600000115', service_id: 'sv1', date: DAY, time: '10:00' });
  check('RDV cree, coiffeur attribue et son nom renvoye', r.status === 200 && r.body.barber_id === 'b2' && r.body.barber_name === bobName, r.body);
  check('enregistre chez Bob', sql(`SELECT barber_id FROM appointments WHERE client_name = 'T115 Solo'`) === 'b2');

  console.log('\n[C] Reservation a plusieurs sans coiffeur, meme heure');
  r = await call('POST', '/api/appointments/group', PUB, { client_name: 'T115 G', email: 't115g@example.com', phone: '0600000116', base_url: BASE + '/rdv.html',
    people: [{ name: 'T115 G1', service_id: 'sv1', barber_id: null, date: DAY, time: '16:00' }, { name: 'T115 G2', service_id: 'sv1', barber_id: null, date: DAY, time: '16:00' }] });
  const gb = sql(`SELECT GROUP_CONCAT(barber_id ORDER BY barber_id) FROM appointments WHERE client_name IN ('T115 G1','T115 G2') AND status <> 'cancelled'`);
  check('les deux personnes ont chacune un coiffeur different', r.status === 200 && gb === 'b1,b2', { status: r.status, gb, body: r.body });

  console.log('\n[D] Admin « Ajouter un RDV » sans coiffeur');
  r = await call('POST', '/api/appointments/admin-create', ADMIN, { client_name: 'T115 Admin', phone: '0600000117', service_id: 'sv1', date: DAY, time: '10:00' });
  check('10:00 (Bob deja pris) : attribue a Alice, nom renvoye', r.status === 200 && r.body.barber_id === 'b1' && r.body.barber_name === aliceName, r.body);
  r = await call('POST', '/api/appointments/admin-create', ADMIN, { client_name: 'T115 Admin2', phone: '0600000118', service_id: 'sv1', date: DAY, time: '10:00' });
  check('10:00 tout le monde pris : refus clair', r.status === 409 && /Aucun coiffeur/.test(r.body.error), r.body);

  console.log('\n[E] Ecrans');
  const rd = (f) => fs.readFileSync(path.join(__dirname, '../../public', f), 'utf8');
  const app = rd('app.js'), rdv = rd('rdv.html'), compte = rd('compte.html'), dash = rd('dashboard.html'), kiosk = rd('kiosk.html'), gbk = rd('group-booking.js');
  check('tuile « Premier disponible » definie', /function anyBarberTileHtml/.test(app) && /Premier disponible/.test(app));
  check('rdv.html : tuile + nom du coiffeur apres confirmation', /anyBarberTileHtml\(/.test(rdv) && /Votre coiffeur : /.test(rdv) && /barber_name/.test(rdv));
  check('compte.html : tuile + nom du coiffeur apres confirmation', /anyBarberTileHtml\(/.test(compte) && /Votre coiffeur : /.test(compte));
  check('admin : carte « Premier disponible »', /aa-any/.test(dash) && /Premier disponible/.test(dash));
  check('panier groupe : pas de coiffeur envoye pour « Premier disponible »', /e\.any \? null/.test(gbk));
  check('borne : pas de nouvelle tuile RDV (sa file garde son propre « premier disponible »)', !/anyBarberTileHtml/.test(kiosk));

  sql(`DELETE FROM appointments WHERE client_name LIKE 'T115%';`);
  console.log(`\n${pass} OK, ${fail} ECHEC`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
