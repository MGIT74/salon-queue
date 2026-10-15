// Fiche coiffeur > Statistiques : panier moyen, ventes en plus, encaissé par heure, RDV ratés, comparaison avec la
// période précédente, et courbe (ce coiffeur / moyenne des autres coiffeurs / période précédente).
const { execSync } = require('child_process');
const fs = require('fs');
const BASE = 'http://127.0.0.1:3999';
const sql = (q) => execSync(`mariadb -uroot salonq -N -e "${q.replace(/"/g, '\\"')}"`).toString().trim();
const ADMIN = { 'X-Salon-Slug': 'test', 'X-Admin-Password': 'adminpw' };
let pass = 0, fail = 0;
const check = (n, ok, extra) => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n + (ok || extra === undefined ? '' : '  -> ' + JSON.stringify(extra))); };

(async () => {
  const clean = "DELETE si FROM sale_items si JOIN sales s ON s.id = si.sale_id WHERE s.id LIKE 't104%'; DELETE FROM sales WHERE id LIKE 't104%'; DELETE FROM appointments WHERE id LIKE 't104%'; DELETE FROM queue WHERE id LIKE 't104%'; DELETE FROM barber_breaks WHERE barber_id='b1'; DELETE FROM barber_leaves WHERE barber_id='b1'";
  sql(clean);
  sql("UPDATE barbers SET active=1 WHERE id IN ('b1','b2')");
  sql("DELETE FROM barber_schedules WHERE barber_id='b1'");
  sql("INSERT INTO barber_schedules (id,barber_id,weekday,start_time,end_time,active) SELECT UUID(),'b1',d.n,'09:00','19:00',1 FROM (SELECT 0 n UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5 UNION SELECT 6) d");
  // Semaine du 2 au 8 mars 2026 (heure d'hiver : Paris = UTC+1) et la semaine d'avant.
  const sale = (id, barber, at, lines) => {
    sql(`INSERT INTO sales (id,salon_id,barber_id,payment_method,total_price_cents,created_at) VALUES ('${id}','s1','${barber}','card',${lines.reduce((a, l) => a + l[1], 0)},'${at}')`);
    lines.forEach((l, i) => sql(`INSERT INTO sale_items (id,sale_id,item_type,item_name,unit_price_cents,quantity,barber_id) VALUES ('${id}_${i}','${id}','${l[0]}','x',${l[1]},1,'${barber}')`));
  };
  sale('t104a', 'b1', '2026-03-02 09:00:00', [['service', 2000], ['product', 1000]]);   // lundi 2 : 30 €
  sale('t104b', 'b1', '2026-03-02 10:00:00', [['service', 2000]]);                     // lundi 2 : +20 €
  sale('t104c', 'b1', '2026-03-04 15:00:00', [['service', 3000], ['extra', 500]]);     // mercredi 4 : 35 €
  sale('t104d', 'b2', '2026-03-02 11:00:00', [['service', 4000]]);                     // Bob lundi 2 : 40 €
  sale('t104e', 'b1', '2026-02-24 10:00:00', [['service', 2500]]);                     // semaine d'avant : 25 €
  sql("INSERT INTO appointments (id,salon_id,barber_id,client_name,service_id,scheduled_at,status,cancel_token) VALUES ('t104r1','s1','b1','A','sv1','2026-03-03 10:00:00','cancelled','t1'),('t104r2','s1','b1','B','sv1','2026-03-05 10:00:00','confirmed','t2'),('t104r3','s1','b1','C','sv1','2026-03-06 10:00:00','confirmed','t3')");
  sql("INSERT INTO queue (id,salon_id,client_name,barber_id,status,checkin_at) VALUES ('t104q','s1','B','b1','cancelled','2026-03-05 09:00:00')");
  sql("UPDATE appointments SET promoted_queue_id='t104q' WHERE id='t104r2'");

  const r = await fetch(BASE + '/api/barbers/b1/stats?start=2026-03-01T23:00:00.000Z&end=2026-03-08T23:00:00.000Z&start_date=2026-03-02&end_date=2026-03-08', { headers: ADMIN }).then((x) => x.json());
  check('encaissé de la semaine : 85 €', r.revenue_cents === 8500, r.revenue_cents);
  check('panier moyen = encaissé / tickets : 85 € / 3 = 28,33 €', r.tickets_count === 3 && r.avg_ticket_cents === 2833, [r.tickets_count, r.avg_ticket_cents]);
  check('ventes en plus : 2 tickets sur 3 avec produit ou supplément = 67 %', r.addon_rate_pct === 67, r.addon_rate_pct);
  check('encaissé par heure travaillée : 85 € / 70 h prévues = 1,21 €', r.revenue_per_hour_cents === Math.round(8500 * 60 / 4200), r.revenue_per_hour_cents);
  check('RDV ratés : 1 annulé, 1 absent, sur 3 RDV', r.cancelled_count === 1 && r.no_show_count === 1 && r.appointments_total === 3, r);
  check('période précédente (semaine d\'avant) : 25 €, 1 ticket', r.previous && r.previous.revenue_cents === 2500 && r.previous.avg_ticket_cents === 2500, r.previous);
  const se = r.series;
  check('courbe par jour : 7 points du 2 au 8 mars', se.unit === 'day' && se.labels.length === 7 && se.labels[0] === '2026-03-02' && se.labels[6] === '2026-03-08');
  check('ce coiffeur : 50 € le lundi, 35 € le mercredi', se.barber_cents[0] === 5000 && se.barber_cents[2] === 3500 && se.barber_cents[1] === 0, se.barber_cents);
  const others = Number(sql("SELECT COUNT(*) FROM barbers WHERE salon_id='s1' AND active=1 AND id<>'b1'"));
  check('moyenne des autres coiffeurs : 40 € de Bob réparti sur les ' + others + ' autres coiffeurs actifs', se.team_size === others && se.team_avg_cents[0] === Math.round(4000 / others), se.team_avg_cents);
  check('période précédente sur la courbe : 25 € le mardi 24 février (2e point)', se.previous_cents[1] === 2500 && se.previous_cents.reduce((a, b) => a + b, 0) === 2500, se.previous_cents);

  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date());
  const addD = (ds, n) => { const d = new Date(ds + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const f = addD(today, -2), t = addD(today, 3);
  const r2 = await fetch(BASE + '/api/barbers/b1/stats?start=' + f + 'T00:00:00Z&end=' + addD(t, 1) + 'T00:00:00Z&start_date=' + f + '&end_date=' + t, { headers: ADMIN }).then((x) => x.json());
  check('jours à venir : pas de point (null), pas 0 €', r2.series.barber_cents[2] !== null && r2.series.barber_cents[3] === null && r2.series.barber_cents[5] === null, r2.series.barber_cents);
  const r3 = await fetch(BASE + '/api/barbers/b1/stats?start=2026-01-01T00:00:00Z&end=2026-03-01T00:00:00Z&start_date=2026-01-01&end_date=2026-02-28', { headers: ADMIN }).then((x) => x.json());
  check('plus de 31 jours : courbe par semaine', r3.series.unit === 'week' && r3.series.labels[1] === '2026-01-08', r3.series.labels.slice(0, 2));

  const dash = fs.readFileSync(__dirname + '/../../public/dashboard.html', 'utf8');
  check('dashboard : 9 cases (panier moyen, ventes en plus, par heure, RDV ratés) + « vs période préc. »', /'panier moyen <span class="st-help">/.test(dash) && /'ventes en plus /.test(dash) && /'encaissé par heure travaillée'/.test(dash) && /'RDV ratés'/.test(dash) && /vs période préc\./.test(dash));
  check('dashboard : courbe à 3 lignes (plein / tirets / pointillés), légende, infobulle au survol', /function renderBarberChart/.test(dash) && /\.bc-line\.team \{[^}]*stroke-dasharray/.test(dash) && /\.bc-line\.prev \{[^}]*stroke-dasharray/.test(dash) && /bc-legend/.test(dash) && /addEventListener\('mousemove', show\)/.test(dash));

  sql(clean);
  console.log('\nRESULTAT : ' + pass + ' verifications reussies, ' + fail + ' echec(s)');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
