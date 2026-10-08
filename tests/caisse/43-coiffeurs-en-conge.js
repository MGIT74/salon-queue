// Un coiffeur en conge n'est plus propose : page de RDV, Mon compte, borne, planning du tableau de bord et assistant "Ajouter un RDV".
// Execute les VRAIES fonctions des pages (isOnLeaveOn, isBookableForAdmin, hasBookableSchedule) et verifie le branchement dans chaque page.
const fs = require('fs'), path = require('path'), vm = require('vm');
const rd = (f) => fs.readFileSync(path.join(__dirname, '../../' + f), 'utf8');
const app = rd('public/app.js'), dash = rd('public/dashboard.html'), rdv = rd('public/rdv.html'), compte = rd('public/compte.html'), kiosk = rd('public/kiosk.html'), api = rd('src/routes/barbers.js');
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n + (x ? '  [' + x + ']' : '')); };
const fnSrc = (src, name) => { const i = src.indexOf('function ' + name + '('); if (i === -1) throw new Error('introuvable: ' + name); const j = src.indexOf('\nfunction ', i + 10); const k = src.indexOf('\n/**', i + 10); const ends = [j, k].filter((x) => x > -1); return src.slice(i, ends.length ? Math.min.apply(null, ends) : undefined); };

const ctx = vm.createContext({});
vm.runInContext(fnSrc(app, 'hasBookableSchedule') + '\n' + fnSrc(app, 'isOnLeaveOn') + '\n' + fnSrc(dash, 'isBookableForAdmin'), ctx);
const base = { accepts_appointments: 1, active: 1, schedules: [{ active: 1 }] };
const enConge = Object.assign({}, base, { on_leave_today: true, leaves: [{ start_date: '2026-10-05', end_date: '2026-10-12' }] });
const futur = Object.assign({}, base, { on_leave_today: false, leaves: [{ start_date: '2026-10-20', end_date: '2026-10-25' }] });

console.log('\n[A] Logique (vraies fonctions)');
check('en conge aujourd\'hui (calcule par le serveur) : isOnLeaveOn(b) = vrai', ctx.isOnLeaveOn(enConge) === true);
check('pas en conge aujourd\'hui : faux, meme avec un conge a venir', ctx.isOnLeaveOn(futur) === false);
check('par date : premier et dernier jour du conge inclus', ctx.isOnLeaveOn(enConge, '2026-10-05') && ctx.isOnLeaveOn(enConge, '2026-10-12'));
check('par date : la veille et le lendemain, il travaille', !ctx.isOnLeaveOn(enConge, '2026-10-04') && !ctx.isOnLeaveOn(enConge, '2026-10-13'));
check('conge a venir : propose avant, masque pendant', !ctx.isOnLeaveOn(futur, '2026-10-19') && ctx.isOnLeaveOn(futur, '2026-10-22'));
check('ancien format sans champ de conge : jamais masque', ctx.isOnLeaveOn(base) === false && ctx.isOnLeaveOn(base, '2026-10-08') === false);
check('planning admin : coiffeur en conge CE JOUR-LA non propose', ctx.isBookableForAdmin(enConge, '2026-10-08') === false);
check('planning admin : le meme coiffeur est propose un jour ou il travaille', ctx.isBookableForAdmin(enConge, '2026-10-14') === true);
check('sans date (deplacement de RDV, filter(isBookableForAdmin)) : pas masque a tort par le conge d\'aujourd\'hui', ctx.isBookableForAdmin(enConge, 0) === true);
check('un coiffeur sans RDV en ligne reste exclu', ctx.isBookableForAdmin(Object.assign({}, base, { accepts_appointments: 0 }), '2026-10-14') === false);

console.log('\n[B] Branchement dans chaque page');
check('rdv.html : la liste des coiffeurs exclut ceux en conge', /hasBookableSchedule\(b\) && !isOnLeaveOn\(b\)/.test(rdv));
check('compte.html (reserver) : idem', /hasBookableSchedule\(b\) && !isOnLeaveOn\(b\)/.test(compte));
check('kiosk.html : idem', /!b\.outside_hours_now && !isOnLeaveOn\(b\)/.test(kiosk));
check('dashboard : lignes du planning ET assistant "Ajouter un RDV" filtrent sur la date du jour affiche', (dash.match(/return isBookableForAdmin\(b, dateStr\)/g) || []).length === 2);
check('API /api/barbers : renvoie on_leave_today et les conges (dates seulement, sans la note)', /on_leave_today:/.test(api) && /leaves: myLeaves/.test(api) && /SELECT bl\.barber_id, bl\.start_date, bl\.end_date FROM barber_leaves/.test(api) && !/bl\.note/.test(api.slice(api.indexOf('leaveRows'), api.indexOf('leaveRows') + 400)));

console.log('\n' + pass + ' OK, ' + fail + ' ECHEC');
process.exit(fail ? 1 : 0);
