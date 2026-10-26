// Poste : clic sur un RDV de l'agenda -> tiroir a droite, repris de la caisse (Deplacer, Annuler, Modifier, note, historique).
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n + (x ? '  [' + String(x).slice(0, 160) + ']' : '')); };
const p = fs.readFileSync(path.join(__dirname, '../../public/poste.html'), 'utf8');
const c = fs.readFileSync(path.join(__dirname, '../../public/caisse.html'), 'utf8');
check('tiroir present (markup + style)', p.includes('<div class="appt-drawer-backdrop" id="appt-drawer-backdrop"') && p.includes('.appt-drawer-backdrop.on .appt-drawer { transform: translateX(0); }'));
check('clic sur un RDV de l\'agenda ouvre le tiroir', /function openPosteClientDrawer\(id\) \{\s*var a = calApptById\[id\];\s*if \(!a\) return;\s*openApptDrawer\(a\);\s*\}/.test(p) && p.includes("openPosteClientDrawer(\\'' + it.id + '\\')"));
check('boutons Deplacer / Annuler le RDV', p.includes('onclick="adReschedule()">Déplacer</button>') && p.includes('onclick="adCancel()">Annuler le RDV</button>'));
const body = (src, f) => (src.match(new RegExp('function ' + f + '\\([^)]*\\) \\{[\\s\\S]*?\\n\\}\\n')) || [''])[0];
for (const f of ['openApptDrawer', 'closeApptDrawer', 'adCancel', 'adSaveNote', 'adSaveInfo', 'adRenderInfo', 'adLoadDetails']) check('meme code que la caisse : ' + f, body(p, f) && body(p, f) === body(c, f));
check('deplacer : meme parcours que la caisse (coiffeurs du poste)', body(p, 'adReschedule') === body(c, 'adReschedule').replace('allBarbers.filter', '(barbers || []).filter'));
check('apres modification : agenda et file relus', /function adRefreshViews\(\) \{[\s\S]*?loadAgendaPeriod\(\);\s*refresh\(\);/.test(p));
check('pas d\'actualisation automatique tiroir ouvert', p.includes("document.querySelector('.modal-overlay, .appt-drawer-backdrop.on')"));
console.log(`\n${pass} OK, ${fail} ECHEC`);
process.exit(fail ? 1 : 0);
