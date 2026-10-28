// Mon poste sur tablette : page elargie et calendrier aere a partir de 700 px ; en paysage (1000 px et plus) le
// planning du jour s'affiche a droite du calendrier. Telephone (moins de 700 px) inchange.
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n + (x ? '  [' + String(x).slice(0, 160) + ']' : '')); };
const s = fs.readFileSync(path.join(__dirname, '../../public/poste.html'), 'utf8');
check('telephone inchange : regles tablette uniquement a partir de 700 px', /@media \(min-width: 700px\) \{\s*\.wrap \{ max-width: 1180px;/.test(s) && s.includes('.wrap { max-width: 480px; margin: 0 auto; padding: 20px 18px 40px; }'));
check('regles tablette apres les regles de base (sinon elles ne s\'appliquent pas)', s.indexOf('Tablette (700 px et plus)') > s.indexOf('.cal-day {'));
check('paysage : calendrier + planning a droite', s.includes('id="cal-side"') && /@media \(min-width: 1000px\) \{\s*\.agenda-split \{ display: grid;/.test(s) && /function posteSplit\(\) \{ return !!\(window\.matchMedia && window\.matchMedia\('\(min-width: 1000px\)'\)\.matches\); \}/.test(s));
// Depuis la refonte (style vue Jour, test 155) : Mois / Semaine / Jour prennent toute la largeur ; toucher un jour ouvre sa vue Jour.
check('mois / semaine / jour : toute la largeur, plus de colonne de droite', /function renderCalSide\(\) \{[\s\S]{0,400}side\.style\.display = 'none'; side\.innerHTML = '';\n\}/.test(s));
check('toucher un jour du mois ouvre sa vue Jour', s.includes(`onclick="pdShowDay(\\'' + ds + '\\')"`));
check('rotation de la tablette : la mise en page suit', /window\.addEventListener\('resize'[\s\S]{0,300}posteSplit\(\)/.test(s));
console.log(`\n${pass} OK, ${fail} ECHEC`);
process.exit(fail ? 1 : 0);
