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
  check(f + ' : premier jour disponible choisi a l\'etape date', /PickOpenDay\(!\((grp|bkGrp) && (grp|bkGrp)\.date\)\);\n  show\('p-/.test(s));
});
['rdv.html', 'compte.html'].forEach((f) => {
  check(f + ' : jours sans aucun creneau demandes au serveur (/availability-days)', rd(f).includes("'/api/appointments/availability-days?'") && rd(f).includes("'Aucun créneau ce jour'"));
});

// Serveur : jours qui ont au moins un creneau (meme calcul que les creneaux affiches).
const { execSync } = require('child_process');
const sql = (q) => execSync('mariadb -uroot salonq -N -e ' + JSON.stringify(q)).toString().trim();
const BASE = 'http://127.0.0.1:3999';
(async () => {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date());
  const add = (n) => { const d = new Date(today + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const wd = (s) => new Date(s + 'T12:00:00Z').getUTCDay();
  const leave = add(2), offDay = add(4), walk = add(5);
  try {
    sql(`UPDATE barber_schedules SET active = 0 WHERE barber_id = 'b1' AND weekday = ${wd(offDay)}`);
    sql(`INSERT INTO barber_leaves (id, barber_id, start_date, end_date, note) VALUES ('t128-l', 'b1', '${leave}', '${leave}', 't')`);
    sql(`INSERT INTO barber_walkin_days (id, barber_id, start_date, end_date, note) VALUES ('t128-w', 'b1', '${walk}', '${walk}', 't')`);
    const get = async (q) => (await fetch(BASE + '/api/appointments/availability-days?' + q, { headers: { 'X-Salon-Slug': 'test' } })).json();
    const a = await get(`from=${add(1)}&to=${add(6)}&service_id=sv1&barber_id=b1`);
    check('API : conge, jour non travaille, jour « sans RDV » absents', a.ok && !a.days.includes(leave) && !a.days.includes(offDay) && !a.days.includes(walk), JSON.stringify(a));
    check('API : jours travailles presents', a.days.includes(add(1)) && a.days.includes(add(3)), JSON.stringify(a));
    const any = await get(`from=${add(1)}&to=${add(6)}&service_id=sv1`);
    check('API Premier disponible : le jour d\'absence d\'Alice reste possible (Bob est la)', any.days.includes(leave), JSON.stringify(any));
    const bad = await fetch(BASE + `/api/appointments/availability-days?from=${add(1)}&to=${add(90)}&service_id=sv1`, { headers: { 'X-Salon-Slug': 'test' } });
    check('API : periode limitee', bad.status === 400);
  } catch (e) { check('API joignable', false, e.message); }
  finally {
    sql(`UPDATE barber_schedules SET active = 1 WHERE barber_id = 'b1'`);
    sql(`DELETE FROM barber_leaves WHERE id = 't128-l'`); sql(`DELETE FROM barber_walkin_days WHERE id = 't128-w'`);
  }
  console.log(`\n${pass} OK, ${fail} ECHEC`);
  process.exit(fail ? 1 : 0);
})();
