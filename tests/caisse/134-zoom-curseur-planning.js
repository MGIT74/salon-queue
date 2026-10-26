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
// Libelles des minutes : le plus fin qui a la place (5, 10, 15, 20, 30 min, puis heures pleines)
const vm2 = vm.createContext({});
vm.runInContext(app.match(/function timelineFitLabels\(root\) \{[\s\S]*?\n\}\n/)[0], vm2);
function labelsAt(widthPx, step) {
  const spans = []; for (let t = 540; t <= 1140; t += step) spans.push({ dataset: { m: String(t) }, off: false, classList: { toggle(c, v) { this.o.off = v; }, o: null } });
  spans.forEach((s) => { s.classList.o = s; });
  const inner = { dataset: { rangeStart: '540', rangeEnd: '1140', step: String(step) }, classList: { contains: () => false }, getBoundingClientRect: () => ({ width: widthPx + 22 }), querySelectorAll: () => spans };
  vm2.timelineFitLabels({ querySelectorAll: () => [inner] });
  return spans.filter((s) => !s.off).map((s) => Number(s.dataset.m) % 60);
}
const at = (w) => { const v = labelsAt(w, 5); return v.filter((m) => m !== 0).slice(0, 2).join(','); };
check('100 % (44 px / 5 min) : toutes les 5 min', at(5280) === '5,10', at(5280));
check('70 % : toutes les 10 min', at(3700) === '10,20', at(3700));
check('plus serre : toutes les 15 min, puis 30 min, puis heures pleines', at(1900) === '15,30' && at(1000) === '30,30' && at(400) === '', [at(1900), at(1000), at(400)]);
console.log(`\n${pass} OK, ${fail} ECHEC`);
process.exit(fail ? 1 : 0);
