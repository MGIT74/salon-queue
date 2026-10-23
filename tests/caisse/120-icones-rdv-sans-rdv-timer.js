// Timer (caisse, Mon poste) : icone RDV (calendrier) / sans RDV (personne qui marche) devant chaque client, les memes
// que dans l'agenda ; etiquette RDV / sans RDV du jour a cote du nom du coiffeur (pas d'icone en plus sur les pastilles).
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n + (x ? '  [' + String(x).slice(0, 160) + ']' : '')); };
const rd = (f) => fs.readFileSync(path.join(__dirname, '../../public', f), 'utf8');
const app = rd('app.js'), css = rd('app.css'), caisse = rd('caisse.html'), poste = rd('poste.html'), dash = rd('dashboard.html');
const ctx = {}; vm.createContext(ctx);
const grab = (name) => { const i = app.indexOf('function ' + name + '('); let d = 0, j = app.indexOf('{', i); for (; j < app.length; j++) { if (app[j] === '{') d++; else if (app[j] === '}' && --d === 0) break; } return app.slice(i, j + 1); };
vm.runInContext(['takesWalkinsToday', 'rdvModeIconSvg', 'queueSourceIconHtml', 'barberModeTagHtml'].map(grab).join('\n'), ctx);

const walkSvg = '<circle cx="13" cy="4" r="1.5"/>', rdvSvg = '<rect x="4" y="5.5" width="16" height="15" rx="2.5"/>';
check('memes icones que l\'agenda (dashboard sourceBadge)', dash.includes(walkSvg) && dash.includes(rdvSvg));
check('client venu sans RDV : icone « sans RDV »', ctx.queueSourceIconHtml({ is_appointment: 0 }).includes(walkSvg) && /Sans RDV/.test(ctx.queueSourceIconHtml({})));
check('client d\'un RDV : icone calendrier', ctx.queueSourceIconHtml({ is_appointment: 1 }).includes(rdvSvg));
check('etiquette a cote du nom', /Sans RDV/.test(ctx.barberModeTagHtml({ kiosk_hidden: 0 })) && />RDV</.test(ctx.barberModeTagHtml({ kiosk_hidden: 1 }).replace(/<svg[\s\S]*<\/svg>/, '>')));
for (const [n, h] of [['caisse', caisse], ['Mon poste', poste]]) {
  check(n + ' : icone devant le client en cours et les clients a suivre', h.includes("'<div class=\"name\">' + queueSourceIconHtml(cur) + esc(cur.client_name)") && h.includes("'<div class=\"name\">' + queueSourceIconHtml(q) + esc(q.client_name)"));
  check(n + ' : etiquette RDV / sans RDV a cote du nom', /barberModeTagHtml\(/.test(h));
}
check('caisse : pastilles des coiffeurs sans icone en plus (l\'etiquette a cote du nom suffit)', !/barberModeBadgeHtml/.test(caisse + app) && !/\.mode-badge/.test(css));
check('etiquette : sans RDV (mode ou jour du calendrier) / RDV', /walk/.test(ctx.barberModeTagHtml({ kiosk_hidden: 0 })) && /walk/.test(ctx.barberModeTagHtml({ kiosk_hidden: 1, walkin_today: true })) && /rdv/.test(ctx.barberModeTagHtml({ kiosk_hidden: 1 })));
console.log(`\n${pass} OK, ${fail} ECHEC`);
process.exit(fail ? 1 : 0);
