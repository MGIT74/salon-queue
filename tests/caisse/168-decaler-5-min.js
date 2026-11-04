// Agenda de « Mon poste » : décaler un RDV de 5 min (glisser le bloc ou toucher ▲ / ▼) pour combler les petits trous.
// Même jour, même coiffeur, seulement dans du temps libre ; le client n'est PAS prévenu ; « Revenir en arrière ».
// Vraie base + vrai serveur (port 3999).
process.env.DB_HOST = process.env.DB_HOST || '127.0.0.1';
process.env.DB_USER = process.env.DB_USER || 'sq';
process.env.DB_PASSWORD = process.env.DB_PASSWORD || 'sqpass';
process.env.DB_NAME = process.env.DB_NAME || 'salonq';
process.env.SETTINGS_ENCRYPTION_KEY = process.env.SETTINGS_ENCRYPTION_KEY || 'testkeytestkeytestkeytestkey123456';
const path = require('path'), fs = require('fs');
const { pool } = require(path.join(__dirname, '../../src/db'));
const BASE = 'http://127.0.0.1:3999';
const H = { 'Content-Type': 'application/json', 'X-Salon-Slug': 'test', 'X-Barber-Id': 'b2', 'X-Barber-Pin': '2222' };
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n + (x ? '  [' + String(x).slice(0, 220) + ']' : '')); };
const nudge = async (id, minutes) => { const r = await fetch(BASE + '/api/appointments/' + id + '/nudge', { method: 'PUT', headers: H, body: JSON.stringify({ minutes }) }); return { status: r.status, data: await r.json() }; };
const at = async (id) => String((await pool.query('SELECT scheduled_at FROM appointments WHERE id = ?', [id]))[0][0].scheduled_at).slice(11, 16);

(async () => {
  const D = new Date(Date.now() + 2 * 864e5).toISOString().slice(0, 10);
  const clean = () => pool.query("DELETE FROM appointments WHERE id LIKE 't168-%'");
  await clean();
  const [old] = await pool.query("SELECT weekday, start_time, end_time, active FROM barber_schedules WHERE barber_id = 'b2'");
  try {
    await pool.query("DELETE FROM barber_schedules WHERE barber_id = 'b2'");
    for (let w = 0; w <= 6; w++) await pool.query("INSERT INTO barber_schedules (id, barber_id, weekday, start_time, end_time, active) VALUES (UUID(), 'b2', ?, '09:00:00', '19:00:00', 1)", [w]);
    // Rafael 09:30-10:00, Yahia 10:00-10:30, trou de 5 min, Dean 10:35-11:05
    await pool.query(`INSERT INTO appointments (id, salon_id, barber_id, client_name, email, service_id, scheduled_at, status, source, cancel_token) VALUES
      ('t168-r','s1','b2','T168 Rafael',NULL,'sv1',?, 'confirmed','admin','t168r'),
      ('t168-y','s1','b2','T168 Yahia','t168@example.com','sv1',?, 'confirmed','admin','t168y'),
      ('t168-d','s1','b2','T168 Dean',NULL,'sv1',?, 'confirmed','admin','t168d')`, [D + ' 09:30:00', D + ' 10:00:00', D + ' 10:35:00']);
    let r = await nudge('t168-y', 5);
    check('Yahia glisse de 5 min dans le trou (10:00 -> 10:05)', r.status === 200 && r.data.from === '10:00' && r.data.to === '10:05' && await at('t168-y') === '10:05', JSON.stringify(r.data));
    r = await nudge('t168-y', 5);
    check('pas de place (Dean juste après) : refusé, rien ne bouge', r.status === 409 && await at('t168-y') === '10:05', JSON.stringify(r.data));
    r = await nudge('t168-y', -5);
    check('« Revenir en arrière » : décalage inverse -> 10:00', r.status === 200 && await at('t168-y') === '10:00');
    r = await nudge('t168-y', -5);
    check('ne passe pas par-dessus Rafael', r.status === 409 && await at('t168-y') === '10:00');
    r = await nudge('t168-r', -5);
    check('Rafael avance de 5 min (09:25) : hors du pas des créneaux, accepté', r.status === 200 && await at('t168-r') === '09:25', JSON.stringify(r.data));
    const ct = async (id) => { const v = (await pool.query('SELECT client_time FROM appointments WHERE id = ?', [id]))[0][0].client_time; return v ? String(v).slice(11, 16) : null; };
    check('heure du client gardée (09:30) tant qu\'il est décalé', await ct('t168-r') === '09:30');
    r = await nudge('t168-r', -5);
    check('5 min AU TOTAL par rapport à l\'heure du client : un 2e décalage dans le même sens est refusé', r.status === 409 && /Déplacer/.test(r.data.error) && await at('t168-r') === '09:25', JSON.stringify(r.data));
    const list = await (await fetch(BASE + '/api/appointments?month=' + D.slice(0, 7) + '&all=1&caisse_view=1', { headers: H })).json();
    const it = (list.items || []).find((x) => x.id === 't168-r');
    check('agenda : client_time envoyé aux écrans (icône ⇅, tiroir)', it && it.client_time && it.client_time.slice(11, 16) === '09:30', JSON.stringify(it && it.client_time));
    r = await nudge('t168-r', 5);
    check('remis à l\'heure du client : plus de marque', r.status === 200 && await at('t168-r') === '09:30' && await ct('t168-r') === null);
    await nudge('t168-r', 5);
    const ADMIN = { 'Content-Type': 'application/json', 'X-Salon-Slug': 'test', 'X-Admin-Password': 'adminpw' };
    r = await fetch(BASE + '/api/appointments/t168-r/reschedule', { method: 'PUT', headers: ADMIN, body: JSON.stringify({ date: D, time: '14:00' }) });
    check('« Déplacer » (client prévenu) : la nouvelle heure devient la sienne, plus de marque', r.status === 200 && await ct('t168-r') === null && await at('t168-r') === '14:00', r.status);
    r = await nudge('t168-y', 10);
    check('plus de 5 min : refusé (c\'est « Déplacer », avec email)', r.status === 400);
    await pool.query("UPDATE appointments SET scheduled_at = ? WHERE id = 't168-r'", [D + ' 09:00:00']);
    r = await nudge('t168-r', -5);
    check('avant le début de journée : refusé', r.status === 409 && await at('t168-r') === '09:00');
    await pool.query("UPDATE appointments SET status = 'cancelled' WHERE id = 't168-d'");
    r = await nudge('t168-d', 5);
    check('RDV annulé : refusé', r.status === 409);
  } finally {
    await clean();
    await pool.query("DELETE FROM barber_schedules WHERE barber_id = 'b2'");
    for (const s of old) await pool.query('INSERT INTO barber_schedules (id, barber_id, weekday, start_time, end_time, active) VALUES (UUID(), ?, ?, ?, ?, ?)', ['b2', s.weekday, s.start_time, s.end_time, s.active]);
  }
  const src = fs.readFileSync(path.join(__dirname, '../../src/routes/appointments.js'), 'utf8');
  const nudgeRoute = src.slice(src.indexOf("router.put('/:id/nudge'"), src.indexOf("router.put('/:id/nudge'") + 3500);
  check('serveur : aucun email pour un décalage de 5 min', !/sendAppointment/.test(nudgeRoute.slice(0, nudgeRoute.indexOf('}));') + 4)));
  const notify = fs.readFileSync(path.join(__dirname, '../../src/cron/notify.js'), 'utf8');
  const auto = fs.readFileSync(path.join(__dirname, '../../src/routes/automation.js'), 'utf8');
  const cli = fs.readFileSync(path.join(__dirname, '../../src/routes/clientAuth.js'), 'utf8');
  check('rappels email / SMS et compte client : l\'heure du client (pas l\'heure décalée)', notify.includes('COALESCE(a.client_time, a.scheduled_at) AS scheduled_at') && auto.includes('COALESCE(a.client_time, a.scheduled_at) AS scheduled_at') && cli.includes('COALESCE(a.client_time, a.scheduled_at) AS scheduled_at'));
  const app = fs.readFileSync(path.join(__dirname, '../../public/app.js'), 'utf8');
  check('tiroir (poste, caisse, admin) : ligne « Heure du client »', app.includes('⇅ Heure du client'));
  const p = fs.readFileSync(path.join(__dirname, '../../public/poste.html'), 'utf8');
  check('poste : petit signe ⇅ dans le bloc + bouton « Remettre à l\'heure du client »', /function pdMovedIconHtml\(a\)/.test(p) && p.includes('(a.client_time ? pdMovedIconHtml(a) : \'\')') && /function adRestoreClientTime\(\)/.test(p) && p.includes('id="ad-restore-time"'));
  check('poste : blocs déplaçables seulement s\'il y a la place (nudgeRoom), flèches ▲ / ▼', /function nudgeRoom\(it\)/.test(p) && p.includes("(canNudge ? ' can-nudge' : '')") && p.includes('class="pd-nudge up" data-dir="-1"') && p.includes('class="pd-nudge down" data-dir="1"'));
  check('poste : glisser à la souris, au doigt par les flèches (le bloc fait défiler)', p.includes("if (e.pointerType === 'touch' && !handle) return;") && p.includes("drag.bl.style.transform = 'translateY(' + off + 'px)'"));
  check('poste : bandeau « Revenir en arrière » (décalages du jour gardés sur l\'appareil)', /function pdNudgeBarHtml\(dateStr\)/.test(p) && p.includes('pdNudgeBarHtml(dateStr) +') && /function pdNudgeUndo\(dateStr\)[\s\S]{0,400}pdNudge\(last\.id, -last\.minutes, true\)/.test(p));
  check('poste : après un glisser, le tiroir ne s\'ouvre pas', p.includes('bl.dataset.noClick'));
  await pool.end();
  console.log(`\n${pass} OK, ${fail} ECHEC`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
