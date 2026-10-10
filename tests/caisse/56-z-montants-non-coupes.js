// Ticket Z / reçu : le montant et la devise ne passent jamais seuls a la ligne (le libelle, lui, retourne a la ligne).
const fs = require('fs'), path = require('path');
const rd = (f) => fs.readFileSync(path.join(__dirname, '../../' + f), 'utf8');
let pass = 0, fail = 0;
const check = (n, ok) => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n); };
for (const f of ['public/caisse.html', 'public/dashboard.html']) {
  const c = rd(f);
  check(f + ' : Z - montant sur une seule ligne (nowrap, ne retrecit pas)', /\.z-box \.zline > span:last-child:not\(:first-child\) \{ flex: 0 0 auto; white-space: nowrap/.test(c));
  check(f + ' : Z - libelle retourne a la ligne (min-width 0)', /\.z-box \.zline > span:first-child \{ flex: 1 1 auto; min-width: 0; overflow-wrap: anywhere/.test(c));
}
const c = rd('public/caisse.html');
check('recu : meme protection du montant', /\.receipt-box \.rline > span:last-child:not\(:first-child\) \{ flex: 0 0 auto; white-space: nowrap/.test(c));
console.log('\n' + pass + ' OK, ' + fail + ' ECHEC'); process.exit(fail ? 1 : 0);
