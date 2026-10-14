// Produit « caisse seulement » : option par produit (online_bookable), jamais propose a la reservation en ligne.
const fs = require('fs'), path = require('path');
const rd = (p) => fs.readFileSync(path.join(__dirname, '../..', p), 'utf8');
let pass = 0, fail = 0;
const check = (n, ok) => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n); };
const schema = rd('sql/schema.sql'), cat = rd('src/routes/catalog.js'), appt = rd('src/routes/appointments.js');
const rdv = rd('public/rdv.html'), compte = rd('public/compte.html'), dash = rd('public/dashboard.html');
check('schema : colonne products.online_bookable (defaut 1, idempotente)', /column_name = 'online_bookable'/.test(schema) && /ADD COLUMN online_bookable TINYINT\(1\) NOT NULL DEFAULT 1/.test(schema));
check('API : creation et modification d\'un produit', /const onlineBookable = req\.body\.online_bookable/.test(cat) && /sets\.push\('online_bookable = \?'\)/.test(cat));
check('API : modification groupee (produits seulement)', /table === 'products' && req\.body\.online_bookable !== undefined/.test(cat));
check('reservation en ligne (serveur) : refuse les produits caisse seulement', /FROM products WHERE id IN \(\?\) AND salon_id = \? AND online_bookable = 1/.test(appt));
check('creation de rdv par l\'equipe (admin-create) : non restreinte (seules la reservation en ligne simple et groupee le sont)', (appt.match(/online_bookable = 1/g) || []).length === 2
  && !/router\.post\('\/admin-create'[\s\S]*?online_bookable = 1/.test(appt.slice(appt.indexOf("router.post('/admin-create'"), appt.indexOf("router.post('/admin-create'") + 6000).split("router.post('/cancel")[0]));
check('page de reservation : produits filtres', /products = r\[2\]\.items\.filter\(function \(p\) \{ return p\.online_bookable !== 0/.test(rdv));
check('reservation du compte client : produits filtres', /bookProducts = r\[2\]\.items\.filter\(function \(p\) \{ return p\.online_bookable !== 0/.test(compte));
check('dashboard : case dans la fiche produit', /id="sc-online"/.test(dash) && /body\.online_bookable = document\.getElementById\('sc-online'\)\.checked/.test(dash));
check('dashboard : action groupee + mention « caisse seulement »', /id="cb-online"/.test(dash) && /body\.online_bookable = online === '1'/.test(dash) && /caisse seulement/.test(dash));
console.log('\n' + pass + ' OK, ' + fail + ' ECHEC'); process.exit(fail ? 1 : 0);
