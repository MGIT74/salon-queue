// Caisse : un client venu pour un supplement seul n'a plus de ligne « Supplément seul 0,00 € » dans le ticket,
// seulement ses supplements. Une vraie prestation reste en 1re ligne.
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n + (x ? '  [' + JSON.stringify(x).slice(0, 160) + ']' : '')); };
const c = fs.readFileSync(path.join(__dirname, '../../public/caisse.html'), 'utf8');
const ctx = { EXTRAS_ONLY_NAME: 'Supplément seul' }; vm.createContext(ctx);
vm.runInContext(c.match(/function ticketServiceLine\([\s\S]*?\n\}\n/)[0], ctx);
let t = ctx.ticketServiceLine({ service: { id: 'supplement-seul-s1', name: 'Supplément seul', price_cents: 0 }, extras: [{ id: 'e1' }] }, 'b1');
check('supplement seul : aucune ligne de prestation', t.length === 0, t);
t = ctx.ticketServiceLine({ service: { id: 'sv1', name: 'Coupe', price_cents: 2000 }, extras: [] }, 'b1');
check('vraie prestation : ligne gardee', t.length === 1 && t[0].item_id === 'sv1' && t[0].unit_price_cents === 2000 && t[0].barber_id === 'b1', t);
check('les deux chemins (a encaisser, encaisser a l\'avance) utilisent la regle', (c.match(/ticket = ticketServiceLine\(q, doneBy\);/g) || []).length === 2);
console.log(`\n${pass} OK, ${fail} ECHEC`);
process.exit(fail ? 1 : 0);
