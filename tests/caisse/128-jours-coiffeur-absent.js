// Calendrier de reservation (rdv.html, compte client) : un jour ou le coiffeur choisi est absent (conge, jour
// « sans RDV », jour non travaille) est grise et non cliquable, au lieu d'afficher « aucun creneau ». Le premier jour
// ou il est present est choisi tout seul. « Premier disponible » : grise seulement si AUCUN coiffeur n'est la.
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n + (x ? '  [' + String(x).slice(0, 160) + ']' : '')); };
const rd = (f) => fs.readFileSync(path.join(__dirname, '../../public', f), 'utf8');
const app = rd('app.js');
const ctx = {}; vm.createContext(ctx);
['isWalkinOn', 'isOnLeaveOn', 'barberBookableOn', 'bookingDayBlocked'].forEach((f) => vm.runInContext(app.match(new RegExp('function ' + f + '\\([\\s\\S]*?\\n\\}\\n'))[0], ctx));
// 2026-11-02 = lundi (1), 2026-11-08 = dimanche (0)
const alice = { id: 'a', schedules: [1, 2, 3, 4, 5].map((w) => ({ weekday: w, active: 1 })).concat([{ weekday: 6, active: 0 }]),
  leaves: [{ start_date: '2026-11-03', end_date: '2026-11-04' }], walkin_days: [{ start_date: '2026-11-05', end_date: '2026-11-05' }] };
const bob = { id: 'b', schedules: [0, 1, 2, 3, 4, 5, 6].map((w) => ({ weekday: w, active: 1 })), leaves: [], walkin_days: [] };
const L = [alice, bob];
check('jour travaille : cliquable', ctx.barberBookableOn(alice, '2026-11-02') && !ctx.bookingDayBlocked('a', L, '2026-11-02'));
check('conge : grise', ctx.bookingDayBlocked('a', L, '2026-11-03') && ctx.bookingDayBlocked('a', L, '2026-11-04'));
check('jour « sans RDV » : grise', ctx.bookingDayBlocked('a', L, '2026-11-05'));
check('jour non travaille (samedi inactif, dimanche absent) : grise', ctx.bookingDayBlocked('a', L, '2026-11-07') && ctx.bookingDayBlocked('a', L, '2026-11-08'));
check('Premier disponible : pas grise si un autre coiffeur est la', !ctx.bookingDayBlocked('', L, '2026-11-03'));
check('Premier disponible : grise si aucun coiffeur', ctx.bookingDayBlocked('', [alice], '2026-11-08'));
check('pas encore de coiffeur choisi / horaires inconnus : pas grise', !ctx.bookingDayBlocked(null, L, '2026-11-08') && ctx.barberBookableOn({ id: 'z' }, '2026-11-08'));
['rdv.html', 'compte.html'].forEach((f) => {
  const s = rd(f);
  check(f + ' : calendrier grise les jours ou le coiffeur est absent', /bookingDayBlocked\((selBarber|selBookBarber), (barbers|bookBarbers), value\)/.test(s) && /'Coiffeur absent ce jour'/.test(s));
  check(f + ' : premier jour disponible choisi a l\'etape date', /PickOpenDay\(\);\n  show\('p-/.test(s));
});
console.log(`\n${pass} OK, ${fail} ECHEC`);
process.exit(fail ? 1 : 0);
