// Conges au jour pres : plages <-> jours, ajout / retrait de plusieurs jours, « Repeter chaque annee ».
const L = require('../../src/lib/leaveDays');
let pass = 0, fail = 0;
const check = (n, ok) => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n); };
const J = (a, n) => { const d = new Date(a + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

let m = L.expand([{ start_date: '2026-07-06', end_date: '2026-07-08', note: 'Été', repeat_yearly: 0 }]);
check('plage -> jours', m.size === 3 && m.get('2026-07-07').note === 'Été');
check('jours -> plage unique (aller-retour)', JSON.stringify(L.compress(m)) === JSON.stringify([{ start_date: '2026-07-06', end_date: '2026-07-08', note: 'Été', repeat_yearly: false }]));

m = L.applyDays(L.expand([]), ['2026-01-12', '2026-01-13', '2026-01-14', '2026-01-20'], true, false, 2026);
let r = L.compress(m);
check('plusieurs jours : plages consecutives fusionnees, jour isole a part', r.length === 2 && r[0].start_date === '2026-01-12' && r[0].end_date === '2026-01-14' && r[1].start_date === '2026-01-20');

m = L.applyDays(L.expand(r), ['2026-01-13'], false, false, 2026);
r = L.compress(m);
check('retirer un jour au milieu coupe la plage en deux', r.length === 3 && r[0].end_date === '2026-01-12' && r[1].start_date === '2026-01-14');

m = L.applyDays(L.expand([]), ['2026-12-25'], true, true, 2026);
r = L.compress(m);
check('repeter chaque annee : meme jour sur les 5 annees suivantes', r.length === 6 && r.every((x) => x.repeat_yearly) && r[5].start_date === '2031-12-25');

m = L.applyDays(L.expand(r), ['2026-12-25'], true, false, 2026);
r = L.compress(m);
check('decocher « repeter » : seul le jour choisi reste', r.length === 1 && r[0].start_date === '2026-12-25' && !r[0].repeat_yearly);

m = L.applyDays(L.expand([]), ['2026-05-01'], true, true, 2026);
m = L.applyDays(m, ['2026-05-01'], false, false, 2026);
check('retirer un jour repete : toutes ses copies disparaissent', m.size === 0);

m = L.applyDays(L.expand([]), ['2028-02-29'], true, true, 2028);
check('29 fevrier : pas de copie les annees non bissextiles', [...m.keys()].every((k) => k === '2028-02-29' || k.startsWith('2032')));

m = L.applyDays(L.expand([{ start_date: '2026-03-03', end_date: '2026-03-03', note: 'Formation', repeat_yearly: 0 }]), ['2026-03-03'], true, false, 2026);
check('la note existante est conservee', L.compress(m)[0].note === 'Formation');
check('dates invalides ignorees', L.applyDays(L.expand([]), ['pas-une-date', '2026-13-45x'], true, false, 2026).size === 0);
console.log('\n' + pass + ' OK, ' + fail + ' ECHEC'); process.exit(fail ? 1 : 0);
