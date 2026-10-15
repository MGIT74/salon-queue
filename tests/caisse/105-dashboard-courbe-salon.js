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

  const dash = fs.readFileSync(__dirname + '/../../public/dashboard.html', 'utf8');
  check('carte « Encaissé du salon » à la place de « Cette semaine », avec 7 jours / 30 jours / 3 mois', /<h3>Encaissé du salon<\/h3>/.test(dash) && !/<h3>Cette semaine<\/h3>/.test(dash) && /setDashRevenueRange\(7\)/.test(dash) && /setDashRevenueRange\(30\)/.test(dash) && /setDashRevenueRange\(90\)/.test(dash));
  check('même courbe que la fiche coiffeur (fonction partagée), chargée avec le tableau de bord', /function renderRevenueChart\(box, se, opts\)/.test(dash) && /renderRevenueChart\(box, r\.series, \{ me: 'Salon'/.test(dash) && /loadDashRevenue\(\);   \/\/ courbe globale/.test(dash));

  sql(clean);
  console.log('\nRESULTAT : ' + pass + ' verifications reussies, ' + fail + ' echec(s)');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
