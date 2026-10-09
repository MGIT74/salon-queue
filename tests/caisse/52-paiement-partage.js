// Paiement partage : une part en especes + le reste par carte (bouton "Partager").
const fs = require('fs'), path = require('path'), vm = require('vm');
const rd = (f) => fs.readFileSync(path.join(__dirname, '../../' + f), 'utf8');
const caisse = rd('public/caisse.html'), sales = rd('src/routes/sales.js'), owner = rd('src/routes/owner.js'), schema = rd('sql/schema.sql');
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n + (x ? '  [' + x + ']' : '')); };

console.log('\n[A] Calculs (extraits executes)');
const cut = (src, a, b) => src.slice(src.indexOf(a), src.indexOf(b));
const ctx = vm.createContext({});
vm.runInContext(cut(caisse, 'var PAYMENT_LABELS', 'function askSplitCash') + '\n' + cut(owner, 'function addSaleToMethods', "router.get('/caisse/current-period'"), ctx);
const rows = ctx.paymentRowsFor('partage', 2200, 1000);
check('ticket : deux lignes Especes 10 EUR + Carte 12 EUR', JSON.stringify(rows) === JSON.stringify([['Espèces', 1000], ['Carte bancaire', 1200]]));
check('ticket non partage : une seule ligne', ctx.paymentRowsFor('cb', 2200).length === 1 && ctx.paymentRowsFor('especes', 500)[0][1] === 500);
check('saisie "10", "10,5", "10.50", "7 €" lues en centimes', [ctx.parseEuroToCents('10'), ctx.parseEuroToCents('10,5'), ctx.parseEuroToCents('10.50'), ctx.parseEuroToCents('7 €')].join() === '1000,1050,1050,700');
check('saisie invalide refusee', ctx.parseEuroToCents('abc') === null && ctx.parseEuroToCents('') === null && ctx.parseEuroToCents('-3') === null);
const bm = {};
ctx.addSaleToMethods(bm, { payment_method: 'partage', cash_cents: 1000, total_price_cents: 2200 });
ctx.addSaleToMethods(bm, { payment_method: 'especes', cash_cents: null, total_price_cents: 500 });
ctx.addSaleToMethods(bm, { payment_method: 'cb', cash_cents: null, total_price_cents: 300 });
check('cloture : part especes -> tiroir, reste -> CB', bm.especes === 1500 && bm.cb === 1500 && !bm.partage, JSON.stringify(bm));

console.log('\n[B] Interface caisse');
check('bouton "Partager" present et verrouille pendant un paiement', /id="pay-partage"/.test(caisse) && /pay-partage'\)\.disabled = locked/.test(caisse) && /Partager \(espèces \+ carte\)/.test(caisse));
check('pay("partage") demande d\'abord la part en especes', /method === 'partage' && cashCents === undefined\) \{ askSplitCash\(\)/.test(caisse));
check('montant refuse si <= 0 ou >= total', /cash <= 0 \|\| cash >= total/.test(caisse));
check('tiroir ouvert tout de suite, puis TPE pour la part carte seulement', /method === 'partage'\) \{\s*openCashDrawerOnCash\(\);\s*startTpePayment\(saleCtx\)/.test(caisse) && /amount_cents: saleCtx\.chargeCents != null/.test(caisse) && /chargeCents: method === 'partage' \? total - cashCents/.test(caisse));
check('la vente envoie cash_cents', /cash_cents: saleCtx\.cashCents != null/.test(caisse));
check('carte debitee puis echec d\'enregistrement : meme ecran de reprise que la CB', /saleCtx\.method === 'cb' \|\| saleCtx\.method === 'partage'/.test(caisse));
check('reimpression/historique gardent le partage', /cashCents: s\.cash_cents/.test(caisse) && /partage: 'Espèces \+ carte'/.test(caisse));

console.log('\n[C] Serveur');
check('methode "partage" acceptee', /PAYMENT_METHODS = \['especes', 'cb', 'autre', 'partage'\]/.test(sales));
check('part especes validee (entier, > 0, < total)', /cashCents <= 0 \|\| cashCents >= total/.test(sales) && /Number\.isInteger\(cashCents\)/.test(sales));
check('colonne cash_cents ajoutee (migration gardee)', /column_name = 'cash_cents'[\s\S]*ADD COLUMN cash_cents INT NULL/.test(schema));
check('cloture + periode courante utilisent la ventilation', (owner.match(/addSaleToMethods\(byMethod, s\)/g) || []).length === 3 && (owner.match(/s\.cash_cents/g) || []).length >= 2);
console.log('\n' + pass + ' OK, ' + fail + ' ECHEC'); process.exit(fail ? 1 : 0);
