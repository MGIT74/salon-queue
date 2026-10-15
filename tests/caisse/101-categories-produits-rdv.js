// Étape « Produits » des réservations (en ligne, compte client, dashboard, caisse, Mon poste) : pastilles de
// catégories (Tous / chaque catégorie / Autres) et seuls les produits « disponibles en ligne » sont proposés.
const { execSync } = require('child_process');
const fs = require('fs');
const BASE = 'http://127.0.0.1:3999';
const sql = (q) => execSync(`mariadb -uroot salonq -N -e "${q.replace(/"/g, '\\"')}"`).toString().trim();
const ADMIN = { 'Content-Type': 'application/json', 'X-Salon-Slug': 'test', 'X-Admin-Password': 'adminpw' };
let pass = 0, fail = 0;
const check = (n, ok, extra) => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n + (ok || extra === undefined ? '' : '  -> ' + JSON.stringify(extra))); };
const pub = (f) => fs.readFileSync(__dirname + '/../../public/' + f, 'utf8');

(async () => {
  const clean = "DELETE FROM appointments WHERE client_name='T101'; DELETE FROM products WHERE id IN ('t101a','t101b'); DELETE FROM catalog_categories WHERE id='t101c'";
  sql(clean);
  sql("UPDATE barbers SET accepts_appointments=1, active=1 WHERE id='b1'; DELETE FROM barber_schedules WHERE barber_id='b1'");
  sql("INSERT INTO barber_schedules (id,barber_id,weekday,start_time,end_time,active) SELECT UUID(),'b1',d.n,'09:00','19:00',1 FROM (SELECT 0 n UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5 UNION SELECT 6) d");
  sql("INSERT INTO catalog_categories (id,salon_id,kind,name,sort_order) VALUES ('t101c','s1','products','Boissons T101',9)");
  sql("INSERT INTO products (id,salon_id,name,price_cents,category_id,active,online_bookable) VALUES ('t101a','s1','Soda T101',200,'t101c',1,1),('t101b','s1','Caisse seule T101',300,'t101c',1,0)");

  const r = await fetch(BASE + '/api/catalog/categories', { headers: { 'X-Salon-Slug': 'test' } }).then((x) => x.json());
  check('catégories de produits lisibles sans connexion (réservation en ligne)', r.categories.products.some((c) => c.id === 't101c' && c.name === 'Boissons T101'), r);

  const D = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
  const av = await fetch(BASE + '/api/appointments/availability?date=' + D + '&service_id=sv1&barber_id=b1', { headers: ADMIN }).then((x) => x.json());
  const T = av.slots && av.slots.length ? av.slots[0].time : '15:00';
  const res = await fetch(BASE + '/api/appointments/admin-create', { method: 'POST', headers: ADMIN, body: JSON.stringify({ client_name: 'T101', service_id: 'sv1', barber_id: 'b1', date: D, time: T, products: [{ id: 't101a', quantity: 1 }, { id: 't101b', quantity: 1 }] }) });
  const body = await res.json();
  check('RDV ajouté par le salon : un produit « caisse seulement » n\'est pas rattaché au RDV', res.status === 200 &&
    sql("SELECT GROUP_CONCAT(product_id) FROM appointment_products ap JOIN appointments a ON a.id = ap.appointment_id WHERE a.client_name='T101'") === 't101a', body);

  const app = pub('app.js');
  check('pastilles de catégories dans les étapes Produits (avec recherche), pas sur la grille de la caisse', /var withCats = cfg\.kind === 'products' && cfg\.searchId/.test(app) && /function vitrineCatChipsHtml/.test(app) && /chip\('', 'Tous', cfg\.items\.length\)/.test(app));
  check('regroupement par catégories de l\'admin (dans son ordre), « Autres » pour le reste', /cats\.forEach\(function \(c\) \{ byId\[c\.id\] = \[\]; \}\)/.test(app) && /title: 'Autres', id: '__none'/.test(app));
  check('catégorie et recherche se combinent', /\(!q \|\| c\.getAttribute\('data-name'\)\.indexOf\(q\) !== -1\) && \(!f \|\| c\.getAttribute\('data-cat'\) === f\)/.test(app));
  check('dashboard, caisse et Mon poste : seulement les produits disponibles en ligne', ['dashboard.html', 'caisse.html', 'poste.html'].every((f) => /products\.filter\(function \(p\) \{ return p\.online_bookable !== 0; \}\)/.test(pub(f))));
  check('réservation en ligne et compte client : même règle', /online_bookable !== 0/.test(pub('rdv.html')) && /online_bookable !== 0/.test(pub('compte.html')));
  check('style des pastilles dans app.css', /\.vitrine-cat\.on \{/.test(fs.readFileSync(__dirname + '/../../public/app.css', 'utf8')));

  sql(clean);
  console.log('\nRESULTAT : ' + pass + ' verifications reussies, ' + fail + ' echec(s)');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
