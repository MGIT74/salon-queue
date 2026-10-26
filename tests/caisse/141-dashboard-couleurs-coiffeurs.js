// Dashboard « Planning du jour » : les couleurs choisies dans « Coiffeurs » sont chargees AVANT de dessiner la frise
// (sinon, apres un rafraichissement de la page, elle retombait sur les couleurs automatiques).
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const check = (n, ok) => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n); };
const d = fs.readFileSync(path.join(__dirname, '../../public/dashboard.html'), 'utf8');
const i = d.indexOf("document.getElementById('dash-timeline').innerHTML = renderDayTimelineHtml(todayStr, todayAppts);");
const before = d.slice(Math.max(0, i - 1200), i);
check('planning du dashboard : couleurs des coiffeurs chargees avant le rendu', i > 0 && /api\('\/api\/barbers\?all=1'\)[\s\S]*?rdvBarberColors\[x\.id\] = x\.color \|\| stableColorForId\(x\.id\)[\s\S]*?api\('\/api\/appointments\?month='/.test(before));
console.log(`\n${pass} OK, ${fail} ECHEC`);
process.exit(fail ? 1 : 0);
