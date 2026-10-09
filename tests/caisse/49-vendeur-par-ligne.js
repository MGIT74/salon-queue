// Vendeur/réalisateur par ligne (prestations, suppléments, produits) + stats par coiffeur.
const fs = require('fs'), path = require('path');
const rd = (f) => fs.readFileSync(path.join(__dirname, '../../' + f), 'utf8');
const caisse = rd('public/caisse.html'), sales = rd('src/routes/sales.js'), lib = rd('src/lib/lineAttribution.js');
let pass = 0, fail = 0;
const check = (n, ok) => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n); };
console.log('\n[A] Caisse');
check('bulle vendeur affichée sur toutes les lignes', /lineSellerBubbleHtml\(l, i\)/.test(caisse) && !/item_type === 'product' \? lineSellerBubbleHtml/.test(caisse));
check('ticket en attente : prestation + suppléments reçoivent le coiffeur de la file', /doneBy = q\.barber_id \|\| activeBarberId/.test(caisse) && /item_type: 'extra'[^\n]*barber_id: doneBy/.test(caisse));
check('ajout manuel : coiffeur actif (ou celui de la file) pour tout type', /var lineBarberId = activeBarberId \|\| null;/.test(caisse) && /pq\.barber_id/.test(caisse));
check('libellés adaptés par type', /Qui a réalisé cette prestation/.test(caisse) && /Qui a réalisé ce supplément/.test(caisse) && /Qui a vendu ce produit/.test(caisse));
console.log('\n[B] Serveur');
check('validation du coiffeur de ligne pour tous les types', /lineBarberIds = \[\.\.\.new Set\(cleanItems\.filter/.test(sales) && !/item_type === 'product'\)\.map/.test(sales));
check('transferts calculés pour service/extra seulement', /item_type IN \('service', 'extra'\)/.test(lib) && /si\.barber_id <> q\.barber_id/.test(lib));
for (const f of ['automation', 'barbers', 'queue']) check('stats ' + f + ' appliquent les transferts', /applyTransfers/.test(rd('src/routes/' + f + '.js')));
console.log('\n' + pass + ' OK, ' + fail + ' ECHEC');
process.exit(fail ? 1 : 0);
