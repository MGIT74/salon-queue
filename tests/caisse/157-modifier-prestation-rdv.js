// « Modifier la prestation » d'un RDV à venir (Mon poste, Caisse, admin) : PUT /api/appointments/:id/services.
// Même heure de début, nouvelle durée (tarif du coiffeur) : ça tient -> enregistré ; dépasse de 10 min au plus sur ce
// qui suit -> confirmation demandée (force) ; plus de 10 min -> refusé, il faut déplacer (date/time dans le même appel).
// Vraie base + vrai serveur (port 3999).
process.env.DB_HOST = process.env.DB_HOST || '127.0.0.1';
process.env.DB_USER = process.env.DB_USER || 'sq';
process.env.DB_PASSWORD = process.env.DB_PASSWORD || 'sqpass';
process.env.DB_NAME = process.env.DB_NAME || 'salonq';
process.env.SETTINGS_ENCRYPTION_KEY = process.env.SETTINGS_ENCRYPTION_KEY || 'testkeytestkeytestkeytestkey123456';
const path = require('path'), fs = require('fs');
const { pool } = require(path.join(__dirname, '../../src/db'));
const BASE = 'http://127.0.0.1:3999';
const H = (barber, pin) => ({ 'Content-Type': 'application/json', 'X-Salon-Slug': 'test', 'X-Barber-Id': barber, 'X-Barber-Pin': pin });
const call = async (method, p, body, h) => { const r = await fetch(BASE + p, { method, headers: h || H('b1', '1111'), body: body ? JSON.stringify(body) : undefined }); return { status: r.status, data: await r.json().catch(() => ({})) }; };
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n + (x ? '  [' + x + ']' : '')); };

const d = new Date(Date.now() + 40 * 864e5);   // loin : aucun autre RDV ce jour-là
const DAY = d.toISOString().slice(0, 10);

(async () => {
  const [[bufRow]] = await pool.query("SELECT value FROM settings WHERE salon_id = 's1' AND `key` = 'rdv_buffer_min'");
  const [[stepRow]] = await pool.query("SELECT value FROM settings WHERE salon_id = 's1' AND `key` = 'rdv_slot_step_min'");
  await pool.query("INSERT INTO settings (salon_id, `key`, value) VALUES ('s1','rdv_buffer_min','0') ON DUPLICATE KEY UPDATE value = '0'");
  await pool.query("DELETE FROM appointments WHERE id LIKE 't157%'");
  await pool.query("DELETE FROM extras WHERE id LIKE 't157%'");
  await pool.query("DELETE FROM products WHERE id = 't157-gel'");
  await pool.query("UPDATE barbers SET accepts_appointments = 1 WHERE id = 'b1'");
  await pool.query("DELETE FROM barber_schedules WHERE barber_id = 'b1'");
  for (let w = 0; w <= 6; w++) await pool.query("INSERT INTO barber_schedules (id, barber_id, weekday, start_time, end_time, active) VALUES (UUID(), 'b1', ?, '09:00:00', '19:00:00', 1)", [w]);
  await pool.query("INSERT INTO extras (id, salon_id, name, duration_min, price_cents, active) VALUES ('t157-e5','s1','T157 Contour',5,300,1),('t157-e20','s1','T157 Soin long',20,1500,1),('t157-e40','s1','T157 Couleur',40,3000,1)");
  await pool.query("INSERT INTO products (id, salon_id, name, price_cents, online_bookable) VALUES ('t157-gel','s1','T157 Gel',900,1)");
  const ins = (id, barber, hhmm, name, email) => pool.query(
    "INSERT INTO appointments (id, salon_id, barber_id, client_name, email, service_id, scheduled_at, status, cancel_token) VALUES (?,'s1',?,?,?,'sv1',?,'confirmed',?)",
    [id, barber, name, email || null, DAY + ' ' + hhmm + ':00', 'tok' + id]);
  await ins('t157a', 'b1', '10:00', 'T157 Alain', 'alain@client.test');   // Coupe 30 min -> 10:30
  await ins('t157b', 'b1', '10:30', 'T157 Karim');                       // le suivant
  await ins('t157z', 'b2', '11:00', 'T157 Zoe');                         // RDV de Bob
  const extrasOf = async (id) => (await pool.query('SELECT extra_id FROM appointment_extras WHERE appointment_id = ? ORDER BY extra_id', [id]))[0].map((r) => r.extra_id);

  console.log('\n[A] Ça tient / dépasse un peu / dépasse trop');
  let r = await call('PUT', '/api/appointments/t157a/services', { service_id: 'sv1', extras: ['t157-e5'] });
  check('Coupe + 5 min (fin 10:35, Karim à 10:30) -> confirmation demandée (dépasse de 5 min)', r.status === 409 && r.data.code === 'overlap_confirm' && r.data.over_min === 5 && /Karim/.test(r.data.conflict), JSON.stringify(r.data));
  check('rien enregistré tant que pas confirmé', (await extrasOf('t157a')).length === 0);
  r = await call('PUT', '/api/appointments/t157a/services', { service_id: 'sv1', extras: ['t157-e5'], force: true, products: [{ id: 't157-gel', quantity: 1 }] });
  check('confirmé (force) -> enregistré, fin 10:35, chevauchement 5 min signalé', r.status === 200 && r.data.end_time === '10:35' && r.data.over_min === 5 && r.data.duration_min === 35, JSON.stringify(r.data));
  check('suppléments et produits du RDV mis à jour', JSON.stringify(await extrasOf('t157a')) === '["t157-e5"]' && (await pool.query("SELECT COUNT(*) AS n FROM appointment_products WHERE appointment_id = 't157a' AND product_id = 't157-gel'"))[0][0].n === 1);
  r = await call('PUT', '/api/appointments/t157a/services', { service_id: 'sv1', extras: ['t157-e20'] });
  check('Coupe + 20 min (dépasse de 20 min > 10) -> refusé « no_room », il faut déplacer', r.status === 409 && r.data.code === 'no_room' && r.data.over_min === 20 && /Déplacez/.test(r.data.error), JSON.stringify(r.data));
  r = await call('PUT', '/api/appointments/t157a/services', { service_id: 'sv1', extras: ['t157-e20'], force: true });
  check('même avec « force », plus de 10 min reste refusé', r.status === 409 && r.data.code === 'no_room');
  r = await call('PUT', '/api/appointments/t157a/services', { service_id: 'sv1', extras: [] });
  check('plus court (Coupe seule) -> enregistré sans question', r.status === 200 && r.data.end_time === '10:30' && r.data.over_min === 0 && (await extrasOf('t157a')).length === 0, JSON.stringify(r.data));
  check('produits absents de la requête -> gardés', (await pool.query("SELECT COUNT(*) AS n FROM appointment_products WHERE appointment_id = 't157a'"))[0][0].n === 1);
  r = await call('PUT', '/api/appointments/t157b/services', { service_id: 'sv1', extras: ['t157-e40'] });
  check('dernier RDV avant la fin de journée : place libre derrière -> enregistré', r.status === 200 && r.data.end_time === '11:40', JSON.stringify(r.data));

  console.log('\n[B] Déplacer avec la nouvelle prestation (un seul enregistrement)');
  r = await call('PUT', '/api/appointments/t157a/services', { service_id: 'sv1', extras: ['t157-e20'], date: DAY, time: '15:00', base_url: 'http://x/rdv.html' });
  const [[moved]] = await pool.query("SELECT scheduled_at FROM appointments WHERE id = 't157a'");
  check('nouvelle prestation + 15:00 libre -> enregistrés ensemble', r.status === 200 && r.data.moved === true && String(moved.scheduled_at).slice(11, 16) === '15:00' && JSON.stringify(await extrasOf('t157a')) === '["t157-e20"]', JSON.stringify(r.data));
  r = await call('PUT', '/api/appointments/t157a/services', { service_id: 'sv1', extras: ['t157-e20'], date: DAY, time: '10:45' });
  check('créneau pris (Karim 10:30-11:40) -> refusé, rien ne bouge', r.status === 409 && String((await pool.query("SELECT scheduled_at FROM appointments WHERE id = 't157a'"))[0][0].scheduled_at).slice(11, 16) === '15:00', JSON.stringify(r.data));

  console.log('\n[C] Règles');
  r = await call('PUT', '/api/appointments/t157z/services', { service_id: 'sv1', extras: [] });
  check('un coiffeur ne modifie pas le RDV d\'un collègue', r.status === 403);
  await pool.query("UPDATE appointments SET status = 'cancelled' WHERE id = 't157z'");
  r = await call('PUT', '/api/appointments/t157z/services', { service_id: 'sv1', extras: [] }, H('b2', '2222'));
  check('RDV annulé : pas modifiable', r.status === 409);
  r = await call('PUT', '/api/appointments/t157b/services', { service_id: 'sv1', extras: ['inconnu'] });
  check('supplément inconnu -> refusé', r.status === 400);

  console.log('\n[D] Écrans et email');
  const app = fs.readFileSync(path.join(__dirname, '../../public/app.js'), 'utf8');
  const mailer = fs.readFileSync(path.join(__dirname, '../../src/lib/mailer.js'), 'utf8');
  check('email au client (prestation, durée, prix, horaire)', /async function sendAppointmentServicesChanged/.test(mailer) && /La prestation de votre rendez-vous/.test(mailer) && /sendAppointmentServicesChanged,/.test(mailer));
  check('éditeur partagé (app.js) : cartes, récap, confirmation du chevauchement, déplacement', /function openApptServicesEditor\(/.test(app) && /overlap_confirm/.test(app) && /no_room/.test(app) && /exclude_appointment_id=/.test(app));
  ['poste', 'caisse', 'dashboard'].forEach((pg) => {
    const html = fs.readFileSync(path.join(__dirname, '../../public/' + pg + '.html'), 'utf8');
    check(pg + ' : bouton « Modifier la prestation » dans le tiroir du RDV', /Modifier la prestation/.test(html) && /openApptServicesEditor\(/.test(html));
  });

  await pool.query("DELETE FROM appointments WHERE id LIKE 't157%'");
  await pool.query("DELETE FROM extras WHERE id LIKE 't157%'");
  await pool.query("DELETE FROM products WHERE id = 't157-gel'");
  await pool.query("DELETE FROM barber_schedules WHERE barber_id = 'b1'");
  await pool.query("UPDATE barbers SET accepts_appointments = 0 WHERE id = 'b1'");
  if (bufRow) await pool.query("UPDATE settings SET value = ? WHERE salon_id = 's1' AND `key` = 'rdv_buffer_min'", [bufRow.value]);
  else await pool.query("DELETE FROM settings WHERE salon_id = 's1' AND `key` = 'rdv_buffer_min'");
  void stepRow;
  console.log('\n' + pass + ' OK, ' + fail + ' ECHEC');
  await pool.end();
  process.exit(fail ? 1 : 0);
})().catch(async (e) => { console.log('ERREUR TEST', e); process.exit(1); });
