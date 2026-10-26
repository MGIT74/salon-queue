// Compte client sur ordinateur / tablette (900 px et plus) : menu sur le cote (icones sur tablette), accueil en colonnes,
// etapes de reservation (barre d'etapes, recapitulatif + Suivant a droite, en bas sur tablette). Telephone inchange.
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n + (x ? '  [' + String(x).slice(0, 160) + ']' : '')); };
const c = fs.readFileSync(path.join(__dirname, '../../public/compte.html'), 'utf8');
check('menu du bas -> barre laterale a partir de 900 px, libelles complets a partir de 1200 px', /@media \(min-width: 900px\) \{\s*(\/\*[\s\S]*?\*\/\s*)?body\.has-footer \{ --side-w: 92px;/.test(c) && /@media \(min-width: 1200px\) \{\s*body\.has-footer \{ --side-w: 240px; \}/.test(c));
check('accueil en colonnes, sans changer l\'ordre sur telephone', c.includes('class="home-col home-side"') && c.includes('class="home-col home-main"') && c.includes('.home-col { display: contents; }') && c.indexOf('home-side') < c.indexOf('home-main'));
check('bouton « Prendre rendez-vous » sur l\'accueil (ordinateur)', c.includes('class="go home-cta" onclick="goBook()"') && c.includes('.home-cta, .bk-steps { display: none; }'));
check('barre d\'etapes Coiffeur -> Confirmation', c.includes('id="bk-steps"') && /function renderBkSteps\(id\)/.test(c) && c.includes("renderBkSteps(id);"));
check('etapes restructurees (contenu / recapitulatif + Suivant)', /vitrinePageFlow\(document\.createElement\('div'\), ids\)/.test(c) && c.includes("['p-book-service', 'p-book-extras', 'p-book-products', 'p-book-datetime', 'p-book-confirm']"));
check('telephone : pas de recapitulatif en double ni de barre collee en plus', c.includes('.bk-flow > .step-bar.own-bar .recap-foot { display: none; }') && c.includes('.bk-flow > .step-bar.own-bar { position: static;'));
check('menu sur le cote : sa hauteur ne repousse pas le contenu', c.includes('if (f.offsetWidth < window.innerWidth * 0.5) return;'));
check('plus de texte sous le calendrier', !c.includes('Les dates grisées sont indisponibles'));
console.log(`\n${pass} OK, ${fail} ECHEC`);
process.exit(fail ? 1 : 0);
