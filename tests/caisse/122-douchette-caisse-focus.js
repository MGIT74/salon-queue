// Caisse : la douchette « tape » dans un champ invisible. Un clic hors de la zone Caisse (pastille d'un coiffeur...)
// lui enlevait le focus et le scan suivant partait dans le vide, sans message. Desormais la premiere touche recue
// (quand personne n'ecrit dans un champ et qu'aucune fenetre n'est ouverte) lui redonne le focus avant d'etre tapee.
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const check = (n, ok) => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n); };
const c = fs.readFileSync(path.join(__dirname, '../../public/caisse.html'), 'utf8');
check('ecoute du clavier sur toute la page, avant les autres (capture)', /document\.addEventListener\('keydown', function \(e\) \{\s*if \(e\.ctrlKey \|\| e\.metaKey\) return;[\s\S]{0,200}scanCatcher\.focus\(\);\s*\}, true\);/.test(c));
check('caracteres et Alt (douchettes Alt + pave numerique)', /if \(!\(e\.key && e\.key\.length === 1\) && e\.key !== 'Alt'\) return;/.test(c));
check('jamais pendant la saisie dans un autre champ', /function scanTargetFree\(\) \{[\s\S]*a\.tagName === 'INPUT' \|\| a\.tagName === 'TEXTAREA'/.test(c));
check('jamais avec une fenetre ou un tiroir ouvert, ni sur l\'ecran de connexion', /function scanTargetFree\(\) \{[\s\S]*\.modal-overlay, \.modal-backdrop'\)\) return false;[\s\S]*login-screen/.test(c));
check('seulement sur l\'onglet Caisse', /return document\.getElementById\('panel-caisse'\)\.classList\.contains\('on'\);\s*\}/.test(c));
check('le champ invisible et la lecture a Entree existent toujours', /id="scan-catcher"/.test(c) && /if \(e\.key !== 'Enter' && e\.key !== 'Tab'\) return;/.test(c));
console.log(`\n${pass} OK, ${fail} ECHEC`);
process.exit(fail ? 1 : 0);
