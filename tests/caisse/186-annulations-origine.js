// RDV annulés : on sait QUI a annulé. Client (lien de l'email / compte, ou a prévenu le salon) ou salon (coiffeur, admin),
// ou « origine inconnue » pour les anciens. Absent = pas venu sans prévenir ni annuler. Manque à gagner du dashboard
// détaillé en 4 lignes. Vraie base + vrai serveur (port 3999).
process.env.DB_HOST = process.env.DB_HOST || '127.0.0.1';
process.env.DB_USER = process.env.DB_USER || 'sq';
process.env.DB_PASSWORD = process.env.DB_PASSWORD || 'sqpass';
process.env.DB_NAME = process.env.DB_NAME || 'salonq';
process.env.SETTINGS_ENCRYPTION_KEY = process.env.SETTINGS_ENCRYPTION_KEY || 'testkeytestkeytestkeytestkey123456';
const path = require('path'), fs = require('fs');
const { pool } = require(path.join(__dirname, '../../src/db'));
const BASE = 'http://127.0.0.1:3999';
const BOB = { 'Content-Type': 'application/json', 'X-Salon-Slug': 'test', 'X-Barber-Id': 'b2', 'X-Barber-Pin': '2222' };
const ADMIN = { 'Content-Type': 'application/json', 'X-Salon-Slug': 'test', 'X-Admin-Password': 'adminpw' };
const PUB = { 'Content-Type': 'application/json', 'X-Salon-Slug': 'test' };
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n + (x ? '  [' + String(x).slice(0, 220) + ']' : '')); };
const call = async (method, p, body, h) => { const r = await fetch(BASE + p, { method, headers: h, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, data: await r.json().catch(() => ({})) }; };

(async () => {
  const F = new Date(Date.now() + 5 * 864e5).toISOString().slice(0, 10);   // à venir
  const P = new Date(Date.now() - 3 * 864e5).toISOString().slice(0, 10);   // passé (manque à gagner)
  const clean = async () => { await pool.query("DELETE FROM appointments WHERE client_name LIKE 'T186%'"); await pool.query("DELETE FROM queue WHERE client_name LIKE 'T186%'"); };
  await clean();
  const [oldS] = await pool.query("SELECT * FROM barber_schedules WHERE barber_id = 'b2'");
  const [oldL] = await pool.query("SELECT * FROM barber_leaves WHERE barber_id = 'b2'");
  try {
    // Bob travaille tous les jours 09:00-19:00 (le manque à gagner ne compte que les jours travaillés).
    await pool.query("DELETE FROM barber_schedules WHERE barber_id = 'b2'");
    await pool.query("DELETE FROM barber_leaves WHERE barber_id = 'b2'");
    for (let w = 0; w <= 6; w++) await pool.query("INSERT INTO barber_schedules (id, barber_id, weekday, start_time, end_time, active) VALUES (UUID(), 'b2', ?, '09:00:00', '19:00:00', 1)", [w]);
    const ins = (id, hhmm, day, extra) => pool.query(
      "INSERT INTO appointments (id, salon_id, barber_id, client_name, email, service_id, scheduled_at, status, source, cancel_token" + (extra && extra.cols ? ', ' + extra.cols : '') + ") VALUES (?,'s1','b2',?,?, 'sv1', ?, ?, 'online', ?" + (extra && extra.vals ? ', ' + extra.vals : '') + ")",
      [id, 'T186 ' + id, id + '@client.test', day + ' ' + hhmm + ':00', (extra && extra.status) || 'confirmed', 'tok186' + id]);
    await ins('c1', '10:00', F); await ins('s1', '11:00', F);

    console.log('\n[A] Qui a annulé');
    let r = await call('POST', '/api/appointments/cancel', { token: 'tok186c1' }, PUB);
    const [[c1]] = await pool.query("SELECT cancelled_by, cancelled_via, cancelled_at FROM appointments WHERE id = 'c1'");
    check('lien de l\'email (client) -> « client », via le lien, avec la date', r.status === 200 && c1.cancelled_by === 'client' && c1.cancelled_via === 'link' && c1.cancelled_at, JSON.stringify([r.data, c1]));
    r = await call('POST', '/api/appointments/s1/admin-cancel', {}, BOB);
    const [[s1]] = await pool.query("SELECT cancelled_by, cancelled_by_name FROM appointments WHERE id = 's1'");
    check('Mon poste (Bob) -> « salon », noté Bob', r.status === 200 && s1.cancelled_by === 'salon' && s1.cancelled_by_name === 'Bob', JSON.stringify([r.data, s1]));
    r = await call('GET', '/api/appointments?month=' + F.slice(0, 7), null, ADMIN);
    const it = (id) => (r.data.items || []).find((x) => x.id === id) || {};
    check('liste des RDV : origine exposée (client / salon · Bob)', it('c1').cancelled_by === 'client' && it('s1').cancelled_by === 'salon' && it('s1').cancelled_by_name === 'Bob' && it('c1').cancelled_at, JSON.stringify([it('c1'), it('s1')].map((x) => [x.cancelled_by, x.cancelled_by_name])));

    console.log('\n[B] Manque à gagner : 4 lignes');
    await ins('pc', '10:00', P, { cols: 'cancelled_by', vals: "'client'", status: 'cancelled' });
    await ins('ps', '11:00', P, { cols: 'cancelled_by, cancelled_by_name', vals: "'salon', 'Bob'", status: 'cancelled' });
    await ins('pu', '12:00', P, { status: 'cancelled' });
    await pool.query("INSERT INTO queue (id, salon_id, client_name, barber_id, service_id, status) VALUES ('t186q','s1','T186 absent','b2','sv1','cancelled')");
    await ins('pa', '14:00', P, { cols: 'promoted_queue_id', vals: "'t186q'" });
    const start = new Date(P + 'T00:00:00Z').toISOString(), end = new Date(new Date(P + 'T00:00:00Z').getTime() + 864e5).toISOString();
    r = await call('GET', '/api/barbers/salon-stats?start=' + start + '&end=' + end + '&start_date=' + P + '&end_date=' + P, null, ADMIN);
    const bd = r.data.missed_breakdown || {};
    check('absent 1 · client 1 · salon 1 · origine inconnue 1', bd.absent && bd.absent.count === 1 && bd.client.count === 1 && bd.salon.count === 1 && bd.unknown.count === 1, JSON.stringify(bd));
    check('les 4 montants font le total des RDV ratés', bd.absent && (bd.absent.cents + bd.client.cents + bd.salon.cents + bd.unknown.cents) === r.data.missed_revenue_cents && r.data.missed_appointments === 4, JSON.stringify([bd, r.data.missed_revenue_cents]));

    console.log('\n[C] Menu Clients : filtres Statut et Coiffeur');
    await pool.query("INSERT INTO queue (id, salon_id, client_name, barber_id, service_id, status, checkin_at) VALUES ('t186q2','s1','T186 prevenu','b2','sv1','cancelled', ?)", [P + ' 09:00:00']);
    await pool.query("UPDATE queue SET checkin_at = ? WHERE id = 't186q'", [P + ' 13:00:00']);
    await ins('pq', '15:00', P, { cols: 'promoted_queue_id, cancelled_by, cancelled_via', vals: "'t186q2', 'client', 'phone'", status: 'cancelled' });
    const hist = async (q) => ((await call('GET', '/api/queue/history?per_page=100&date_from=' + P + '&date_to=' + P + q, null, ADMIN)).data.items || []).filter((x) => /^T186/.test(x.client_name));
    let h = await hist('&status=no_show');
    check('Statut « Absents » : seulement le client pas venu', h.length === 1 && h[0].id === 't186q' && h[0].cancel_kind === 'absent', JSON.stringify(h.map((x) => [x.id, x.cancel_kind])));
    h = await hist('&status=cancelled:client');
    check('Statut « Annulés par le client » : le client qui a prévenu (passage) + le RDV annulé par le lien', h.length === 2 && h.some((x) => x.id === 't186q2' && !x.from_appointment) && h.some((x) => x.id === 'pc' && x.from_appointment), JSON.stringify(h.map((x) => [x.id, x.cancel_kind])));
    h = await hist('&status=cancelled:salon');
    check('Statut « Annulés par le salon » : le RDV annulé par Bob', h.length === 1 && h[0].id === 'ps', JSON.stringify(h.map((x) => x.id)));
    h = await hist('&barber_id=b1');
    check('Coiffeur : Alice n\'a aucun de ces passages', h.length === 0, JSON.stringify(h.map((x) => x.id)));
    h = await hist('&barber_id=b2');
    check('Coiffeur : Bob les a tous les deux', h.length === 2, JSON.stringify(h.map((x) => x.id)));

    // RDV annulés AVANT d'arriver (jamais dans la file) : aussi dans le menu Clients, comme dans le Manque à gagner.
    h = await hist('&status=cancelled:unknown&past_only=1');
    check('Clients « origine inconnue » : le RDV annulé avant d\'arriver est listé (fiche de RDV)', h.some((x) => x.id === 'pu' && x.from_appointment && x.cancel_kind === 'unknown'), JSON.stringify(h.map((x) => [x.id, x.cancel_kind])));
    h = await hist('&status=cancelled:salon&past_only=1');
    check('Clients « annulés par le salon » : celui de Bob (nom gardé)', h.some((x) => x.id === 'ps' && x.cancelled_by_name === 'Bob'), JSON.stringify(h.map((x) => [x.id, x.cancelled_by_name])));
    h = await hist('&status=cancelled:client&past_only=1');
    check('Clients « annulés par le client » : celui qui a prévenu + celui qui a annulé par le lien', h.length === 2 && h.some((x) => x.id === 'pc') && h.some((x) => x.id === 't186q2'), JSON.stringify(h.map((x) => x.id)));
    const dashSrc = fs.readFileSync(path.join(__dirname, '../../public/dashboard.html'), 'utf8');
    check('dashboard : « 10 RDV » cliquable -> Clients filtré (même période, heure passée)', /onclick="openMissedInClients\(/.test(dashSrc) && /function openMissedInClients\(kind\)/.test(dashSrc) && /past_only=1/.test(dashSrc));

    console.log('\n[D] Écrans');
    const app = fs.readFileSync(path.join(__dirname, '../../public/app.js'), 'utf8');
    const dash = fs.readFileSync(path.join(__dirname, '../../public/dashboard.html'), 'utf8');
    const queueSrc = fs.readFileSync(path.join(__dirname, '../../src/routes/queue.js'), 'utf8');
    check('tiroirs : « Annulé par le client / par le salon · nom / origine inconnue » + détail', /function apptStatusLabel\(a\)/.test(app) && app.includes("'Annulé par le client'") && app.includes("'Annulé · origine inconnue'") && /ad-cancel-detail/.test(app));
    check('dashboard : 4 lignes + barre, filtres par origine', /function missedBreakdownHtml\(/.test(dash) && dash.includes('value="cancelled:client"') && dash.includes('value="cancelled:salon"') && dash.includes('value="cancelled:unknown"'));
    check('« le client a prévenu » (file) -> annulé par le client, par téléphone', /cancelled_by = 'client', cancelled_via = 'phone'/.test(queueSrc));
  } finally {
    await clean();
    await pool.query("DELETE FROM barber_schedules WHERE barber_id = 'b2'");
    for (const s of oldS) await pool.query('INSERT INTO barber_schedules SET ?', [s]);
    for (const l of oldL) await pool.query('INSERT IGNORE INTO barber_leaves SET ?', [l]);
    await pool.end();
  }
  console.log('\n' + pass + ' OK, ' + fail + ' ECHEC');
  process.exit(fail ? 1 : 0);
})();
