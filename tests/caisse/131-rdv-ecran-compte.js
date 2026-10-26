// Prise de RDV en ligne : premier ecran « Se connecter / Créer un compte / Continuer sans compte ». Apres connexion
// (ou inscription), la page compte ouvre directement la reservation. Mode salon et lien d'annulation : pas d'ecran.
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n + (x ? '  [' + String(x).slice(0, 160) + ']' : '')); };
const rd = (f) => fs.readFileSync(path.join(__dirname, '../../public', f), 'utf8');
const r = rd('rdv.html'), c = rd('compte.html');
check('premier ecran affiche au chargement', /<section class="panel flow on gb-pick" id="p-start">/.test(r) && /<section class="panel flow gb-pick" id="p-group">/.test(r));
check('3 choix : se connecter, creer un compte, sans compte', r.includes('id="start-login"') && r.includes('id="start-signup"') && r.includes('id="start-guest"') && r.includes('Continuer sans compte'));
check('se connecter -> compte + reservation', /function goLogin\(e, book\) \{[^\n]*accountUrl\(book \? 'book=1' : ''\)/.test(r));
check('creer un compte -> formulaire d\'inscription + reservation', r.includes("accountUrl('signup=1&book=1')"));
check('sans compte -> « Pour qui est le rendez-vous ? », avec retour', r.includes("function startAsGuest() { show('p-group'); }") && r.includes('class="back start-back"'));
check('mode salon : pas d\'ecran de connexion', /staff=1[^\n]*p-start'\)\.classList\.remove\('on'\)/.test(r));
check('lien d\'annulation / « Réserver à nouveau » : pas d\'ecran', /\(cancel\|service\)=[^\n]*p-start'\)\.classList\.remove\('on'\)/.test(r));
check('deja connecte : « Réserver avec mon compte »', r.includes("'Réserver avec mon compte'"));
check('compte : ?book=1 ouvre la reservation apres connexion', /if \(WANT_BOOK\) \{ WANT_BOOK = false;[^\n]*goBook\(\); return; \}/.test(c));
check('compte : ?signup=1 ouvre l\'inscription', c.includes("show(params.get('signup') === '1' ? 'p-signup' : 'p-login');"));
console.log(`\n${pass} OK, ${fail} ECHEC`);
process.exit(fail ? 1 : 0);
