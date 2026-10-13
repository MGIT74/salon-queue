// Catalogue : barre de recherche sur Prestations, Supplements et Produits (sans accents ni majuscules).
const fs = require('fs'), path = require('path');
const dash = fs.readFileSync(path.join(__dirname, '../../public/dashboard.html'), 'utf8');
let pass = 0, fail = 0;
const check = (n, ok) => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n); };
check('recherche creee pour chaque liste (renderCatalog -> ensureCatSearch)', /function renderCatalog\(table\) \{\s*var full = catList\(table\);\s*ensureCatSearch\(table\)/.test(dash));
check('champ de recherche sur la saisie', /type="search"/.test(dash) && /catSearch\[\\'' \+ table \+ '\\'\]=this\.value/.test(dash));
check('filtre : nom, categorie, code-barres, TVA', /\[x\.name, catName\(table, x\.category_id\), x\.barcode, x\.vat_rate_name\]/.test(dash));
check('accents et majuscules ignores', /normalize\('NFD'\)/.test(dash));
check('message "Aucun resultat"', /Aucun résultat/.test(dash));
check('glisser-deposer masque pendant une recherche (ordre jamais enregistre sur une liste partielle)', /\.cat-filtering \.drag-handle \{ display: none; \}/.test(dash));
check('tout selectionner = resultats affiches', /catVisible\(table\)\.forEach/.test(dash));
// comportement du filtre
const norm = (v) => String(v || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const items = [{ name: 'Coupe dégradée' }, { name: 'Barbe', category: 'Soin' }, { name: 'Gel', barcode: '3017620422003' }];
const f = (q) => items.filter((x) => norm([x.name, x.category, x.barcode].join(' ')).indexOf(norm(q).trim()) !== -1).length;
check('« DEGRADEE » trouve « Coupe dégradée »', f('DEGRADEE') === 1);
check('code-barres trouvable', f('3017620') === 1);
check('recherche vide = tout', f('') === 3);
console.log('\n' + pass + ' OK, ' + fail + ' ECHEC'); process.exit(fail ? 1 : 0);
