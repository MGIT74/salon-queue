// TVA nommees : liste de taux (nom + %) geree par l'admin, taux choisi par article, photographie sur chaque ligne de vente.
const fs = require('fs'), path = require('path');
const rd = (p) => fs.readFileSync(path.join(__dirname, '../..', p), 'utf8');
const schema = rd('sql/schema.sql'), vat = rd('src/lib/vat.js'), catalog = rd('src/routes/catalog.js');
const sales = rd('src/routes/sales.js'), owner = rd('src/routes/owner.js'), settings = rd('src/routes/settings.js');
const dash = rd('public/dashboard.html'), caisse = rd('public/caisse.html');
let pass = 0, fail = 0;
const check = (n, ok) => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n); };

check('schema : table vat_rates (nom + taux)', /CREATE TABLE IF NOT EXISTS vat_rates[\s\S]{0,300}name VARCHAR\(100\)[\s\S]{0,100}rate DECIMAL\(5,2\)/.test(schema));
['services', 'extras', 'products'].forEach((t) => check('schema : ' + t + '.vat_rate_id', new RegExp("table_name = '" + t + "' AND column_name = 'vat_rate_id'").test(schema)));
check('schema : sale_items.vat_rate (photo du taux)', /table_name = 'sale_items' AND column_name = 'vat_rate'/.test(schema));
check('migration : liste creee depuis les anciens taux par categorie', /seedFromLegacy/.test(vat) && /vat_rate_service/.test(vat) && /UPDATE \$\{TABLES\[type\]\} SET vat_rate_id/.test(vat));
check('catalogue : articles renvoient vat_rate / vat_rate_name', /annotateItems/.test(catalog) && /vat_rate_name/.test(vat));
check('catalogue : creation et modification acceptent vat_rate_id (services, supplements, produits)', (catalog.match(/normalizeVatRateId/g) || []).length >= 5);
check('ventes : le taux de chaque ligne est enregistre', /vat_rate(, queue_id)?\) VALUES \?/.test(sales) && /rateForItem/.test(sales));
check('ticket Z : utilise le taux photographie', /si\.vat_rate/.test(owner) && /vatRateFor\(it\.item_type, it\.vat_rate\)/.test(owner));
check('reglages : GET/PUT /vat-rates (admin)', /router\.get\('\/vat-rates', requireAdmin/.test(settings) && /router\.put\('\/vat-rates', requireAdmin/.test(settings));
check('reglages : nom obligatoire + taux 0-100', /Chaque TVA doit avoir un nom/.test(settings) && /entre 0 et 100/.test(settings));
check('reglages : supprimer un taux repasse ses articles sur le premier', /SET vat_rate_id = \?[\s\S]{0,120}vat_rate_id IN/.test(settings));
check('dashboard : plus de champs fixes par categorie', !/id="set-vat-(service|extra|product)"/.test(dash));
check('dashboard : bouton "+ Ajouter une TVA"', /\+ Ajouter une TVA/.test(dash) && /addVatRateRow/.test(dash));
check('dashboard : menu TVA dans la fiche article', /id="sc-vat"/.test(dash) && /body\.vat_rate_id = vatVal/.test(dash));
check('caisse : taux par ligne (vente > catalogue > categorie)', /function vatRateFor\(line\)/.test(caisse) && /vatByItem\[/.test(caisse) && !/vatRateFor\(l\.item_type\)/.test(caisse));
console.log('\n' + pass + ' OK, ' + fail + ' ECHEC'); process.exit(fail ? 1 : 0);
