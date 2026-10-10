// L'assistant IA doit connaitre les encaissements reels de la caisse (table sales), pas seulement la file d'attente.
const fs = require('fs'), path = require('path');
const a = fs.readFileSync(path.join(__dirname, '../../src/routes/automation.js'), 'utf8');
let pass = 0, fail = 0;
const check = (n, ok) => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n); };
check('route /salons/:id/sales protegee par la cle d\'automatisation', /router\.get\('\/salons\/:id\/sales', requireAutomationKey/.test(a));
check('resume de caisse lit sales + sale_items', /FROM sales WHERE salon_id/.test(a) && /FROM sale_items si JOIN sales s/.test(a));
check('paiement partage ventile en especes + carte', /payment_method === 'partage' && s\.cash_cents != null/.test(a) && /byMethod\.cb = \(byMethod\.cb \|\| 0\)/.test(a));
check('daily-report expose register_today', /register_today = await registerSummary/.test(a) && /\n    register_today,/.test(a));
check('dates de /sales validees (AAAA-MM-JJ) avant la requete', /\^\\d\{4\}-\\d\{2\}-\\d\{2\}\$\/\.test\(req\.query\.start/.test(a));
check('requete des lignes parametree (IN (?))', /WHERE si\.sale_id IN \(\?\)/.test(a));
console.log('\n' + pass + ' OK, ' + fail + ' ECHEC'); process.exit(fail ? 1 : 0);
