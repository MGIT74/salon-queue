// Apres une cloture : la caisse revient seule a l'ecran de depart (Caisse fermee / code PIN), sans rafraichir a la main.
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '../../public/caisse.html'), 'utf8');
let pass = 0, fail = 0;
const check = (n, ok) => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n); };
check('cloture reussie -> marque la remise a zero', /barberApi\('\/api\/owner\/caisse\/close'[\s\S]{0,400}postCloseReset = true;\s*printZTicket/.test(src));
check('fermer le ticket Z -> retour a l\'ecran de depart', /function closeZTicket\(\) \{[\s\S]{0,200}if \(postCloseReset\) \{ postCloseReset = false; resetAfterClosing\(\); \}/.test(src));
check('on quitte la session (le PIN n\'est plus valable)', /function resetAfterClosing\(\) \{\s*logout\(\);\s*showLoginOrLocked\(\);/.test(src));
check('heure de reouverture pas atteinte -> ecran « Caisse fermee »', /locked \? 'none' : ''/.test(src) && /locked \? 'block' : 'none'/.test(src) && /Réouverture prévue le/.test(src));
check('heure atteinte -> saisie du code PIN (carte normale)', /login-card-normal'\)\.style\.display = locked/.test(src));
check('ecran « Caisse fermee » laisse affiche -> bascule seul vers le PIN a l\'heure', /setInterval\(function \(\) \{\s*var locked = document\.getElementById\('login-card-locked'\)/.test(src));
console.log('\n' + pass + ' OK, ' + fail + ' ECHEC'); process.exit(fail ? 1 : 0);
