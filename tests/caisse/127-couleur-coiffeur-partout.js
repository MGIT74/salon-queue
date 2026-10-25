// Couleur d'un coiffeur : PARTOUT celle choisie dans sa fiche (sinon la couleur automatique). L'agenda de la caisse
// utilisait toujours la couleur automatique : Mounir etait bleu dans l'admin et orange dans la caisse.
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n + (x ? '  [' + String(x).slice(0, 160) + ']' : '')); };
const rd = (f) => fs.readFileSync(path.join(__dirname, '../../public', f), 'utf8');
const app = rd('app.js');
const ctx = {}; vm.createContext(ctx);
vm.runInContext(app.match(/var DOT_COLORS = [^\n]+\n/)[0] + app.match(/function stableColorForId\([\s\S]*?\n\}\n/)[0] + app.match(/function barberColorOf\([\s\S]*?\n\}\n/)[0], ctx);
const list = [{ id: 'm', color: '#1d4ed8' }, { id: 'x' }];
check('couleur choisie dans la fiche', ctx.barberColorOf('m', list) === '#1d4ed8' && ctx.barberColorOf(list[0]) === '#1d4ed8');
check('sans couleur choisie : couleur automatique stable', ctx.barberColorOf('x', list) === ctx.stableColorForId('x') && ctx.barberColorOf('inconnu', list) === ctx.stableColorForId('inconnu'));
// Aucun ecran ne doit utiliser la couleur automatique SANS regarder d'abord la couleur choisie.
const pages = ['caisse.html', 'dashboard.html', 'poste.html', 'rdv.html', 'compte.html', 'kiosk.html', 'display.html'];
const bad = [];
pages.forEach((f) => rd(f).split('\n').forEach((l, i) => {
  if (/stableColorForId\(/.test(l) && !/\.color \|\| stableColorForId|rdvBarberColors\[bid\] \|\| stableColorForId/.test(l)) bad.push(f + ':' + (i + 1));
}));
check('aucun ecran n\'ignore la couleur choisie', bad.length === 0, bad.join(', '));
const c = rd('caisse.html');
check('agenda de la caisse (points du mois + frise du jour) : couleur choisie', (c.match(/barberColorOf\(bid, allBarbers\)/g) || []).length === 2);
console.log(`\n${pass} OK, ${fail} ECHEC`);
process.exit(fail ? 1 : 0);
