// Historique de caisse (caisse.html) : seulement la journee en cours, remise a zero chaque lendemain a la reouverture.
const fs = require('fs'), path = require('path');
const rd = (p) => fs.readFileSync(path.join(__dirname, '../..', p), 'utf8');
const db = rd('src/db.js'), sales = rd('src/routes/sales.js'), caisse = rd('public/caisse.html');
let pass = 0, fail = 0;
const check = (n, ok) => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n); };

// Extraction des vraies fonctions (db.js ouvre une connexion MariaDB a l'import)
const grab = (name) => { const i = db.indexOf('function ' + name); let d = 0, j = db.indexOf('{', i); for (let k = j; k < db.length; k++) { if (db[k] === '{') d++; else if (db[k] === '}' && --d === 0) return db.slice(i, k + 1); } };
const { caisseDayStartUtc } = new Function(grab('parisLocalToUtcDate') + '\n' + grab('caisseSchedule') + '\n' + grab('caisseDayStartUtc') + '\nreturn { caisseDayStartUtc };')();
const at = (iso) => new Date(iso);
// Ete (UTC+2), reouverture 00:00 : le 12/10 a 15:00 Paris -> debut = 12/10 00:00 Paris = 11/10 22:00 UTC
check('00:00 : journee = depuis minuit (heure du salon)', caisseDayStartUtc({ timezone: 'Europe/Paris' }, at('2026-10-12T13:00:00Z')) === '2026-10-11 22:00:00');
check('juste apres minuit : nouvelle journee (historique vide)', caisseDayStartUtc({ timezone: 'Europe/Paris' }, at('2026-10-11T22:05:00Z')) === '2026-10-11 22:00:00');
check('avant minuit : encore la journee precedente', caisseDayStartUtc({ timezone: 'Europe/Paris' }, at('2026-10-11T21:55:00Z')) === '2026-10-10 22:00:00');
// Reouverture 08:00 : a 07:00 Paris on est encore dans la journee de la veille ; a 09:00 nouvelle journee
check('08:00 : a 07:00 on garde encore la veille', caisseDayStartUtc({ timezone: 'Europe/Paris', caisse_reopen_hour: '08:00' }, at('2026-10-12T05:00:00Z')) === '2026-10-11 06:00:00');
check('08:00 : a 09:00 nouvelle journee', caisseDayStartUtc({ timezone: 'Europe/Paris', caisse_reopen_hour: '08:00' }, at('2026-10-12T07:00:00Z')) === '2026-10-12 06:00:00');
check('heure invalide -> 00:00', caisseDayStartUtc({ timezone: 'Europe/Paris', caisse_reopen_hour: 'abc' }, at('2026-10-12T13:00:00Z')) === '2026-10-11 22:00:00');
check('horaires de caisse : la journee commence a l\'heure d\'OUVERTURE (09:00)', caisseDayStartUtc({ timezone: 'Europe/Paris', caisse_open_enabled: '1', caisse_open_hour: '09:00' }, at('2026-10-12T07:30:00Z')) === '2026-10-12 07:00:00');
check('ouverture desactivee : depuis minuit', caisseDayStartUtc({ timezone: 'Europe/Paris', caisse_open_enabled: '0', caisse_open_hour: '09:00' }, at('2026-10-12T13:00:00Z')) === '2026-10-11 22:00:00');
check('route /api/sales : filtre jour impose au coiffeur (PIN) ou si today=1', /req\.actingBarberId \|\| req\.query\.today === '1'/.test(sales) && /caisseDayStartUtc\(await getSettings/.test(sales));
check('caisse.html demande l\'historique du jour', /\/api\/sales\?today=1/.test(caisse));
console.log('\n' + pass + ' OK, ' + fail + ' ECHEC'); process.exit(fail ? 1 : 0);
