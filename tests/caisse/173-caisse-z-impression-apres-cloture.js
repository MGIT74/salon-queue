// Caisse : imprimer le ticket Z juste après la clôture. Avant, le contrôle « caisse fermée » (toutes les 30 s)
// fermait la session du coiffeur pendant que le Z était affiché : l'impression partait sans code PIN (401) et
// affichait « Pont d'impression indisponible » alors que le pont marchait (dans l'admin, aucun souci).
const fs = require('fs'), path = require('path');
const c = fs.readFileSync(path.join(__dirname, '../../public/caisse.html'), 'utf8');
let pass = 0, fail = 0;
const check = (n, ok) => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n); };
check('caisse fermée : pas de déconnexion tant que le ticket Z est affiché', c.includes("if (me && !paymentInFlight && !zOpen) { logout(); showLoginOrLocked(); }") && /var zOpen = document\.getElementById\('z-overlay'\)/.test(c));
check('impression du Z avec la session du coiffeur qui a affiché le Z (même déconnecté entre-temps)', /function zApi\(path, opts\)/.test(c) && c.includes("if (me) zSessionMe = me;") && /zApi\('\/api\/tpe\/print'/.test(c) && /zApi\('\/api\/settings\/public'\)/.test(c));
check('message d\'erreur : le vrai motif, plus « Pont d\'impression indisponible »', !c.includes("Pont d\\'impression indisponible") && c.includes("Impression du ticket Z impossible : "));
check('fermer le Z ramène toujours à l\'écran « Caisse fermée »', /function closeZTicket\(\) \{[\s\S]{0,160}if \(postCloseReset\) \{ postCloseReset = false; resetAfterClosing\(\); \}/.test(c));
console.log('\n' + pass + ' OK, ' + fail + ' ECHEC');
process.exit(fail ? 1 : 0);
