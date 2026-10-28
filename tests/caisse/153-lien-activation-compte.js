// Lien d'activation du compte client : message clair apres le clic (avant : simple ecran « Connectez-vous », le client
// croyait que le lien ne marchait pas), 2e clic = « deja active » (avant : « lien invalide »), lien expire = renvoi propose.
const fs = require('fs'), path = require('path');
const rd = (f) => fs.readFileSync(path.join(__dirname, '../../' + f), 'utf8');
const api = rd('src/routes/clientAuth.js'), compte = rd('public/compte.html');
let pass = 0, fail = 0;
const check = (n, ok) => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n); };
const route = api.slice(api.indexOf("router.post('/verify-email'"), api.indexOf("router.post('/resend-verification'"));
check('serveur : le jeton est garde apres activation (2e clic reconnu)', !/verify_token = NULL/.test(route) && /SELECT id, email, pending_email, email_verified, verify_token_expires > NOW\(\) AS still_valid FROM clients WHERE verify_token = \?/.test(route));
check('serveur : deja active -> ok + already', /if \(client\.email_verified && !client\.pending_email\) return res\.json\(\{ ok: true, already: true/.test(route));
check('serveur : expire -> expired + email (pour renvoyer un lien)', /expired: true, email:/.test(route));
check('serveur : activation renvoie l\'email', /res\.json\(\{ ok: true, email: client\.pending_email \|\| client\.email \}\)/.test(route));
check('ecran : message vert « Votre compte est activé » + email pre-rempli', /id="login-ok"/.test(compte) && /✓ Votre compte est activé ! Connectez-vous/.test(compte) && /document\.getElementById\('li-email'\)\.value = d\.email/.test(compte));
check('ecran : 2e clic « deja activé »', /✓ Votre compte est déjà activé/.test(compte));
check('ecran : lien expire -> bouton « Renvoyer le lien de confirmation »', /if \(e\.data && e\.data\.expired\) document\.getElementById\('resend-btn'\)\.style\.display = ''/.test(compte));
console.log('\n' + pass + ' OK, ' + fail + ' ECHEC');
process.exit(fail ? 1 : 0);
