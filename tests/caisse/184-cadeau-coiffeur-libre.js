// Carte cadeau : le client choisit librement son coiffeur (compte client, réservation en ligne, borne).
// Il n'est plus bloqué sur le coiffeur qui a encaissé le cadeau en caisse.
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const check = (n, ok) => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n); };
const rd = (f) => fs.readFileSync(path.join(__dirname, '../..', f), 'utf8');
const rdv = rd('public/rdv.html'), compte = rd('public/compte.html'), kiosk = rd('public/kiosk.html'), sales = rd('src/routes/sales.js');
check('réservation en ligne : plus de saut automatique vers le coiffeur du cadeau', !/selectBarber\(null, g\.designated_barber\.id\)/.test(rdv) && !/activeGift\.designated_barber \|\|/.test(rdv));
check('compte client : idem', !/selectBookBarber\(null, g\.designated_barber\.id\)/.test(compte) && !/activeBookGift\.designated_barber \|\|/.test(compte));
check('borne : idem', !/pickBarberAndGo\(g\.designated_barber\.id\)/.test(kiosk));
check('un coiffeur « sans rendez-vous » ne bloque plus la réservation du cadeau', /const walkInOnly = false;/.test(sales));
check('compte client : coiffeurs au-dessus des créneaux aussi avec un cadeau (comme un RDV normal)', !/if \(activeBookGift \|\| !selBookService\) \{ box\.style\.display = 'none'/.test(compte) && /if \(activeBookGift\) renderGiftSummaryBox\(\);/.test(compte));
console.log('\n' + pass + ' OK, ' + fail + ' ECHEC');
process.exit(fail ? 1 : 0);
