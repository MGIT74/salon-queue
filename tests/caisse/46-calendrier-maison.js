// Calendrier maison (ordinateur) : remplace la fenetre native des champs date ; valeur AAAA-MM-JJ + evenements input/change conserves.
const fs = require('fs'), path = require('path');
const rd = (f) => fs.readFileSync(path.join(__dirname, '../../' + f), 'utf8');
const app = rd('public/app.js'), css = rd('public/app.css');
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n + (x ? '  [' + x + ']' : '')); };
const blk = app.slice(app.indexOf('Calendrier maison (ordinateur)'));
check('active seulement sur grand ecran avec souris (mobile : selecteur natif conserve)', /\(min-width: 900px\) and \(pointer: fine\)/.test(blk) && /function on\(\)/.test(blk));
check('la valeur reste AAAA-MM-JJ et les evenements input + change sont emis (onchange existants OK)', /new Event\('input', \{ bubbles: true \}\)/.test(blk) && /new Event\('change', \{ bubbles: true \}\)/.test(blk) && /function iso\(/.test(blk));
check('ecoute globale : fonctionne aussi pour les champs ajoutes apres coup (modales du tableau de bord)', /document\.addEventListener\('mousedown'[\s\S]*input\[type="date"\]/.test(blk));
check('respecte min / max, Aujourd\'hui, Effacer, Echap, choix du mois', /getAttribute\('min'\)/.test(blk) && /getAttribute\('max'\)/.test(blk) && /a === 'today'/.test(blk) && /a === 'clear'/.test(blk) && /Escape/.test(blk) && /dp-months/.test(blk));
check('semaine commençant le lundi, mois en francais', /'lu', 'ma', 'me', 'je', 've', 'sa', 'di'/.test(blk) && /'août'/.test(blk));
check('CSS : fenetre aux couleurs du theme (clair / sombre via variables), icone calendrier, indicateur natif masque sur ordinateur', /\.dp-pop \{[^}]*var\(--card\)/.test(css) && /::-webkit-calendar-picker-indicator \{ display: none/.test(css));
console.log('\n' + pass + ' OK, ' + fail + ' ECHEC');
process.exit(fail ? 1 : 0);
