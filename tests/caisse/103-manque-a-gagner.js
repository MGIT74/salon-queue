// Manque à gagner (fiche coiffeur + tableau de bord) = créneaux libres DÉJÀ PASSÉS + RDV annulés / absents.
//  - créneaux libres : heures prévues écoulées (sans congés, fermetures, pauses) - durée PRÉVUE des prestations
//    réalisées (pas le chrono) - temps des RDV ratés, au prix moyen à la minute des prestations du coiffeur ;
//  - RDV annulés / absents dont l'heure est passée : à leur prix réservé (prestation + suppléments, tarif du coiffeur) ;
//  - rien n'est compté après l'heure actuelle.
const { execSync } = require('child_process');
const fs = require('fs');
const BASE = 'http://127.0.0.1:3999';
const sql = (q) => execSync(`mariadb -uroot salonq -N -e "${q.replace(/"/g, '\\"')}"`).toString().trim();
const ADMIN = { 'X-Salon-Slug': 'test', 'X-Admin-Password': 'adminpw' };
let pass = 0, fail = 0;
const check = (n, ok, extra) => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n + (ok || extra === undefined ? '' : '  -> ' + JSON.stringify(extra))); };
const day = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

(async () => {
  const P = day(-9), F = day(9);   // un jour passe, un jour a venir
  const stats = (D) => fetch(BASE + '/api/barbers/b1/stats?start=' + D + 'T00:00:00Z&end=' + D + 'T23:59:59Z&start_date=' + D + '&end_date=' + D, { headers: ADMIN }).then((r) => r.json()).then((r) => r.availability);
  const clean = "DELETE FROM barber_service_prices WHERE barber_id='b1'; DELETE FROM barber_service_exclusions WHERE barber_id='b1'; DELETE FROM barber_breaks WHERE barber_id='b1'; DELETE FROM barber_leaves WHERE barber_id='b1'; DELETE FROM appointments WHERE id LIKE 't103-%'; DELETE FROM queue WHERE id LIKE 't103-%'";
  sql(clean);
  sql("UPDATE services SET price_cents=2000, duration_min=30, active=1, deleted_at=NULL WHERE id='sv1'");
  sql("UPDATE services SET active=0 WHERE salon_id='s1' AND id <> 'sv1' AND system_kind IS NULL");
  sql("DELETE FROM barber_schedules WHERE barber_id='b1'");
  sql("INSERT INTO barber_schedules (id,barber_id,weekday,start_time,end_time,active) SELECT UUID(),'b1',d.n,'09:00','19:00',1 FROM (SELECT 0 n UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5 UNION SELECT 6) d");

  let a = await stats(P);
  check('journée passée vide : 600 min libres x 20 € / 30 min = 400 €', a.free_minutes === 600 && a.potential_revenue_cents === 40000 && a.missed_revenue_cents === 0, a);
  a = await stats(F);
  check('journée à venir : rien de perdu (0 €)', a.potential_revenue_cents === 0 && a.free_minutes === 0, a);

  sql("INSERT INTO barber_breaks (id,barber_id,weekday,start_time,end_time,active) VALUES (UUID(),'b1',WEEKDAY('" + P + "')+1 MOD 7,'12:00','13:00',1)");
  sql("UPDATE barber_breaks SET weekday = DAYOFWEEK('" + P + "') - 1 WHERE barber_id='b1'");
  a = await stats(P);
  check('la pause n\'est pas du temps perdu (540 min -> 360 €)', a.free_minutes === 540 && a.potential_revenue_cents === 36000, a);

  // Client servi : sa durée PRÉVUE (30 min) compte, même si le chrono n'a duré que 2 min.
  sql("INSERT INTO queue (id,salon_id,barber_id,client_name,status,checkin_at,start_at,end_at,total_duration_min,total_price_cents) VALUES ('t103-q1','s1','b1','Q','done','" + P + " 08:00:00','" + P + " 08:30:00','" + P + " 08:32:00',30,2000)");
  a = await stats(P);
  check('coupe réalisée : sa durée prévue est retirée (pas le chrono de 2 min)', a.occupied_minutes === 30 && a.free_minutes === 510 && a.free_revenue_cents === 34000, a);

  // RDV annulé (heure passée) : compté à son prix réservé, son temps n'est pas compté deux fois.
  sql("INSERT INTO barber_service_prices (barber_id, service_id, price_cents, duration_min) VALUES ('b1','sv1',2500,30)");
  sql("INSERT INTO appointments (id,salon_id,barber_id,client_name,service_id,scheduled_at,status) VALUES ('t103-a1','s1','b1','A','sv1','" + P + " 15:00:00','cancelled')");
  // RDV absent : arrivé en file puis marqué absent.
  sql("INSERT INTO queue (id,salon_id,barber_id,client_name,status,checkin_at,is_appointment) VALUES ('t103-q2','s1','b1','B','cancelled','" + P + " 16:00:00',1)");
  sql("INSERT INTO appointments (id,salon_id,barber_id,client_name,service_id,scheduled_at,status,promoted_queue_id) VALUES ('t103-a2','s1','b1','B','sv1','" + P + " 16:00:00','confirmed','t103-q2')");
  // RDV annulé à venir : le créneau peut encore être repris, pas compté.
  sql("INSERT INTO appointments (id,salon_id,barber_id,client_name,service_id,scheduled_at,status) VALUES ('t103-a3','s1','b1','C','sv1','" + F + " 15:00:00','cancelled')");
  a = await stats(P);
  // 540 - 30 (servi) - 60 (2 RDV ratés) = 450 min x 25 € / 30 min = 375 € ; RDV ratés : 2 x 25 € = 50 €.
  check('annulé + absent : 2 RDV au prix du coiffeur (50 €)', a.missed_appointments === 2 && a.missed_revenue_cents === 5000, a);
  check('leur temps n\'est pas compté deux fois (450 min libres -> 375 €)', a.free_minutes === 450 && a.free_revenue_cents === 37500, a);
  check('total = créneaux libres + annulés/absents (425 €)', a.potential_revenue_cents === 42500, a);
  a = await stats(F);
  check('RDV annulé à venir : pas compté', a.missed_appointments === 0 && a.potential_revenue_cents === 0, a);

  sql("INSERT INTO barber_service_exclusions (barber_id, service_id) VALUES ('b1','sv1')");
  a = await stats(P);
  check('aucune prestation proposée : créneaux libres non chiffrés, RDV ratés toujours comptés', a.free_revenue_cents === 0 && a.missed_revenue_cents === 5000 && a.potential_basis === 'none', a);

  // Tableau de bord : total + détail.
  const s = await fetch(BASE + '/api/barbers/salon-stats?start=' + P + 'T00:00:00Z&end=' + P + 'T23:59:59Z&start_date=' + P + '&end_date=' + P, { headers: ADMIN }).then((r) => r.json());
  check('tableau de bord : total = créneaux libres + annulés/absents', s.potential_revenue_cents === s.free_revenue_cents + s.missed_revenue_cents && s.missed_appointments === 2, s);
  const dash = fs.readFileSync(__dirname + '/../../public/dashboard.html', 'utf8');
  check('la carte affiche le détail (créneaux libres / RDV annulés / absents)', dash.includes('id="dash-missed-detail"') && /RDV annulés \/ absents/.test(dash));

  sql(clean);
  sql("DELETE FROM barber_schedules WHERE barber_id='b1'");
  sql("INSERT INTO barber_schedules (id,barber_id,weekday,start_time,end_time,active) SELECT UUID(),'b1',d.n,'09:00','19:00',1 FROM (SELECT 0 n UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5 UNION SELECT 6) d");
  sql("UPDATE services SET active=1 WHERE salon_id='s1' AND deleted_at IS NULL");
  console.log('\nRESULTAT : ' + pass + ' verifications reussies, ' + fail + ' echec(s)');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
