// Planning du jour (admin, caisse, Mon poste) : zoom par un curseur a glisser (plus de boutons − / +), redimensionne
// sans redessiner pendant le glissement ; les traits entre les heures restent affiches sous 100 %.
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n + (x ? '  [' + String(x).slice(0, 160) + ']' : '')); };
const rd = (f) => fs.readFileSync(path.join(__dirname, '../../public', f), 'utf8');
const app = rd('app.js');
const ctx = {}; vm.createContext(ctx);
vm.runInContext(app.match(/function timelineZoomCtrlHtml\([\s\S]*?\n\}\n/)[0], ctx);
const h = ctx.timelineZoomCtrlHtml(0.4);
check('curseur 0 a 250 %, valeur affichee', /type="range" class="timeline-zoom-range" min="0" max="250" step="5" value="40"/.test(h) && h.includes('>40%<') && h.includes('aria-label="Zoom du planning"'));
check('plus de boutons − / +', !/<button/.test(h));
check('glissement : largeur mise a jour sans redessiner', /function liveTimelineZoom\(el\)[\s\S]*inner\.style\.minWidth = width \+ 'px';/.test(app) && !/function liveTimelineZoom\(el\)[\s\S]{0,1500}innerHTML/.test(app));
['dashboard.html', 'caisse.html', 'poste.html'].forEach((f) => {
  const s = rd(f);
  check(f + ' : curseur + donnees de largeur sur le planning', s.includes('var zoomCtrl = timelineZoomCtrlHtml(effZoom);') && s.includes(`'data-hours="' + hourCount + '" data-fit="' + fitPerHour + '" data-minzoom="' + minZoom + '" `));
  check(f + ' : traits entre les heures toujours visibles sous 100 %', !/\.timeline-inner\.compact \.timeline-minute-grid/.test(s));
});
console.log(`\n${pass} OK, ${fail} ECHEC`);
process.exit(fail ? 1 : 0);
