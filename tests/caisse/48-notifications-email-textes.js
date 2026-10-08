// Notifications email : les textes d'origine sont ECRITS dans les champs (plus en gris), modifiables sans casser les jetons.
const fs = require('fs'), path = require('path'), vm = require('vm');
const rd = (f) => fs.readFileSync(path.join(__dirname, '../../' + f), 'utf8');
const dash = rd('public/dashboard.html'), mailer = rd('src/lib/mailer.js');
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n + (x ? '  [' + x + ']' : '')); };
const i = dash.indexOf('var EMAIL_TPL_DEFAULTS'), j = dash.indexOf('function emailTplAllowedTokens');
const ctx = vm.createContext({}); vm.runInContext(dash.slice(i, j).replace('var EMAIL_TPL_DEFAULTS', 'EMAIL_TPL_DEFAULTS'), ctx);
const D = ctx.EMAIL_TPL_DEFAULTS;
console.log('\n[A] Textes d\'origine');
const types = ['confirmation', 'reminder', 'cancelled', 'rescheduled', 'turn-soon', 'closure'];
check('un texte d\'origine (sujet + message) pour chacun des 6 emails', types.every((t) => D[t] && D[t].subject && D[t].body));
const allowed = { confirmation: ['client_name', 'when', 'service_name', 'barber_name', 'salon', 'cancel_url'], reminder: ['client_name', 'service_name', 'when', 'salon'], cancelled: ['client_name', 'when', 'service_name', 'salon', 'custom_message'], rescheduled: ['client_name', 'when', 'service_name', 'barber_name', 'salon', 'cancel_url'], 'turn-soon': ['client_name', 'wait_min', 'salon'], closure: ['client_name', 'when', 'reason', 'salon'] };
check('les textes d\'origine n\'utilisent que des jetons valides pour leur email (aucun jeton inconnu)', types.every((t) => ((D[t].subject + D[t].body).match(/\{\{(\w+)\}\}/g) || []).every((m) => allowed[t].includes(m.slice(2, -2)))));
check('les jetons sont bien geres cote serveur (applyTemplate)', /out\.split\('\{\{' \+ k \+ '\}\}'\)/.test(mailer));

console.log('\n[B] Interface');
check('champs pre-remplis avec le texte d\'origine si rien n\'est enregistre', /\|\| EMAIL_TPL_DEFAULTS\[type\]\.subject/.test(dash) && /\|\| EMAIL_TPL_DEFAULTS\[type\]\.body/.test(dash));
check('texte inchange = enregistre vide (l\'app garde son message d\'origine)', /v\.trim\(\) === d\[f\[0\]\]\.trim\(\) \|\| !v\.trim\(\)\) \? '' : v/.test(dash));
check('jeton inconnu ({{clientname}}) : enregistrement refuse avec message clair', /Jeton inconnu/.test(dash) && /allowed\.indexOf\(name\) === -1/.test(dash));
check('pastilles de jetons (insertion au curseur) + bouton "Rétablir le texte d\'origine"', /className = 'tpl-chip'/.test(dash) && /Rétablir le texte d/.test(dash));

console.log('\n' + pass + ' OK, ' + fail + ' ECHEC');
process.exit(fail ? 1 : 0);
