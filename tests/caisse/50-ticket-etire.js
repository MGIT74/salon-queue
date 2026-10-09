// Ticket en cours (desktop) : lignes extensibles, boutons compacts, la liste d'articles garde son defilement.
const fs = require('fs'), path = require('path');
const c = fs.readFileSync(path.join(__dirname, '../../public/caisse.html'), 'utf8');
let pass = 0, fail = 0;
const check = (n, ok) => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n); };
check('lignes du ticket non bridees (flex:none, overflow visible) sur desktop', /#panel-caisse \.ticket-lines \{ flex: none; overflow: visible/.test(c));
check('le panneau ticket defile seulement s\'il depasse', /#panel-caisse \.ticket-panel \{ overflow-y: auto/.test(c));
check('boutons Especes/CB compacts (plus carres)', /\.pay-grid button \{ aspect-ratio: auto; min-height: 0; height: 64px/.test(c));
check('le defilement de la liste des cartes est conserve', /#panel-caisse #item-grid \{ flex: 1 1 auto; min-height: 0; overflow-y: auto/.test(c));
check('regles dans le bloc desktop (min-width: 861px) : mobile inchange', c.indexOf('#panel-caisse .ticket-lines { flex: none') > c.indexOf('@media (min-width: 861px) {\n    body:has(#panel-caisse.on #item-grid)'));
check('bloc de paiement colle en bas du panneau ticket (desktop)', /#panel-caisse \.ticket-panel \.pay-grid \{ margin-top: auto/.test(c));
console.log('\n' + pass + ' OK, ' + fail + ' ECHEC'); process.exit(fail ? 1 : 0);
