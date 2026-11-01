// Heures proposées « à la suite » selon la durée du RDV : dans chaque espace libre, on part de la première heure
// possible et on enchaîne des RDV de cette durée bout à bout (plus seulement toutes les 5 min). Dynamique : un espace
// commence là où finit le RDV d'avant. L'équipe peut « Voir toutes les heures » (?all=1) ; déplacement d'un RDV et
// réservation à plusieurs gardent toutes les heures ; un RDV reste acceptable à toute heure libre.
// Vraie base + vrai serveur (port 3999).
process.env.DB_HOST = process.env.DB_HOST || '127.0.0.1';
process.env.DB_USER = process.env.DB_USER || 'sq';
process.env.DB_PASSWORD = process.env.DB_PASSWORD || 'sqpass';
process.env.DB_NAME = process.env.DB_NAME || 'salonq';
process.env.SETTINGS_ENCRYPTION_KEY = process.env.SETTINGS_ENCRYPTION_KEY || 'testkeytestkeytestkeytestkey123456';
const path = require('path'), fs = require('fs');
const { pool } = require(path.join(__dirname, '../../src/db'));
const BASE = 'http://127.0.0.1:3999';
const PUB = { 'X-Salon-Slug': 'test' };
const ADMIN = { 'Content-Type': 'application/json', 'X-Salon-Slug': 'test', 'X-Admin-Password': 'adminpw' };
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n + (x ? '  [' + String(x).slice(0, 240) + ']' : '')); };
const DAY = new Date(Date.now() + 45 * 864e5).toISOString().slice(0, 10);
const get = async (q, h) => (await fetch(BASE + '/api/appointments/availability?date=' + DAY + q, { headers: h || PUB })).json();

(async () => {
  const keys = ['rdv_slot_step_min', 'rdv_buffer_min', 'rdv_guest_email_code'];
  const [old] = await pool.query('SELECT `key`, value FROM settings WHERE salon_id = ? AND `key` IN (?)', ['s1', keys]);
  const [[acc]] = await pool.query("SELECT accepts_appointments FROM barbers WHERE id = 'b1'");
  try {
    await pool.query("INSERT INTO settings (salon_id, `key`, value) VALUES ('s1','rdv_slot_step_min','5'),('s1','rdv_buffer_min','0') ON DUPLICATE KEY UPDATE value = VALUES(value)");
    await pool.query("UPDATE barbers SET accepts_appointments = 1 WHERE id = 'b1'");
    await pool.query("DELETE FROM barber_schedules WHERE barber_id = 'b1'");
    for (let w = 0; w <= 6; w++) await pool.query("INSERT INTO barber_schedules (id, barber_id, weekday, start_time, end_time, active) VALUES (UUID(), 'b1', ?, '09:00:00', '13:00:00', 1)", [w]);
    await pool.query("DELETE FROM appointments WHERE client_name LIKE 'T163%'");
    await pool.query("DELETE FROM extras WHERE id IN ('t163-x10','t163-sh')");
    await pool.query("INSERT INTO extras (id, salon_id, name, duration_min, price_cents, active) VALUES ('t163-x10','s1','T163 Barbe',5,500,1),('t163-sh','s1','T163 Shampoing',5,300,1)");
    // Coupe 30 min + supplément 5 min = 35 min. RDV déjà pris : 10:30-11:00.
    await pool.query("INSERT INTO appointments (id, salon_id, barber_id, client_name, service_id, scheduled_at, status, cancel_token) VALUES ('t163-a','s1','b1','T163 Pris','sv1',?, 'confirmed','tok163a')", [DAY + ' 10:30:00']);
    let r = await get('&service_id=sv1&barber_id=b1&extras=t163-x10');
    const times = r.slots.map((x) => x.time).join(',');
    check('35 min : heures à la suite 9:00, 9:35, 11:00, 11:35, 12:10', times === '09:00,09:35,11:00,11:35,12:10' && r.packed === true, times);
    check('le nombre de toutes les heures est donné (lien « Voir toutes les heures »)', r.all_count === 30, r.all_count);
    r = await get('&service_id=sv1&barber_id=b1&extras=t163-x10&all=1');
    check('?all=1 (équipe) : toutes les heures, tous les 5 min', r.slots.length === 30 && r.packed === false, r.slots.length);
    // Dynamique : un shampoing de 5 min à 9:00 -> l'espace commence à 9:05.
    await pool.query("INSERT INTO appointments (id, salon_id, barber_id, client_name, service_id, scheduled_at, status, cancel_token) VALUES ('t163-b','s1','b1','T163 Shampoing','sv1',?, 'confirmed','tok163b')", [DAY + ' 09:00:00']);
    await pool.query("INSERT INTO appointment_extras (appointment_id, extra_id) VALUES ('t163-b','t163-sh')");
    await pool.query("UPDATE services SET duration_min = duration_min WHERE id = 'sv1'");
    const [[svcDur]] = await pool.query("SELECT duration_min FROM services WHERE id = 'sv1'");
    r = await get('&service_id=sv1&barber_id=b1&extras=t163-x10');
    const first = r.slots[0] && r.slots[0].time;
    const expectFirst = (() => { const m = 9 * 60 + svcDur.duration_min + 5; return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); })();
    check('dynamique : l\'espace libre commence là où finit le RDV d\'avant', first === expectFirst, first + ' attendu ' + expectFirst);
    await pool.query("DELETE FROM appointments WHERE id = 't163-b'");
    // Réservation acceptée à une heure libre hors de la liste (équipe).
    const res = await fetch(BASE + '/api/appointments/admin-create', { method: 'POST', headers: ADMIN,
      body: JSON.stringify({ client_name: 'T163 Libre', service_id: 'sv1', extras: ['t163-x10'], barber_id: 'b1', date: DAY, time: '09:10' }) });
    check('équipe : RDV possible à une heure libre qui n\'est pas « à la suite » (09:10)', res.status === 200, res.status);
    r = await get('&service_id=sv1&barber_id=b1&held=' + encodeURIComponent('b1|' + DAY + '|12:00|30'));
    check('réservation à plusieurs (créneaux tenus) : toutes les heures', r.packed === false, JSON.stringify(r).slice(0, 80));
    // Premier disponible : réunion des heures à la suite de chaque coiffeur.
    r = await get('&service_id=sv1&extras=t163-x10');
    check('« Premier disponible » : heures à la suite aussi', r.packed === true && r.slots.length <= r.all_count, r.slots.length + '/' + r.all_count);
  } finally {
    await pool.query("DELETE FROM appointment_extras WHERE appointment_id LIKE 't163%'");
    await pool.query("DELETE FROM appointments WHERE client_name LIKE 'T163%'");
    await pool.query("DELETE FROM extras WHERE id IN ('t163-x10','t163-sh')");
    await pool.query("DELETE FROM barber_schedules WHERE barber_id = 'b1'");
    await pool.query("UPDATE barbers SET accepts_appointments = ? WHERE id = 'b1'", [acc.accepts_appointments]);
    await pool.query("DELETE FROM settings WHERE salon_id = 's1' AND `key` IN ('rdv_slot_step_min','rdv_buffer_min')");
    for (const o of old.filter((x) => x.key !== 'rdv_guest_email_code')) await pool.query('INSERT INTO settings (salon_id, `key`, value) VALUES (?,?,?)', ['s1', o.key, o.value]);
  }
  const g = fs.readFileSync(path.join(__dirname, '../../public/group-booking.js'), 'utf8');
  check('réservation à plusieurs (group-booking.js) : toujours toutes les heures', (g.match(/availability\?all=1&date=/g) || []).length === 2);
  for (const [f, pre] of [['poste.html', 'pa'], ['caisse.html', 'pa'], ['dashboard.html', 'aa']]) {
    const h = fs.readFileSync(path.join(__dirname, '../../public/' + f), 'utf8');
    check(f + ' : lien « Voir toutes les heures » (équipe)', h.includes('id="' + pre + '-all-hours"') && h.includes("(" + pre + "AllHours ? '&all=1' : '')") && h.includes('Voir toutes les heures ('));
  }
  const p = fs.readFileSync(path.join(__dirname, '../../public/poste.html'), 'utf8');
  check('poste : heure touchée dans l\'agenda -> toutes les heures (l\'heure exacte reste choisie)', p.includes('var paAllHours = !!prefTime;'));
  await pool.end();
  console.log(`\n${pass} OK, ${fail} ECHEC`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
