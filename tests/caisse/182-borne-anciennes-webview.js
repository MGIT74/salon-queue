// Borne (kiosk) affichée dans une appli WebView (grand écran tactile) : les anciennes WebView Android ne
// comprennent pas « inset: 0 » -> l'écran de veille « Touchez l'écran pour commencer » ne couvrait qu'un coin
// en haut à gauche et restait par-dessus la borne. On écrit top / right / bottom / left (compris partout).
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const check = (n, ok) => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n); };
const k = fs.readFileSync(path.join(__dirname, '../../public/kiosk.html'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '../../public/app.css'), 'utf8');
const js = fs.readFileSync(path.join(__dirname, '../../public/app.js'), 'utf8');
check('kiosk.html : plus de « inset » (écran de veille, alerte « toujours là ? »)', !/\binset\s*:/.test(k));
check('écran de veille plein écran : top / right / bottom / left à 0', /\.idle-screen \{\s*position: fixed; top: 0; right: 0; bottom: 0; left: 0;/.test(k));
check('app.css et app.js (partagés par la borne) : plus de « inset »', !/(^|[;{\s])inset\s*:/.test(css) && !/;inset:0/.test(js));
console.log('\n' + pass + ' OK, ' + fail + ' ECHEC');
process.exit(fail ? 1 : 0);
