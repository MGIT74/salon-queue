// Coiffeur avec TOUS les jours désactivés dans ses horaires = indisponible : il n'est pas proposé dans la prise de RDV
// manuelle (admin, Mon poste, caisse), ses jours sont grisés (« ne travaille pas ce jour-là ») et le serveur refuse.
// Avant : des horaires réglés mais tous désactivés étaient pris pour « horaires inconnus » (jours non grisés).
// Horaires jamais réglés (aucune ligne) : inchangé, toujours proposé.
process.env.DB_HOST = process.env.DB_HOST || '127.0.0.1';
process.env.DB_USER = process.env.DB_USER || 'sq';
process.env.DB_PASSWORD = process.env.DB_PASSWORD || 'sqpass';
process.env.DB_NAME = process.env.DB_NAME || 'salonq';
process.env.SETTINGS_ENCRYPTION_KEY = process.env.SETTINGS_ENCRYPTION_KEY || 'testkeytestkeytestkeytestkey123456';
const path = require('path'), fs = require('fs');
const { pool } = require(path.join(__dirname, '../../src/db'));
const BASE = 'http://127.0.0.1:3999';
const ADMIN = { 'Content-Type': 'application/json', 'X-Salon-Slug': 'test', 'X-Admin-Password': 'adminpw' };
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n + (x ? '  [' + String(x).slice(0, 200) + ']' : '')); };

const app = fs.readFileSync(path.join(__dirname, '../../public/app.js'), 'utf8');
const fn = (n) => app.match(new RegExp('function ' + n + '\\([\\s\\S]*?\\n}\\n'))[0];
const lib = new Function(['isWalkinOn', 'isOnLeaveOn', 'hasBookableSchedule', 'barberBookableOn', 'barberOffReason'].map(fn).join('\n') +
  '; return { hasBookableSchedule, barberBookableOn, barberOffReason };')();

const days = (activeDays) => [0, 1, 2, 3, 4, 5, 6].map((w) => ({ weekday: w, start_time: '09:00:00', end_time: '19:00:00', active: activeDays.includes(w) ? 1 : 0 }));
const MON = '2026-11-02', TUE = '2026-11-03';
const off = { name: 'Mounir', schedules: days([]), leaves: [], walkin_days: [] };
const never = { name: 'Nouveau', schedules: [], leaves: [], walkin_days: [] };
const monOnly = { name: 'Lundi', schedules: days([1]), leaves: [], walkin_days: [] };

check('tous les jours désactivés : pas de créneau réservable (liste « Ajouter un RDV »)', lib.hasBookableSchedule(off) === false);
check('tous les jours désactivés : aucun jour réservable', !lib.barberBookableOn(off, MON) && !lib.barberBookableOn(off, TUE));
check('tous les jours désactivés : « ne travaille pas ce jour-là » (colonne grisée, ouverture bloquée)', lib.barberOffReason(off, MON) === 'ne travaille pas ce jour-là', lib.barberOffReason(off, MON));
check('horaires jamais réglés : toujours proposé (inchangé)', lib.hasBookableSchedule(never) && lib.barberBookableOn(never, MON) && lib.barberOffReason(never, MON) === '');
check('un seul jour actif : seulement ce jour-là', lib.barberBookableOn(monOnly, MON) && !lib.barberBookableOn(monOnly, TUE));

(async () => {
  const [old] = await pool.query("SELECT weekday, start_time, end_time, active FROM barber_schedules WHERE barber_id = 'b2'");
  const [[acc]] = await pool.query("SELECT accepts_appointments FROM barbers WHERE id = 'b2'");
  try {
    await pool.query("UPDATE barbers SET accepts_appointments = 1 WHERE id = 'b2'");
    await pool.query("DELETE FROM barber_schedules WHERE barber_id = 'b2'");
    for (let w = 0; w <= 6; w++) await pool.query("INSERT INTO barber_schedules (id, barber_id, weekday, start_time, end_time, active) VALUES (UUID(), 'b2', ?, '09:00:00', '19:00:00', 0)", [w]);
    const d = new Date(Date.now() + 9 * 864e5).toISOString().slice(0, 10);
    const r = await fetch(BASE + '/api/appointments/admin-create', { method: 'POST', headers: ADMIN,
      body: JSON.stringify({ client_name: 'T162 Client', service_id: 'sv1', extras: [], barber_id: 'b2', date: d, time: '10:00' }) });
    check('serveur : RDV manuel refusé pour un coiffeur sans aucun jour actif', r.status === 409, r.status + ' ' + JSON.stringify(await r.json()));
    const bl = await (await fetch(BASE + '/api/barbers', { headers: ADMIN })).json();
    const b2 = (bl.items || []).find((b) => b.id === 'b2');
    check('API coiffeurs : ses horaires (tous désactivés) sont bien envoyés aux écrans', b2 && b2.schedules.length === 7 && b2.schedules.every((s) => !s.active) && lib.hasBookableSchedule(b2) === false);
  } finally {
    await pool.query("DELETE FROM appointments WHERE client_name = 'T162 Client'");
    await pool.query("DELETE FROM barber_schedules WHERE barber_id = 'b2'");
    for (const s of old) await pool.query('INSERT INTO barber_schedules (id, barber_id, weekday, start_time, end_time, active) VALUES (UUID(), ?, ?, ?, ?, ?)', ['b2', s.weekday, s.start_time, s.end_time, s.active]);
    await pool.query("UPDATE barbers SET accepts_appointments = ? WHERE id = 'b2'", [acc.accepts_appointments]);
  }
  const d = fs.readFileSync(path.join(__dirname, '../../public/dashboard.html'), 'utf8');
  const p = fs.readFileSync(path.join(__dirname, '../../public/poste.html'), 'utf8');
  const c = fs.readFileSync(path.join(__dirname, '../../public/caisse.html'), 'utf8');
  check('admin, poste, caisse : la liste des coiffeurs de la prise de RDV filtre par hasBookableSchedule',
    /isBookableForAdmin\(b, dateStr\) \{[\s\S]{0,600}hasBookableSchedule\(b\)/.test(d) && p.includes('hasBookableSchedule(b) && barberDoesChoice(') && c.includes('hasBookableSchedule(b) && barberDoesChoice('));
  check('app.js rechargé (v=63)', d.includes('app.js?v=63') && p.includes('app.js?v=63') && c.includes('app.js?v=63'));
  await pool.end();
  console.log(`\n${pass} OK, ${fail} ECHEC`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
