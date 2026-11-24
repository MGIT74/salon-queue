// « Déplacement magique » de 5 min (agenda de Mon poste) : le trou libéré commence hors de la grille des créneaux
// (RDV passé de 10:00 à 09:55 -> libre dès 10:25). Avant : l'ajout d'une prestation qui y tient pile demandait
// « Forcer », et la page de RDV en ligne ne proposait jamais 10:25. Vraie base + vrai serveur (port 3999).
process.env.DB_HOST = process.env.DB_HOST || '127.0.0.1';
process.env.DB_USER = process.env.DB_USER || 'sq';
process.env.DB_PASSWORD = process.env.DB_PASSWORD || 'sqpass';
process.env.DB_NAME = process.env.DB_NAME || 'salonq';
process.env.SETTINGS_ENCRYPTION_KEY = process.env.SETTINGS_ENCRYPTION_KEY || 'testkeytestkeytestkeytestkey123456';
const path = require('path');
const { pool } = require(path.join(__dirname, '../../src/db'));
const BASE = 'http://127.0.0.1:3999';
const BOB = { 'Content-Type': 'application/json', 'X-Salon-Slug': 'test', 'X-Barber-Id': 'b2', 'X-Barber-Pin': '2222' };
const PUB = { 'Content-Type': 'application/json', 'X-Salon-Slug': 'test' };
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n + (x ? '  [' + String(x).slice(0, 220) + ']' : '')); };
const call = async (method, p, body, h) => { const r = await fetch(BASE + p, { method, headers: h, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, data: await r.json().catch(() => ({})) }; };

(async () => {
  const D = new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10);
  const [oldS] = await pool.query("SELECT * FROM barber_schedules WHERE barber_id = 'b2'");
  const [oldB] = await pool.query("SELECT * FROM barber_breaks WHERE barber_id = 'b2'");
  const [[bb]] = await pool.query("SELECT accepts_appointments FROM barbers WHERE id = 'b2'");
  const clean = () => pool.query("DELETE FROM appointments WHERE client_name LIKE 'T185%'");
  try {
    await clean();
    await pool.query("UPDATE barbers SET accepts_appointments = 1 WHERE id = 'b2'");
    await pool.query("DELETE FROM barber_schedules WHERE barber_id = 'b2'");
    await pool.query("DELETE FROM barber_breaks WHERE barber_id = 'b2'");
    for (let w = 0; w <= 6; w++) await pool.query("INSERT INTO barber_schedules (id, barber_id, weekday, start_time, end_time, active) VALUES (UUID(), 'b2', ?, '09:00:00', '19:00:00', 1)", [w]);
    // A 10:00-10:30, B 11:10-11:40 : 40 min libres, la Coupe + barbe dure 45 min
    await pool.query(`INSERT INTO appointments (id, salon_id, barber_id, client_name, service_id, scheduled_at, status, source, cancel_token) VALUES
      ('t185-a','s1','b2','T185 A','sv1',?,'confirmed','admin','t185a'), ('t185-b','s1','b2','T185 B','sv1',?,'confirmed','admin','t185b')`, [D + ' 10:00:00', D + ' 11:10:00']);
    const times = async (q) => ((await call('GET', '/api/appointments/availability?date=' + D + '&service_id=sv2' + q, null, PUB)).data.slots || []).map((x) => x.time);

    check('avant : 40 min libres, pas de place pour 45 min', !(await times('&barber_id=b2&all=1')).some((t) => t >= '10:00' && t < '11:10'));
    let r = await call('PUT', '/api/appointments/t185-a/nudge', { minutes: -5 }, BOB);
    check('déplacement magique : A passe à 09:55', r.status === 200 && r.data.to === '09:55', JSON.stringify(r.data));
    check('en ligne : 10:25 (trou libéré, hors grille) proposé', (await times('&barber_id=b2')).includes('10:25'));
    check('en ligne « Premier disponible » : 10:25 avec Bob', ((await call('GET', '/api/appointments/availability?date=' + D + '&service_id=sv2', null, PUB)).data.slots || []).some((x) => x.time === '10:25' && x.barber_id === 'b2'));
    check('jamais d\'heure qui chevauche (10:20, 10:30)', !(await times('&barber_id=b2&all=1')).some((t) => t === '10:20' || t === '10:30'));
    r = await call('POST', '/api/appointments/admin-create', { client_name: 'T185 C', service_id: 'sv2', barber_id: 'b2', date: D, time: '10:25' }, BOB);
    check('agenda : ajout à 10:25 accepté SANS « Forcer »', r.status === 200 && r.data.forced === false, JSON.stringify(r.data));
    r = await call('POST', '/api/appointments/admin-create', { client_name: 'T185 D', service_id: 'sv3', barber_id: 'b2', date: D, time: '11:00' }, BOB);
    check('agenda : un vrai chevauchement demande toujours « Forcer »', r.status === 409, JSON.stringify(r.data));
    r = await call('POST', '/api/appointments/admin-create', { client_name: 'T185 E', service_id: 'sv3', barber_id: 'b2', date: D, time: '11:43' }, BOB);
    check('agenda : heure précise libre hors grille (11:43) acceptée', r.status === 200 && r.data.forced === false, JSON.stringify(r.data));
    // Heure touchée pas libre : le créneau entouré est le plus proche, avant OU après (09:55 plutôt que 11:00 pour 10:05).
    const fs = require('fs');
    ['poste.html', 'caisse.html', 'dashboard.html'].forEach((f) => {
      const h = fs.readFileSync(path.join(__dirname, '../../public', f), 'utf8');
      check(f + ' : créneau libre le plus proche entouré (avant ou après)', !h.includes('return c.dataset.time >= prefTime; })[0]') && /Math\.abs\(toM\(c\.dataset\.time\) - toM\(prefTime\)\) < Math\.abs\(toM\(best\.dataset\.time\) - toM\(prefTime\)\)/.test(h));
    });
  } finally {
    await clean();
    await pool.query("DELETE FROM barber_schedules WHERE barber_id = 'b2'");
    for (const s of oldS) await pool.query('INSERT INTO barber_schedules SET ?', [s]);
    for (const b of oldB) await pool.query('INSERT INTO barber_breaks SET ?', [b]);
    await pool.query("UPDATE barbers SET accepts_appointments = ? WHERE id = 'b2'", [bb.accepts_appointments]);
    await pool.end();
  }
  console.log('\n' + pass + ' OK, ' + fail + ' ECHEC');
  process.exit(fail ? 1 : 0);
})();
