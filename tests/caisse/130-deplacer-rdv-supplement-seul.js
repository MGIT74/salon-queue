// Déplacer un RDV existant : les créneaux proposés tiennent compte de SES suppléments. Un RDV « supplément seul »
// (sans prestation) était refusé avec « Choisissez au moins un supplément » dans la fenêtre « Déplacer le RDV ».
const { execSync } = require('child_process');
const BASE = 'http://127.0.0.1:3999';
const sql = (q) => execSync('mariadb -uroot salonq -N -e ' + JSON.stringify(q)).toString().trim();
const ADMIN = { 'Content-Type': 'application/json', 'X-Salon-Slug': 'test', 'X-Admin-Password': 'adminpw' };
let pass = 0, fail = 0;
const check = (n, ok, x) => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n + (ok || x === undefined ? '' : '  -> ' + JSON.stringify(x).slice(0, 220))); };
const DAY = new Date(Date.now() + 6 * 86400000).toISOString().slice(0, 10);
const DAY2 = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
(async () => {
  sql("DELETE FROM appointments WHERE client_name LIKE 'T130%'");
  sql("DELETE FROM barber_schedules WHERE barber_id='b1'; INSERT INTO barber_schedules (id,barber_id,weekday,start_time,end_time,active) SELECT UUID(),'b1',d.n,'09:00','19:00',1 FROM (SELECT 0 n UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5 UNION SELECT 6) d");
  sql("INSERT IGNORE INTO extras (id, salon_id, name, duration_min, price_cents, active, sort_order) VALUES ('t130-soin','s1','T130 Soin',20,1200,1,99); UPDATE extras SET active = 1, deleted_at = NULL WHERE id = 't130-soin'");
  const call = (m, u, b) => fetch(BASE + u, { method: m, headers: ADMIN, body: b ? JSON.stringify(b) : undefined }).then(async (r) => ({ status: r.status, body: await r.json() }));
  const free = (await call('GET', `/api/appointments/availability?date=${DAY}&service_id=sv1&barber_id=b1&extras=t130-soin`)).body.slots.map((x) => x.time);
  let r = await call('POST', '/api/appointments/admin-create', { client_name: 'T130 Supp', barber_id: 'b1', extras: ['t130-soin'], date: DAY, time: free[0] });
  check('RDV « supplément seul » créé', r.status === 200, r.body);
  const id = sql("SELECT id FROM appointments WHERE client_name = 'T130 Supp'");
  const svc = sql(`SELECT service_id FROM appointments WHERE id = '${id}'`);
  // Exactement l'appel de la fenêtre « Déplacer le RDV » (admin et caisse) : prestation du RDV, sans liste de suppléments.
  r = await call('GET', `/api/appointments/availability?date=${DAY2}&service_id=${svc}&barber_id=b1&exclude_appointment_id=${id}`);
  check('déplacement : des créneaux sont proposés (plus d\'erreur « au moins un supplément »)', r.status === 200 && r.body.slots.length > 0, r.body);
  check('durée = celle du supplément (20 min)', r.body.duration_min === 20, r.body);
  r = await call('PUT', `/api/appointments/${id}/reschedule`, { date: DAY2, time: r.body.slots[0].time, barber_id: 'b1' });
  check('déplacement enregistré, supplément conservé', r.status === 200 && sql(`SELECT extra_id FROM appointment_extras WHERE appointment_id = '${id}'`) === 't130-soin', r.body);

  // RDV classique avec supplément : la durée proposée au déplacement compte aussi le supplément (30 + 20 min).
  r = await call('POST', '/api/appointments/admin-create', { client_name: 'T130 Coupe', barber_id: 'b1', service_id: 'sv1', extras: ['t130-soin'], date: DAY, time: free[free.length - 1] });
  const id2 = sql("SELECT id FROM appointments WHERE client_name = 'T130 Coupe'");
  r = await call('GET', `/api/appointments/availability?date=${DAY2}&service_id=sv1&barber_id=b1&exclude_appointment_id=${id2}`);
  check('RDV coupe + supplément : durée au déplacement = 50 min', r.status === 200 && r.body.duration_min === 50, r.body);

  sql("DELETE FROM appointments WHERE client_name LIKE 'T130%'");
  console.log(`\n${pass} OK, ${fail} ECHEC`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
