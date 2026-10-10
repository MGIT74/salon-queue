// Ticket Z : le bouton Imprimer envoie un ticket texte 32 colonnes au pont (caisse ET admin), repli navigateur sinon.
const fs = require('fs'), path = require('path'), vm = require('vm');
const rd = (f) => fs.readFileSync(path.join(__dirname, '../../' + f), 'utf8');
const app = rd('public/app.js'), caisse = rd('public/caisse.html'), dash = rd('public/dashboard.html');
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n + (x ? '  [' + x + ']' : '')); };

const src = app.slice(app.indexOf('function buildZText'), app.indexOf('\n}\n', app.indexOf('function buildZText')) + 3);
const ctx = vm.createContext({ CURRENCY: 'EUR' });
vm.runInContext(src + '\nthis.build = buildZText;', ctx);
const r = {
  z_number: 7, period_start: '2026-10-09T08:00:00Z', period_end: '2026-10-09T18:30:00Z', closed_by: 'Mounir', sales_count: 61, total_cents: 108950, starting_cash_cents: 10250,
  breakdown: { cb: 77200, especes: 31750 },
  by_barber: { a: { name: 'Mounir', count: 30, total_cents: 57750 }, b: { name: 'Emin', count: 20, total_cents: 31500 } },
  by_item: { 'Coupe homme': { quantity: 27, total_cents: 40500 }, 'Coupe + barber + shampoing evenement tres long nom': { quantity: 16, total_cents: 35200 }, 'Eau': { quantity: 1, total_cents: 100 } },
  by_vat: { 20: { ht_cents: 90792, vat_cents: 18158 } }
};
const txt = ctx.build(r, { salonName: 'THE BARBER ONE' });
const lines = txt.split('\n');
check('toutes les lignes tiennent sur 32 colonnes', lines.every((l) => l.length <= 32), 'max ' + Math.max(...lines.map((l) => l.length)));
check('contient Z007, total, coiffeurs, articles, TVA, fond de caisse', /CLOTURE Z007/.test(txt) && /TOTAL \(61 ventes\)/.test(txt) && /Mounir \(30\)/.test(txt) && /27 x Coupe homme/.test(txt) && /TOTAL TVA/.test(txt) && /Especes attendues\s+420,00 EUR/.test(txt));
check('montants jamais coupes (libelle long retourne a la ligne)', /352,00 EUR/.test(txt) && /1089,50 EUR/.test(txt));
check('aucun symbole € (absent de CP850)', !/€/.test(txt));
for (const [n, c] of [['caisse', caisse], ['admin', dash]]) {
  check(n + ' : bouton Imprimer appelle printZNow', /id="z-print-btn" onclick="printZNow\(\)"/.test(c));
  check(n + ' : envoi au pont via /api/tpe/print puis repli window.print()', /function printZNow\(\)[\s\S]*?\/api\/tpe\/print[\s\S]*?window\.print\(\)/.test(c) && /buildZText\(currentZClosing/.test(c));
}
check('admin : n\'envoie au pont que s\'il est configure (sinon dialogue navigateur)', /if \(!d\.tpe_bridge_url\) \{ done\(\); window\.print\(\); return; \}/.test(dash));
check('caisse : sans pont, dialogue navigateur', /if \(!tpeBridgeUrl \|\| !currentZClosing\) \{ window\.print\(\); return; \}/.test(caisse));
check('app.js versionne (cache) sur les pages', /app\.js\?v=15/.test(caisse) && /app\.js\?v=15/.test(dash));
console.log('\n' + pass + ' OK, ' + fail + ' ECHEC'); process.exit(fail ? 1 : 0);
