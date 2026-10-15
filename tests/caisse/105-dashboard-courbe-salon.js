// Tableau de bord : la carte « Cette semaine » (nombre de RDV par jour) est remplacée par la courbe GLOBALE
// « Encaissé du salon » (7 jours / 30 jours / 3 mois) avec la période précédente - même dessin que la fiche coiffeur.
const { execSync } = require('child_process');
const fs = require('fs');
const BASE = 'http://127.0.0.1:3999';
const sql = (q) => execSync(`mariadb -uroot salonq -N -e "${q.replace(/"/g, '\\"')}"`).toString().trim();
const ADMIN = { 'X-Salon-Slug': 'test', 'X-Admin-Password': 'adminpw' };
const BARBER = { 'X-Salon-Slug': 'test', 'X-Barber-Id': 'b1', 'X-Barber-Pin': '1111' };
let pass = 0, fail = 0;
const check = (n, ok, extra) => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n + (ok || extra === undefined ? '' : '  -> ' + JSON.stringify(extra))); };

(async () => {
  const clean = "DELETE si FROM sale_items si JOIN sales s ON s.id = si.sale_id WHERE s.id LIKE 't105%'; DELETE FROM sales WHERE id LIKE 't105%'";
  sql(clean);
  const sale = (id, barber, at, cents, type) => {
    sql(`INSERT INTO sales (id,salon_id,barber_id,payment_method,total_price_cents,created_at) VALUES ('${id}','s1','${barber}','card',${cents},'${at}')`);
    sql(`INSERT INTO sale_items (id,sale_id,item_type,item_name,unit_price_cents,quantity,barber_id) VALUES ('${id}_0','${id}','${type || 'service'}','x',${cents},1,'${barber}')`);
  };
  // Semaine du 2 au 8 mars 2026 (Paris = UTC+1) et semaine d'avant.
  sale('t105a', 'b1', '2026-03-02 09:00:00', 3000);
  sale('t105b', 'b2', '2026-03-02 10:00:00', 2000);
  sale('t105c', 'b2', '2026-03-05 16:00:00', 1500, 'product');
  sale('t105d', 'b1', '2026-02-25 10:00:00', 4000);
  const get = (q, h) => fetch(BASE + '/api/barbers/salon-series?' + q, { headers: h || ADMIN }).then(async (x) => ({ status: x.status, body: await x.json() }));

  let r = await get('start_date=2026-03-02&end_date=2026-03-08');
  const se = r.body.series;
  check('salon entier (tous les coiffeurs, prestations + produits) : 50 € le lundi, 15 € le jeudi', se.barber_cents[0] === 5000 && se.barber_cents[3] === 1500, se.barber_cents);
  check('total de la période 65 €, période précédente 40 €', r.body.total_cents === 6500 && r.body.previous_total_cents === 4000, r.body);
  check('période précédente sur la courbe : 40 € le mercredi 25 février (3e point)', se.previous_cents[2] === 4000, se.previous_cents);
  check('global : pas de ligne « moyenne de l\'équipe »', se.team_avg_cents === null);
  r = await get('start_date=2026-01-01&end_date=2026-03-31');
  check('3 mois : courbe par semaine', r.body.series.unit === 'week');
  r = await get('start_date=2026-03-08&end_date=2026-03-02');
  check('période à l\'envers : refusée', r.status === 400);
  r = await get('start_date=2026-03-02&end_date=2026-03-08', BARBER);
  check('réservé à l\'admin (un coiffeur avec son code PIN ne voit pas le chiffre du salon)', r.status === 401 || r.status === 403, r.status);

  // Filtre global du tableau de bord : même calcul, + manque à gagner global (somme des coiffeurs actifs).
  sql("DELETE FROM barber_schedules WHERE barber_id IN ('b1','b2'); DELETE FROM barber_breaks WHERE barber_id IN ('b1','b2'); DELETE FROM barber_leaves WHERE barber_id IN ('b1','b2')");
  sql("INSERT INTO barber_schedules (id,barber_id,weekday,start_time,end_time,active) SELECT UUID(),b.id,d.n,'09:00','19:00',1 FROM barbers b JOIN (SELECT 0 n UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5 UNION SELECT 6) d WHERE b.id IN ('b1','b2')");
  const st = await fetch(BASE + '/api/barbers/salon-stats?start=2026-03-01T23:00:00.000Z&end=2026-03-08T23:00:00.000Z&start_date=2026-03-02&end_date=2026-03-08', { headers: ADMIN }).then(async (x) => ({ status: x.status, body: await x.json() }));
  const per = {}; (st.body.per_barber || []).forEach((b) => { per[b.id] = b; });
  check('filtre global (Semaine) : encaissé 65 €, même courbe que ci-dessus', st.status === 200 && st.body.total_cents === 6500 && st.body.series.barber_cents[0] === 5000, st.body.total_cents);
  check('manque à gagner global = somme des coiffeurs actifs, détail par coiffeur', st.body.potential_revenue_cents === (st.body.per_barber || []).reduce((a, b) => a + b.potential_revenue_cents, 0) && per.b1 && per.b2 && st.body.free_slots > 0, st.body);
  const day = await fetch(BASE + '/api/barbers/salon-stats?start=2026-03-01T23:00:00.000Z&end=2026-03-02T23:00:00.000Z&start_date=2026-03-02&end_date=2026-03-02', { headers: ADMIN }).then((x) => x.json());
  check('filtre « Jour » : courbe heure par heure (8 h - 20 h), 30 € à 10 h et 20 € à 11 h (heure de Paris)', day.series.unit === 'hour' && day.series.labels[0] === '2026-03-02T08:00' &&
    day.series.barber_cents[day.series.labels.indexOf('2026-03-02T10:00')] === 3000 && day.series.barber_cents[day.series.labels.indexOf('2026-03-02T11:00')] === 2000, day.series);
  const rv = st.body.revenue || {};
  check('CA général de la période : 65 € (prestations 50 €, produits 15 €), 3 tickets, panier moyen 21,67 €, période préc. 40 €',
    rv.total_cents === 6500 && rv.services_cents === 5000 && rv.products_cents === 1500 && rv.tickets === 3 && rv.avg_ticket_cents === 2167 && rv.previous_total_cents === 4000, rv);
  const lb = st.body.leaderboard || {};
  check('classement sur la période : Bob 35 € devant Alice 30 €, produits : Bob', lb.by_revenue && lb.by_revenue[0].id === 'b2' && lb.by_revenue[0].revenue_cents === 3500 && lb.by_revenue[1].id === 'b1' && lb.by_products[0].id === 'b2', lb);
  r = await fetch(BASE + '/api/barbers/salon-stats?start=2026-03-01T23:00:00.000Z&end=2026-03-08T23:00:00.000Z&start_date=2026-03-02&end_date=2026-03-08', { headers: BARBER });
  check('filtre global réservé à l\'admin', r.status === 401 || r.status === 403, r.status);

  const dash = fs.readFileSync(__dirname + '/../../public/dashboard.html', 'utf8');
  check('en haut du tableau de bord : le même sélecteur que la fiche coiffeur (Jour / Semaine / Mois / Plage, flèches, Du/Au)', /id="stats-picker-salon"/.test(dash) && /setStatsPeriod\('salon','range'\)/.test(dash) && /id="stats-ctl-salon"/.test(dash) && /if \(id === 'salon'\) return loadDashSalon\(\);/.test(dash));
  check('carte « Encaissé du salon » : plus de boutons 7 jours / 30 jours / 3 mois ni de titre « Encaissé par jour » dans la courbe', /<h3>Encaissé du salon<\/h3>/.test(dash) && !/setDashRevenueRange/.test(dash) && /renderRevenueChart\(document\.getElementById\('dash-rev-chart'\), r\.series, \{ me: 'Salon', noTitle: true \}\)/.test(dash));
  check('« Classement » (plus « du jour ») et « CA général » à la place de « File d\'attente », remplis par le filtre global', /<h3>Classement<\/h3>/.test(dash) && !/Classement du jour/.test(dash) && /<h3>CA général<\/h3>/.test(dash) && !/<h3>File d'attente<\/h3>/.test(dash) && /dashLeaderData = r\.leaderboard/.test(dash) && /dash-ca-rows/.test(dash) && !/stats\/week/.test(dash));
  check('« CA de la semaine » remplacé par « Manque à gagner » global (créneaux libres, occupation, détail par coiffeur)', !/<h3>CA de la semaine<\/h3>/.test(dash) && /<h3>Manque à gagner<\/h3>/.test(dash) && /id="dash-missed-list"/.test(dash));

  sql(clean);
  console.log('\nRESULTAT : ' + pass + ' verifications reussies, ' + fail + ' echec(s)');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
