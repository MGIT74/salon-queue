// « Forcer » un RDV dans un créneau trop court (équipe : admin, Mon poste, caisse ; jamais les pages clients).
// Chevauchement d'autres RDV accepté avec la case « Je prends la responsabilité » ; jamais pause / hors horaires / passé.
// Trace : forced_by / forced_at, affichés dans le tiroir et dans l'agenda du poste. Vraie base + vrai serveur (port 3999).
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
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n + (x ? '  [' + String(x).slice(0, 220) + ']' : '')); };
const call = async (method, p, body, h) => { const r = await fetch(BASE + p, { method, headers: h, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, data: await r.json().catch(() => ({})) }; };

(async () => {
  const D = new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10);
  const clean = () => pool.query("DELETE FROM appointments WHERE client_name LIKE 'T169%'");
  await clean();
  const [old] = await pool.query("SELECT weekday, start_time, end_time, active FROM barber_schedules WHERE barber_id = 'b2'");
  const [oldBreaks] = await pool.query("SELECT * FROM barber_breaks WHERE barber_id = 'b2'");
  try {
    await pool.query("DELETE FROM barber_schedules WHERE barber_id = 'b2'");
    await pool.query("DELETE FROM barber_breaks WHERE barber_id = 'b2'");
    for (let w = 0; w <= 6; w++) await pool.query("INSERT INTO barber_schedules (id, barber_id, weekday, start_time, end_time, active) VALUES (UUID(), 'b2', ?, '09:00:00', '19:00:00', 1)", [w]);
    const wd = new Date(D + 'T00:00:00Z').getUTCDay();
    await pool.query("INSERT INTO barber_breaks (id, barber_id, weekday, start_time, end_time, active) VALUES (UUID(), 'b2', ?, '12:00:00', '13:00:00', 1)", [wd]);
    // Youcef 16:10-16:40, Rafael 17:00-17:30 : 20 min libres, la coupe dure 30 min
    await pool.query(`INSERT INTO appointments (id, salon_id, barber_id, client_name, service_id, scheduled_at, status, source, cancel_token) VALUES
      ('t169-y','s1','b2','T169 Youcef','sv1',?,'confirmed','admin','t169y'), ('t169-r','s1','b2','T169 Rafael','sv1',?,'confirmed','admin','t169r')`, [D + ' 16:10:00', D + ' 17:00:00']);
    const body = { client_name: 'T169 Client', service_id: 'sv1', barber_id: 'b2', date: D, time: '16:40' };
    let r = await call('POST', '/api/appointments/admin-create', body, BOB);
    check('sans « forcer » : refusé comme avant', r.status === 409, JSON.stringify(r.data));
    r = await call('GET', '/api/appointments/force-check?barber_id=b2&date=' + D + '&time=16:40&service_id=sv1', null, BOB);
    check('aperçu : 16:40 – 17:10, déborde de 10 min sur Rafael', r.data.ok && r.data.end === '17:10' && r.data.overlaps.length === 1 && r.data.overlaps[0].client_name === 'T169 Rafael' && r.data.overlaps[0].minutes === 10, JSON.stringify(r.data));
    r = await call('POST', '/api/appointments/admin-create', Object.assign({}, body, { force: true }), BOB);
    check('forcer SANS la case « Je prends la responsabilité » : refusé', r.status === 409);
    r = await call('POST', '/api/appointments/admin-create', Object.assign({}, body, { force: true, force_ack: true }), BOB);
    const [[row]] = await pool.query("SELECT forced_by, forced_at, scheduled_at FROM appointments WHERE client_name = 'T169 Client'");
    check('forcer + case cochée (poste / caisse) : créé, « forcé par Bob »', r.status === 200 && r.data.forced === true && row && row.forced_by === 'Bob' && row.forced_at, JSON.stringify(r.data));
    r = await call('POST', '/api/appointments/admin-create', Object.assign({}, body, { client_name: 'T169 Admin', time: '17:20', force: true, force_ack: true }), ADMIN);
    const [[row2]] = await pool.query("SELECT forced_by FROM appointments WHERE client_name = 'T169 Admin'");
    check('admin : « forcé par l\'admin »', r.status === 200 && row2 && row2.forced_by === "l'admin", JSON.stringify(r.data));
    r = await call('POST', '/api/appointments/admin-create', Object.assign({}, body, { client_name: 'T169 Pause', time: '11:45', force: true, force_ack: true }), BOB);
    check('jamais pendant une pause', r.status === 409, JSON.stringify(r.data));
    r = await call('POST', '/api/appointments/admin-create', Object.assign({}, body, { client_name: 'T169 Tard', time: '18:45', force: true, force_ack: true }), BOB);
    check('jamais après la fin des horaires', r.status === 409, JSON.stringify(r.data));
    const list = await call('GET', '/api/appointments?month=' + D.slice(0, 7) + '&all=1&caisse_view=1', null, BOB);
    const it = (list.data.items || []).find((x) => x.client_name === 'T169 Client');
    check('agenda : forced_by / forced_at envoyés aux écrans', it && it.forced_by === 'Bob' && it.forced_at, JSON.stringify(it && { f: it.forced_by, at: it.forced_at }));
    r = await call('POST', '/api/appointments', { client_name: 'T169 Public', email: 't169@example.com', service_id: 'sv1', barber_id: 'b2', date: D, time: '16:40', force: true, force_ack: true }, { 'Content-Type': 'application/json', 'X-Salon-Slug': 'test' });
    check('page client : « forcer » ignoré (créneau refusé)', r.status !== 200 || !(await pool.query("SELECT id FROM appointments WHERE client_name = 'T169 Public'"))[0].length, r.status);
  } finally {
    await clean();
    await pool.query("DELETE FROM barber_schedules WHERE barber_id = 'b2'");
    for (const s of old) await pool.query('INSERT INTO barber_schedules (id, barber_id, weekday, start_time, end_time, active) VALUES (UUID(), ?, ?, ?, ?, ?)', ['b2', s.weekday, s.start_time, s.end_time, s.active]);
    await pool.query("DELETE FROM barber_breaks WHERE barber_id = 'b2'");
    for (const b of oldBreaks) await pool.query('INSERT INTO barber_breaks SET ?', [b]);
  }
  const read = (f) => fs.readFileSync(path.join(__dirname, '../../public/' + f), 'utf8');
  const app = read('app.js'), p = read('poste.html'), c = read('caisse.html'), d = read('dashboard.html');
  check('fenêtre commune (lien, aperçu, case obligatoire, bouton orange)', /function staffForceHtml\(p\)/.test(app) && /function staffForceInit\(o\)/.test(app) && app.includes('Je prends la responsabilité de ce débordement') && app.includes("go.disabled = !box.checked"));
  check('poste, caisse, admin : « Forcer » dans l\'étape Créneau + force / force_ack envoyés', [[p, 'pa'], [c, 'pa'], [d, 'aa']].every(([h, x]) => h.includes("staffForceHtml('" + x + "')") && h.includes('force: !!state.force, force_ack: !!state.force')));
  check('heure touchée dans l\'agenda : « Forcer le RDV à 16:40 », un toucher -> avertissement, « Changer l\'heure… »', app.includes("'⚠ Forcer le RDV à <span class=\"force-tm\">'") && app.includes("row.style.display = dt ? 'none' : ''") && app.includes('Changer l\\\'heure…'));
  check('« Forcer » SEULEMENT si l\'heure touchée tombe dans un espace libre trop court (pas libre en entier, pas déjà prise, jamais sans heure touchée)', /function loadFree\(\) \{\s*forceAt = ''; w\.style\.display = 'none';/.test(app) && /availability\?all=1/.test(app) && app.includes("if (!ov.length || ov.some(function (x) { return x.time <= dt; })) return;") && app.includes("forceAt = dt; paintLink(); w.style.display = '';"));
  check('admin et caisse : heure touchée libre déjà sélectionnée, « Continuer à HH:MM » (comme Mon poste)', [d, c].every((h) => /AllHours = !!prefTime;/.test(h) && h.includes("nx.textContent = 'Continuer à ' + want;") && /-dt-next/.test(h) && h.includes('.aa-slot.pref:not(.sel)')));
  check('« Aucun créneau » : toute la largeur + durée', fs.readFileSync(path.join(__dirname, '../../public/app.css'), 'utf8').includes('.aa-slots > .hint') && p.includes("(r.duration_min ? ' pour ' + formatMinutes(r.duration_min) : '')"));
  check('pages clients : pas de « Forcer »', ['rdv.html', 'compte.html', 'kiosk.html'].every((f) => !read(f).includes('staffForce')));
  check('tiroir : « RDV forcé par … » ; agenda du poste : contour, ⚠ Forcé, hachures', app.includes('forcedInfoHtml(a)') && p.includes("(a.forced_by ? ' forced' : '')") && /function pdForcedHatchHtml\(it, items\)/.test(p));
  await pool.end();
  console.log(`\n${pass} OK, ${fail} ECHEC`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
