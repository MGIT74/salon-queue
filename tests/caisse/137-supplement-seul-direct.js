// « Seulement un supplément » : un seul appui suffit, on passe directement a l'etape Supplements (Retour possible),
// partout : en ligne, compte client, borne (des que le prenom est saisi) ; admin / caisse / Mon poste le faisaient deja.
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const check = (n, ok) => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n); };
const rd = (f) => fs.readFileSync(path.join(__dirname, '../../public', f), 'utf8');
check('en ligne', /if \(id === EXTRAS_ONLY\) goToExtrasStep\(\);/.test(rd('rdv.html')));
check('compte client', /if \(id === EXTRAS_ONLY\) goToBookExtrasStep\(\);/.test(rd('compte.html')));
check('borne : des que le prenom est saisi', /if \(id === EXTRAS_ONLY\) \{\s*if \(document\.getElementById\('f-name'\)\.value\.trim\(\)\) goToExtrasStep\(\);/.test(rd('kiosk.html')));
['dashboard.html', 'caisse.html', 'poste.html'].forEach((f) => check(f + ' : toute prestation (dont « supplement seul ») passe aux supplements', /Select[A-Za-z]*Service = function \(el\) \{[\s\S]{0,400}GoStep\('extras'\);/.test(rd(f))));
console.log(`\n${pass} OK, ${fail} ECHEC`);
process.exit(fail ? 1 : 0);
