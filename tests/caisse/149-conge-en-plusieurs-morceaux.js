// « X est en congé jusqu'au ... » : un conge enregistre en plusieurs morceaux (ex. 27-31 oct + 1-15 nov) doit
// afficher la VRAIE date de retour (15 nov), pas la fin du premier morceau. Vraie fonction leaveEndFrom (app.js).
const fs = require('fs'), path = require('path'), vm = require('vm');
const rd = (f) => fs.readFileSync(path.join(__dirname, '../../' + f), 'utf8');
const app = rd('public/app.js'), rdv = rd('public/rdv.html'), compte = rd('public/compte.html'), dash = rd('public/dashboard.html');
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n + (x ? '  [' + x + ']' : '')); };
const fnSrc = (src, name) => { const i = src.indexOf('function ' + name + '('); if (i === -1) throw new Error('introuvable: ' + name); const j = src.indexOf('\nfunction ', i + 10); const k = src.indexOf('\n/**', i + 10); const ends = [j, k].filter((x) => x > -1); return src.slice(i, ends.length ? Math.min.apply(null, ends) : undefined); };
const ctx = vm.createContext({});
vm.runInContext(fnSrc(app, 'leaveEndFrom'), ctx);
const sch = (days) => days.map((w) => ({ active: 1, weekday: w }));
const tous = sch([0, 1, 2, 3, 4, 5, 6]), lunSam = sch([1, 2, 3, 4, 5, 6]);

console.log('\n[A] Logique');
const edvin = { schedules: lunSam, leaves: [{ start_date: '2026-10-27', end_date: '2026-10-31' }, { start_date: '2026-11-01', end_date: '2026-11-15' }] };
check('2 morceaux colles (27-31 oct + 1-15 nov) : retour le 15 nov', ctx.leaveEndFrom(edvin, '2026-10-27') === '2026-11-15', ctx.leaveEndFrom(edvin, '2026-10-27'));
const trou = { schedules: lunSam, leaves: [{ start_date: '2026-10-26', end_date: '2026-10-31' }, { start_date: '2026-11-02', end_date: '2026-11-15' }] };
check('separes par un dimanche non travaille : retour le 15 nov', ctx.leaveEndFrom(trou, '2026-10-27') === '2026-11-15');
const trouTravaille = { schedules: tous, leaves: trou.leaves };
check('separes par un jour TRAVAILLE : le conge en cours s\'arrete au 31 oct', ctx.leaveEndFrom(trouTravaille, '2026-10-27') === '2026-10-31');
const reprise = { schedules: lunSam, leaves: [{ start_date: '2026-10-26', end_date: '2026-10-31' }, { start_date: '2026-11-10', end_date: '2026-11-15' }] };
check('un autre conge plus tard (il revient entre) : 31 oct', ctx.leaveEndFrom(reprise, '2026-10-27') === '2026-10-31');
const chevauche = { schedules: tous, leaves: [{ start_date: '2026-10-20', end_date: '2026-11-05' }, { start_date: '2026-10-25', end_date: '2026-10-28' }] };
check('morceaux qui se chevauchent : la fin la plus lointaine', ctx.leaveEndFrom(chevauche, '2026-10-27') === '2026-11-05');
check('3 morceaux enchaines', ctx.leaveEndFrom({ schedules: tous, leaves: [{ start_date: '2026-10-27', end_date: '2026-10-28' }, { start_date: '2026-10-29', end_date: '2026-11-03' }, { start_date: '2026-11-04', end_date: '2026-11-20' }] }, '2026-10-27') === '2026-11-20');
check('pas en conge ce jour-la : vide', ctx.leaveEndFrom(edvin, '2026-10-26') === '' && ctx.leaveEndFrom({}, '2026-10-26') === '');
check('horaires inconnus : pas de saut de jour (morceaux colles seulement)', ctx.leaveEndFrom({ leaves: trou.leaves }, '2026-10-27') === '2026-10-31');

console.log('\n[B] Branchement');
check('rdv.html : message « en congé jusqu\'au » calcule avec leaveEndFrom', /var lvEnd = leaveEndFrom\(b, today\);/.test(rdv));
check('compte.html : idem', /var lvEnd = leaveEndFrom\(sel, today\);/.test(compte));
check('dashboard : etiquette « En congé · jusqu\'au » aussi', /var curEnd = leaveEndFrom\(b, today\);/.test(dash));
check('plus aucun calcul sur le seul premier morceau', !/l\.start_date <= today && l\.end_date >= today; \}\)\[0\]/.test(rdv + compte) && !/l\.start_date <= today && today <= l\.end_date; \}\)\[0\]/.test(dash));

console.log('\n' + pass + ' OK, ' + fail + ' ECHEC');
process.exit(fail ? 1 : 0);
