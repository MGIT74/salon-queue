// Statistiques par coiffeur : TOUT ce qui est encaisse a son nom (prestations, supplements, produits), ligne par ligne.
const fs = require('fs'), path = require('path');
const rd = (p) => fs.readFileSync(path.join(__dirname, '../..', p), 'utf8');
const lib = require('../../src/lib/lineAttribution');
let pass = 0, fail = 0;
const check = (n, ok) => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n); };

(async () => {
  let seen;
  const db = { query: async (sql, params) => { seen = { sql, params }; return [[
    { barber_id: 'b1', barber_name: 'Karim', service_cents: '4500', service_count: '2', product_cents: '1200', product_count: '3' },
    { barber_id: null, barber_name: null, service_cents: '0', service_count: '0', product_cents: '500', product_count: '1' }
  ]]; } };
  const m = await lib.salesRevenueByBarber(db, 's1', { fromSql: '2026-10-01 00:00:00', toSql: '2026-11-01 00:00:00' });
  check('une ligne = un vendeur (sale_items.barber_id) ou, a defaut, le coiffeur de la vente', /COALESCE\(si\.barber_id, s\.barber_id\)/.test(seen.sql));
  check('compte prestations + supplements + produits (pas seulement les produits)', /item_type IN \('service', 'extra'\)/.test(seen.sql) && /item_type = 'product'/.test(seen.sql));
  check('aucune condition sur la file d\'attente : ventes de comptoir comprises', !/queue/i.test(seen.sql));
  check('periode sur la date de la vente, bornes passees en parametres', /s\.created_at >= \?/.test(seen.sql) && /s\.created_at < \?/.test(seen.sql) && seen.params.length === 3);
  check('resultat par coiffeur (nombres)', m.get('b1').service_cents === 4500 && m.get('b1').product_cents === 1200 && m.get('b1').product_count === 3 && m.get('b1').service_count === 2);
  check('vente sans coiffeur : gardee sous « sans coiffeur » (jamais perdue)', m.has(null) && m.get(null).product_cents === 500);
  await lib.salesRevenueByBarber(db, 's1', { sinceToday: true });
  check('aujourd\'hui : depuis minuit', /s\.created_at >= CURDATE\(\)/.test(seen.sql));

  const barbers = rd('src/routes/barbers.js'), queue = rd('src/routes/queue.js'), auto = rd('src/routes/automation.js');
  const stats = barbers.slice(barbers.indexOf("router.get('/:id/stats'"), barbers.indexOf("router.get('/:id/leaves'"));
  check('fiche coiffeur : CA = encaisse a son nom (prestations + produits)', /salesRevenueByBarber/.test(stats) && /revenue_cents: revenueCents \+ productRevenueCents/.test(stats) && /const revenueCents = sold\.service_cents/.test(stats));
  check('classement du tableau de bord : produits inclus dans le CA', /soldMap\.get\(id\)/.test(queue) && /sold\.service_cents \+ sold\.product_cents/.test(queue));
  check('rapport automatique : CA par coiffeur et total = encaisse', /salesRevenueByBarber/.test(auto) && /service_revenue_cents: sold \? sold\.service_cents : 0/.test(auto) && /v\.service_cents \+ v\.product_cents/.test(auto));
  console.log('\n' + pass + ' OK, ' + fail + ' ECHEC'); process.exit(fail ? 1 : 0);
})();
