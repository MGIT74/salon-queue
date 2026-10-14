// Onglets partout : pastille qui glisse (module commun app.js) + panneaux en fondu (app.css).
const fs = require('fs'), path = require('path');
const rd = (f) => fs.readFileSync(path.join(__dirname, '../../public', f), 'utf8');
const js = rd('app.js'), css = rd('app.css'), dash = rd('dashboard.html');
let pass = 0, fail = 0;
const check = (n, ok) => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n); };
const sel = (js.match(/var SEL = '([^']+)'/) || [])[1] || '';
check('module commun : toutes les barres d\'onglets connues (sous-onglets, periode, categories, vue agenda, bascules, menu lateral, barres du bas)',
  ['.subtabs', '.period-picker', '.cat-tabs', '.cal-view-switch', '.half-toggle', '.dash-leader-tabs', '.tabs', '.caisse-footer', '.poste-footer', '.client-footer'].every((c) => sel.includes(c)));
check('observe les classes on/sel des boutons (marche meme quand la barre est recreee)', /MutationObserver/.test(js) && /attributeFilter: \['class', 'data-theme'\]/.test(js) && /button\.on, button\.sel/.test(js));
check('la pastille copie le style du bouton actif (fond, ombre, couleur) ; trait colore pour les barres du bas', /cs\.backgroundColor/.test(js) && /plain/.test(js) && /bg = color/.test(js));
check('ne change pas la position d\'une barre deja fixe/sticky', /position === 'static'\) c\.style\.position = 'relative'/.test(js));
check('masquee en mode grille (telephone) et si la barre est cachee', /display === 'grid'/.test(js) && /!c\.offsetWidth/.test(js));
check('suit les redimensionnements (menu replie, rotation) sans animation', /ResizeObserver/.test(js) && /place\(c, false\)/.test(js));
check('css : transition de la pastille + le bouton actif perd son fond', /\.tfx > \.st-ind \{[^}]*transition: left \.32s/.test(css) && /\.tfx\.tfx-on > button\.on/.test(css));
check('css : panneaux .tab-panel / .panel en fondu ; reduced-motion respecte', /\.tab-panel\.on \{ animation: tab-fade-in/.test(css) && /\.panel\.on \{ animation: panel-fade-in/.test(css) && /prefers-reduced-motion: reduce/.test(css));
check('plus de code d\'onglet specifique dans le dashboard (tout est dans le module commun)', !/placeTabIndicator|\.st-ind/.test(dash));
check('selecteur de periode des statistiques : change sur place (la pastille glisse), pas de repeint de la fiche',
  /id="stats-picker-/.test(dash) && /id="stats-body-/.test(dash) && /body\.innerHTML = renderStatsBody\(b\);\s*loadBarberStats\(id\);/.test(dash));
const pages = fs.readdirSync(path.join(__dirname, '../../public')).filter((f) => f.endsWith('.html'));
check('versions app.js / app.css relevees partout ou ils sont charges (cache navigateur)', pages.every((f) => { const h = rd(f); return (!/\/app\.js\?v=/.test(h) || /\/app\.js\?v=17/.test(h)) && (!/\/app\.css\?v=/.test(h) || /\/app\.css\?v=\d+/.test(h)); }));
console.log('\n' + pass + ' OK, ' + fail + ' ECHEC'); process.exit(fail ? 1 : 0);
