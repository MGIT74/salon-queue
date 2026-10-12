// Catalogue (prestations, supplements, produits) : cases a cocher, modification groupee (TVA, prix), archiver, reactiver, supprimer.
const fs = require('fs'), path = require('path');
const rd = (p) => fs.readFileSync(path.join(__dirname, '../..', p), 'utf8');
const cat = rd('src/routes/catalog.js'), dash = rd('public/dashboard.html');
let pass = 0, fail = 0;
const check = (n, ok) => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n); };
check('API : POST /<table>/bulk reserve a l\'admin, pour les 3 catalogues', /\['services', 'extras', 'products'\]\.forEach\(\(table\) => \{\s*router\.post\('\/' \+ table \+ '\/bulk', requireAdmin/.test(cat));
['archive', 'restore', 'edit', 'delete'].forEach((a) => check('API : action ' + a, cat.includes("'" + a + "'")));
check('API : ne touche que les articles du salon', /WHERE salon_id = \? AND deleted_at IS NULL AND id IN \(\?\)/.test(cat));
check('API : suppression groupee = meme logique que la suppression simple (historique conserve)', /removeCatalogItem\(table, salonId, id\)/.test(cat) && /async function removeCatalogItem/.test(cat));
check('API : edit valide TVA et prix', /Taux de TVA inconnu/.test(cat) && /Prix invalide/.test(cat) && /Rien à modifier/.test(cat));
check('dashboard : case a cocher sur chaque ligne', /class="cat-check"/.test(dash));
check('dashboard : tout selectionner + compteur', /Tout sélectionner/.test(dash) && /toggleCatSelAll/.test(dash));
check('dashboard : barre Modifier / Archiver / Reactiver / Supprimer', /openCatBulkEdit/.test(dash) && /catBulk\(\\'' \+ table \+ '\\',\\'archive/.test(dash) && /\\'restore\\'/.test(dash) && /\\'delete\\'/.test(dash));
check('dashboard : fenetre de modification groupee (TVA + prix)', /id="sheet-catbulk"/.test(dash) && /id="cb-vat"/.test(dash) && /id="cb-price"/.test(dash));
check('dashboard : confirmation avant archivage / suppression groupes', /Supprimer définitivement ' \+ n/.test(dash));
console.log('\n' + pass + ' OK, ' + fail + ' ECHEC'); process.exit(fail ? 1 : 0);
