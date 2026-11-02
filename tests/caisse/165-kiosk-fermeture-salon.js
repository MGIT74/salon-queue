// Kiosk (sans RDV) et heure de fermeture du SALON, stricte : un client n'est inscrit que si sa coupe (attente estimée +
// durée) finit au plus tard à la fermeture. Salon fermé (jour fermé, fermeture exceptionnelle, heure passée) : refusé.
// Horaires du salon jamais réglés : pas de limite (comme avant). Le kiosk grise les coiffeurs « Complet aujourd'hui ».
// Vraie base + vrai serveur (port 3999).
process.env.DB_HOST = process.env.DB_HOST || '127.0.0.1';
process.env.DB_USER = process.env.DB_USER || 'sq';
process.env.DB_PASSWORD = process.env.DB_PASSWORD || 'sqpass';
process.env.DB_NAME = process.env.DB_NAME || 'salonq';
process.env.SETTINGS_ENCRYPTION_KEY = process.env.SETTINGS_ENCRYPTION_KEY || 'testkeytestkeytestkeytestkey123456';
const path = require('path'), fs = require('fs');
const { pool } = require(path.join(__dirname, '../../src/db'));
const BASE = 'http://127.0.0.1:3999';
const PUB = { 'Content-Type': 'application/json', 'X-Salon-Slug': 'test' };
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n + (x ? '  [' + String(x).slice(0, 220) + ']' : '')); };
const call = async (method, p, body) => { const r = await fetch(BASE + p, { method, headers: PUB, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, data: await r.json().catch(() => ({})) }; };
const hm = (m) => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
const checkin = (name) => call('POST', '/api/queue/checkin', { client_name: name, barber_id: 'b2', service_id: 'sv1', extras: [] });

(async () => {
  const [oldSched] = await pool.query("SELECT weekday, start_time, end_time, active FROM salon_schedules WHERE salon_id = 's1'");
  const [[b2]] = await pool.query("SELECT kiosk_hidden FROM barbers WHERE id = 'b2'");
  const [busy] = await pool.query("SELECT id, status FROM queue WHERE salon_id = 's1' AND status IN ('waiting','in_progress')");
  try {
    if (busy.length) await pool.query("UPDATE queue SET status = 'cancelled' WHERE id IN (?)", [busy.map((x) => x.id)]);
    await pool.query("UPDATE barbers SET kiosk_hidden = 0 WHERE id = 'b2'");
    await pool.query("DELETE FROM salon_schedules WHERE salon_id = 's1'");
    let l = (await call('GET', '/api/queue/day-limits')).data;
    check('horaires du salon jamais réglés : pas de limite', l.limited === false && l.closed === false, JSON.stringify(l));
    const now = l.now_min;
    if (now > 22 * 60 + 30 || now < 60) { console.log('  (heure trop proche de minuit : test sauté)'); }
    else {
      const wd = new Date(Date.now()).getDay();
      const setDay = async (open, close, active = 1) => {
        await pool.query("DELETE FROM salon_schedules WHERE salon_id = 's1'");
        for (let w = 0; w <= 6; w++) await pool.query("INSERT INTO salon_schedules (id, salon_id, weekday, start_time, end_time, active) VALUES (UUID(), 's1', ?, ?, ?, ?)", [w, open, close, active]);
      };
      // Fermeture dans 45 min : une coupe de 30 min tient, la 2e (30 d'attente + 30) non.
      await setDay('00:00', hm(now + 45));
      l = (await call('GET', '/api/queue/day-limits')).data;
      check('day-limits : heure de fermeture du jour', l.limited && !l.closed && l.close_time === hm(now + 45), JSON.stringify(l));
      let r = await checkin('T165 Premier');
      check('1er client : finit avant la fermeture -> inscrit', r.status === 200 && r.data.entry, JSON.stringify(r.data).slice(0, 100));
      await new Promise((ok) => setTimeout(ok, 1100));   // heure d'arrivée à la seconde : l'ordre reste net
      r = await checkin('T165 Second');
      check('2e client : finirait après la fermeture -> refusé (too_late), strict', r.status === 409 && r.data.code === 'too_late' && /fermeture du salon à/.test(r.data.error), JSON.stringify(r.data));
      const [[n]] = await pool.query("SELECT COUNT(*) n FROM queue WHERE client_name = 'T165 Second'");
      const [[na]] = await pool.query("SELECT COUNT(*) n FROM appointments WHERE client_name = 'T165 Second'");
      check('refusé : rien n\'est resté (ni dans la file, ni dans l\'agenda)', n.n === 0 && na.n === 0, n.n + '/' + na.n);
      r = await call('POST', '/api/queue/checkin-group', { people: [{ name: 'T165 G1', service_id: 'sv1', barber_id: 'b2' }] });
      check('à plusieurs : même règle', r.status === 409 && r.data.code === 'too_late', JSON.stringify(r.data));
      // Heure de fermeture passée.
      await setDay('00:00', hm(now - 5));
      r = await checkin('T165 Tard');
      check('heure de fermeture passée : salon fermé', r.status === 409 && r.data.code === 'salon_closed', JSON.stringify(r.data));
      // Jour fermé (aucun jour actif aujourd'hui).
      await setDay('09:00', '19:00', 0);
      r = await checkin('T165 Jour');
      check('jour fermé : salon fermé', r.status === 409 && r.data.code === 'salon_closed', JSON.stringify(r.data));
      void wd;
    }
    // Fermeture exceptionnelle aujourd'hui (même sans horaires).
    await pool.query("DELETE FROM salon_schedules WHERE salon_id = 's1'");
    const today = (await call('GET', '/api/queue/day-limits')).data;
    const [[d]] = await pool.query("SELECT DATE(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '+01:00')) d");
    await pool.query("INSERT INTO salon_closures (id, salon_id, start_date, end_date, reason) VALUES ('t165-c','s1', CURDATE() - INTERVAL 1 DAY, CURDATE() + INTERVAL 1 DAY, 'T165')").catch(async () => {
      await pool.query("INSERT INTO salon_closures (id, salon_id, start_date, end_date) VALUES ('t165-c','s1', CURDATE() - INTERVAL 1 DAY, CURDATE() + INTERVAL 1 DAY)");
    });
    const r2 = await checkin('T165 Ferme');
    check('fermeture exceptionnelle : salon fermé', r2.status === 409 && r2.data.code === 'salon_closed', JSON.stringify(r2.data));
    void today; void d;
  } finally {
    await pool.query("DELETE FROM salon_closures WHERE id = 't165-c'");
    const [ids] = await pool.query("SELECT id FROM queue WHERE client_name LIKE 'T165%'");
    for (const x of ids) { await pool.query('DELETE FROM appointments WHERE promoted_queue_id = ?', [x.id]); await pool.query('DELETE FROM queue WHERE id = ?', [x.id]); }
    await pool.query("DELETE FROM salon_schedules WHERE salon_id = 's1'");
    for (const s of oldSched) await pool.query("INSERT INTO salon_schedules (id, salon_id, weekday, start_time, end_time, active) VALUES (UUID(), 's1', ?, ?, ?, ?)", [s.weekday, s.start_time, s.end_time, s.active]);
    await pool.query("UPDATE barbers SET kiosk_hidden = ? WHERE id = 'b2'", [b2.kiosk_hidden]);
    for (const x of busy) await pool.query('UPDATE queue SET status = ? WHERE id = ?', [x.status, x.id]);
  }
  const k = fs.readFileSync(path.join(__dirname, '../../public/kiosk.html'), 'utf8');
  check('kiosk : coiffeur « Complet aujourd\'hui » grisé et pas cliquable', k.includes("waitLabel = 'Complet aujourd\\'hui'") && /\(full \? ' disabled' : ' onclick="pickBarberAndGo/.test(k));
  check('kiosk : « Premier disponible » complet aussi', k.includes('any-tile full" disabled'));
  check('kiosk : salon fermé -> message, plus d\'inscription', k.includes('kiosk-closed') && k.includes("api('/api/queue/day-limits')"));
  await pool.end();
  console.log(`\n${pass} OK, ${fail} ECHEC`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
