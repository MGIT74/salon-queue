// Temps d'attente estime (ticket de la borne, ecran TV, dashboard, email « c'est bientot votre tour ») :
// - client qui a choisi un coiffeur : coupe en cours de CE coiffeur + ses clients arrives avant ;
// - « Premier disponible » sans RDV : le coiffeur SANS RDV en poste qui se libere le premier (jamais un coiffeur en RDV).
// Avant : tout le monde etait reparti sur tous les coiffeurs en poste, sans tenir compte du coiffeur choisi.
process.env.DB_HOST = process.env.DB_HOST || '127.0.0.1'; process.env.DB_USER = process.env.DB_USER || 'sq';
process.env.DB_PASSWORD = process.env.DB_PASSWORD || 'sqpass'; process.env.DB_NAME = process.env.DB_NAME || 'salonq';
const path = require('path');
const { execSync } = require('child_process');
const { recompute } = require(path.join(__dirname, '../../src/lib/queueMath'));
const sql = (q) => execSync(`mariadb -uroot salonq -N -e "${q.replace(/"/g, '\\"')}"`).toString().trim();
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n + (x ? '  [' + (typeof x === 'string' ? x : JSON.stringify(x)).slice(0, 160) + ']' : '')); };
// Inscription directe (sans passer par la borne, limitee a 12 inscriptions / 15 min) puis calcul de l'attente.
let n = 0;
const checkin = async (b) => {
  const id = 't125-' + (++n);
  sql(`INSERT INTO queue (id, salon_id, client_name, service_id, barber_id, status, checkin_at) VALUES ('${id}', 's1', '${b.client_name}', '${b.service_id}', ${b.barber_id ? `'${b.barber_id}'` : 'NULL'}, 'waiting', DATE_ADD(UTC_TIMESTAMP(), INTERVAL ${n} SECOND))`);
  await recompute('s1');
  return { id, estimated_wait_min: wait(id) };
};
const wait = (id) => Number(sql(`SELECT estimated_wait_min FROM queue WHERE id = '${id}'`));

(async () => {
  const sched = sql(`SELECT GROUP_CONCAT(CONCAT(barber_id, '|', weekday, '|', start_time, '|', end_time)) FROM barber_schedules WHERE barber_id IN ('b1','b2')`);
  sql(`DELETE FROM queue WHERE status IN ('waiting','in_progress'); DELETE FROM barber_schedules WHERE barber_id = 't125r'; DELETE FROM barbers WHERE id = 't125r';
       DELETE FROM barber_leaves WHERE barber_id IN ('b1','b2'); DELETE FROM barber_walkin_days WHERE barber_id IN ('b1','b2');
       UPDATE barbers SET kiosk_hidden = 0, accepts_appointments = 0 WHERE id IN ('b1','b2');
       INSERT INTO barbers (id, salon_id, name, sort_order, pin_code, accepts_appointments, kiosk_hidden, active) VALUES ('t125r','s1','T125 RDV',9,'9911',1,1,1);
       INSERT INTO barber_schedules (id, barber_id, weekday, start_time, end_time, active) SELECT UUID(), 't125r', d.w, '00:00', '23:59', 1 FROM (SELECT 0 w UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5 UNION SELECT 6) d;
       UPDATE barber_schedules SET start_time = '00:00', end_time = '23:59' WHERE barber_id IN ('b1','b2');
       INSERT INTO queue (id, salon_id, client_name, service_id, barber_id, status, checkin_at, start_at) VALUES
         ('t125c','s1','T125 En coupe','sv1','b1','in_progress', DATE_SUB(UTC_TIMESTAMP(), INTERVAL 40 MINUTE), DATE_SUB(UTC_TIMESTAMP(), INTERVAL 22 MINUTE)),
         ('t125a','s1','T125 A1','sv1','b1','waiting', DATE_SUB(UTC_TIMESTAMP(), INTERVAL 30 MINUTE), NULL),
         ('t125b','s1','T125 A2','sv1','b1','waiting', DATE_SUB(UTC_TIMESTAMP(), INTERVAL 20 MINUTE), NULL);`);

  const chris = await checkin({ client_name: 'T125 Chris', service_id: 'sv1', barber_id: 'b1' });
  check('client qui attend son coiffeur : coupe en cours (~8 min) + 2 clients avant lui (2 x 30 min)', chris && chris.estimated_wait_min >= 66 && chris.estimated_wait_min <= 69, chris && chris.estimated_wait_min);
  check('ses clients avant lui : ~8 min et ~38 min', Math.abs(wait('t125a') - 8) <= 1 && Math.abs(wait('t125b') - 38) <= 1, [wait('t125a'), wait('t125b')]);
  const l1 = await checkin({ client_name: 'T125 Libre', service_id: 'sv1' });
  check('« Premier disponible » : le coiffeur sans RDV libre (tout de suite)', l1 && l1.estimated_wait_min === 0, l1 && l1.estimated_wait_min);
  const l2 = await checkin({ client_name: 'T125 Libre2', service_id: 'sv1' });
  check('le suivant attend ce coiffeur (30 min), pas le coiffeur en RDV pourtant libre', l2 && l2.estimated_wait_min === 30, l2 && l2.estimated_wait_min);

  // remise en etat
  sql(`DELETE FROM appointments WHERE client_name LIKE 'T125%'; DELETE FROM queue WHERE client_name LIKE 'T125%';
       DELETE FROM barber_schedules WHERE barber_id = 't125r'; DELETE FROM barbers WHERE id = 't125r';
       UPDATE barbers SET kiosk_hidden = 1, accepts_appointments = 1 WHERE id IN ('b1','b2');`);
  sched.split(',').filter(Boolean).forEach((row) => { const [b, w, s, e] = row.split('|'); sql(`UPDATE barber_schedules SET start_time = '${s}', end_time = '${e}' WHERE barber_id = '${b}' AND weekday = ${w}`); });
  require(path.join(__dirname, '../../src/db')).pool.end().catch(() => {});
  console.log(`\n${pass} OK, ${fail} ECHEC`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
