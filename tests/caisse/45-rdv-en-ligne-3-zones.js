// Page de RDV en ligne (rdv.html) : sur ordinateur, meme design 3 zones que la fenetre "Ajouter un RDV" (en-tete fixe, liste qui defile,
// pied fixe avec recap detaille + bouton). Le mobile reste inchange (display: contents).
const fs = require('fs'), path = require('path');
const rd = (f) => fs.readFileSync(path.join(__dirname, '../../' + f), 'utf8');
const app = rd('public/app.js'), css = rd('public/app.css'), rdv = rd('public/rdv.html');
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n + (x ? '  [' + x + ']' : '')); };

console.log('\n[A] Decoupage');
check('vitrinePageFlow existe et cree les 3 zones (flow-top / flow-body / step-bar)', /function vitrinePageFlow\(/.test(app) && /className = 'flow-top'/.test(app) && /className = 'flow-body'/.test(app) && /own-bar/.test(app));
check('rdv.html l\'appelle sur les 5 etapes (prestation, supplements, produits, date, coordonnees)', /vitrinePageFlow\([\s\S]*?p-service[\s\S]*?p-extras[\s\S]*?p-products[\s\S]*?p-datetime[\s\S]*?p-contact/.test(rdv));
check('le bouton Suivant / Confirmer est deplace (pas copie) : ids conserves', /bar\.appendChild\(go\)/.test(app) && !/cloneNode/.test(app.slice(app.indexOf('function vitrinePageFlow'))));

console.log('\n[B] Style');
const desk = css.slice(css.indexOf('Page de reservation publique (rdv.html)'));
check('mobile : zones en display: contents (rendu inchange), recap du pied masque', /\.page-flow \.panel\.flow > \.flow-top[^{]*\{ display: contents/.test(desk) && /\.recap-foot \{ display: none/.test(desk));
check('ordinateur : carte large 1240px, recap + bouton en colonne verticale a droite, hauteur fixe, liste qui defile, pied fixe', /@media \(min-width: 900px\)/.test(desk) && /max-width: min\(1240px, 96vw\)/.test(desk) && /height: min\(92vh, 900px\)/.test(desk) && /\.flow-body \{[^}]*overflow-y: auto/.test(desk) && /> \.step-bar \{[^}]*grid-column: 2[^}]*position: static/.test(desk));
check('ordinateur : le recap du haut est masque (il est dans le pied)', /\.recap-top \{ display: none/.test(desk));
check('la largeur ne change pas selon l\'etape (aucun .wrap:has de largeur)', !/\.wrap:has\(/.test(css) && !/width[^;{]*:has\(/.test(desk));
check('mode clair : contour visible sur les cartes (bordure fine + ombre)', /:not\(\[data-theme="dark"\]\) \.item-card[\s\S]*?box-shadow: 0 0 0 1px/.test(css));

console.log('\n' + pass + ' OK, ' + fail + ' ECHEC');
process.exit(fail ? 1 : 0);
