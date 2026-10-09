// Ticket : chaque clic sur une carte ajoute une ligne separee (un coiffeur par ligne) ; +/- ajuste la quantite.
const fs = require('fs'), path = require('path'), vm = require('vm');
const c = fs.readFileSync(path.join(__dirname, '../../public/caisse.html'), 'utf8');
let pass = 0, fail = 0;
const check = (n, ok) => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n); };
const src = c.slice(c.indexOf('function addToTicket'), c.indexOf('function changeQty'));
const ctx = vm.createContext({ ticket: [], activeBarberId: 'b1', ticketQueueId: null, pendingPayments: [], renderTicket() {}, calls: 0 });
vm.runInContext(src + '\nthis.add = addToTicket;', ctx);
ctx.add('service', 's1', 'Coupe', 1500); ctx.add('service', 's1', 'Coupe', 1500); ctx.add('service', 's1', 'Coupe', 1500);
check('3 clics sur la meme prestation = 3 lignes de quantite 1', ctx.ticket.length === 3 && ctx.ticket.every((l) => l.quantity === 1));
ctx.ticket[1].barber_id = 'b2';
check('chaque ligne peut avoir son propre coiffeur', ctx.ticket.map((l) => l.barber_id).join() === 'b1,b2,b1');
ctx.ticket.length = 0;
ctx.add('product', 'p1', 'Cire', 1000, { merge: true }); ctx.add('product', 'p1', 'Cire', 1000, { merge: true });
check('scanner : produits identiques du meme vendeur regroupes en quantite', ctx.ticket.length === 1 && ctx.ticket[0].quantity === 2);
check('scanner appelle addToTicket avec merge', /product\.price_cents, \{ merge: true \}/.test(c));
check('boutons + / - de ligne inchanges', /changeQty\(' \+ i \+ ',-1\)/.test(c) && /changeQty\(' \+ i \+ ',1\)/.test(c));
console.log('\n' + pass + ' OK, ' + fail + ' ECHEC'); process.exit(fail ? 1 : 0);
