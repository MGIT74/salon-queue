// Coupe terminée plus tôt que prévu :
//  - AVEC le Timer (vraie heure de début) : le reste de la plage redevient réservable tout de suite ;
//  - SANS Timer (« Je prends » : marqué terminé dès le début, sans heure de début) : la plage reste bloquée jusqu'à sa
//    fin prévue (avant : libérée alors que la coupe était encore en cours -> réservation par-dessus possible).
// L'agenda du poste suit la même règle pour le rectangle « Libre » (pdRealEnd). Vraie base + vrai serveur (port 3999).
process.env.DB_HOST = process.env.DB_HOST || '127.0.0.1';
process.env.DB_USER = process.env.DB_USER || 'sq';
process.env.DB_PASSWORD = process.env.DB_PASSWORD || 'sqpass';
process.env.DB_NAME = process.env.DB_NAME || 'salonq';
process.env.SETTINGS_ENCRYPTION_KEY = process.env.SETTINGS_ENCRYPTION_KEY || 'testkeytestkeytestkeytestkey123456';
const path = require('path'), fs = require('fs');
const { pool } = require(path.join(__dirname, '../../src/db'));
const BASE = 'http://127.0.0.1:3999';
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n + (x ? '  [' + String(x).slice(0, 200) + ']' : '')); };
const DAY = new Date(Date.now() + 47 * 864e5).toISOString().slice(0, 10);
const slots = async () => ((await (await fetch(BASE + '/api/appointments/availability?all=1&date=' + DAY + '&service_id=sv1&barber_id=b1', { headers: { 'X-Salon-Slug': 'test' } })).json()).slots || []).map((x) => x.time);

(async () => {
  const [[b1]] = await pool.query("SELECT accepts_appointments, timer_enabled FROM barbers WHERE id = 'b1'");
  const [[step]] = await pool.query("SELECT value FROM settings WHERE salon_id = 's1' AND `key` = 'rdv_buffer_min'");
  try {
    await pool.query("INSERT INTO settings (salon_id, `key`, value) VALUES ('s1','rdv_buffer_min','0') ON DUPLICATE KEY UPDATE value = '0'");
    await pool.query("UPDATE barbers SET accepts_appointments = 1 WHERE id = 'b1'");
    await pool.query("DELETE FROM barber_schedules WHERE barber_id = 'b1'");
    for (let w = 0; w <= 6; w++) await pool.query("INSERT INTO barber_schedules (id, barber_id, weekday, start_time, end_time, active) VALUES (UUID(), 'b1', ?, '09:00:00', '19:00:00', 1)", [w]);
    await pool.query("DELETE FROM appointments WHERE id = 't164-a'"); await pool.query("DELETE FROM queue WHERE id = 't164-q'");
    await pool.query("INSERT INTO queue (id, salon_id, client_name, service_id, barber_id, status, checkin_at, end_at) VALUES ('t164-q','s1','T164','sv1','b1','done', UTC_TIMESTAMP(), UTC_TIMESTAMP())");
    await pool.query("INSERT INTO appointments (id, salon_id, barber_id, client_name, service_id, scheduled_at, status, cancel_token, promoted_queue_id) VALUES ('t164-a','s1','b1','T164','sv1',?, 'confirmed','tok164','t164-q')", [DAY + ' 10:00:00']);
    let s = await slots();
    check('terminé SANS Timer (pas d\'heure de début) : 10:00-10:30 reste bloqué', !s.includes('10:00') && !s.includes('10:15') && s.includes('10:30'), s.filter((t) => t >= '09:50' && t <= '10:35').join(','));
    await pool.query("UPDATE queue SET start_at = UTC_TIMESTAMP() - INTERVAL 10 MINUTE WHERE id = 't164-q'");
    s = await slots();
    check('terminé AVEC le Timer : la plage est libérée (réservable tout de suite)', s.includes('10:00') && s.includes('10:15'), s.filter((t) => t >= '09:50' && t <= '10:35').join(','));
    const r = await (await fetch(BASE + '/api/appointments?date=' + DAY, { headers: { 'X-Salon-Slug': 'test', 'X-Admin-Password': 'adminpw' } })).json();
    const a = (r.items || []).find((x) => x.id === 't164-a');
    check('liste des RDV : vraie heure de début / fin de la coupe envoyée aux écrans', a && a.queue_start_at && /Z$/.test(a.queue_start_at) && a.queue_end_at, a && JSON.stringify({ s: a.queue_start_at, e: a.queue_end_at }));
  } finally {
    await pool.query("DELETE FROM appointments WHERE id = 't164-a'"); await pool.query("DELETE FROM queue WHERE id = 't164-q'");
    await pool.query("DELETE FROM barber_schedules WHERE barber_id = 'b1'");
    await pool.query("UPDATE barbers SET accepts_appointments = ? WHERE id = 'b1'", [b1.accepts_appointments]);
    if (step) await pool.query("UPDATE settings SET value = ? WHERE salon_id = 's1' AND `key` = 'rdv_buffer_min'", [step.value]);
    else await pool.query("DELETE FROM settings WHERE salon_id = 's1' AND `key` = 'rdv_buffer_min'");
  }
  // Agenda du poste : même règle (pdRealEnd).
  const p = fs.readFileSync(path.join(__dirname, '../../public/poste.html'), 'utf8');
  const src = p.match(/function pdRealEnd\(it\) \{[\s\S]*?\n\}\n/)[0];
  const f = new Function(src + '; return pdRealEnd;')();
  const end = new Date(2026, 10, 2, 10, 12);   // fini à 10:12 (heure locale)
  const it = (st, a) => ({ st, start: 600, end: 630, a });
  check('poste : terminé avec le Timer à 10:12 -> plage jusqu\'à 10:12', f(it('done', { queue_start_at: 'x', queue_end_at: end.toISOString() })) === 612);
  check('poste : terminé sans Timer -> plage prévue (10:30)', f(it('done', { queue_start_at: null, queue_end_at: end.toISOString() })) === 630);
  check('poste : pas terminé -> plage prévue', f(it('todo', {})) === 630);
  check('poste : « Libre » utilise la vraie fin', p.includes('return [it.start, pdRealEnd(it)];'));
  await pool.end();
  console.log(`\n${pass} OK, ${fail} ECHEC`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
