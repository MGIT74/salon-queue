// Note interne depuis le tiroir d'un RDV À VENIR (pas encore dans la file) : modifiable partout (Mon poste, caisse,
// admin), comme pour un RDV du jour. C'est la même note client (client_notes) que celle de la file.
// Vraie base + vrai serveur (port 3999).
process.env.DB_HOST = process.env.DB_HOST || '127.0.0.1';
process.env.DB_USER = process.env.DB_USER || 'sq';
process.env.DB_PASSWORD = process.env.DB_PASSWORD || 'sqpass';
process.env.DB_NAME = process.env.DB_NAME || 'salonq';
process.env.SETTINGS_ENCRYPTION_KEY = process.env.SETTINGS_ENCRYPTION_KEY || 'testkeytestkeytestkeytestkey123456';
const path = require('path'), fs = require('fs');
const { pool } = require(path.join(__dirname, '../../src/db'));
const BASE = 'http://127.0.0.1:3999';
const H = (b, pin) => ({ 'Content-Type': 'application/json', 'X-Salon-Slug': 'test', 'X-Barber-Id': b, 'X-Barber-Pin': pin });
const ADMIN = { 'Content-Type': 'application/json', 'X-Salon-Slug': 'test', 'X-Admin-Password': 'adminpw' };
const call = async (method, p, body, h) => { const r = await fetch(BASE + p, { method, headers: h, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, data: await r.json().catch(() => ({})) }; };
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n + (x ? '  [' + String(x).slice(0, 200) + ']' : '')); };
const DAY = new Date(Date.now() + 12 * 864e5).toISOString().slice(0, 10);

(async () => {
  const del = async () => {
    await pool.query("DELETE FROM appointments WHERE id = 't166-a'");
    await pool.query("DELETE FROM client_notes WHERE salon_id = 's1' AND client_key LIKE '%t166%'");
  };
  await del();
  try {
    await pool.query("INSERT INTO appointments (id, salon_id, barber_id, client_name, email, phone, service_id, scheduled_at, status, cancel_token) VALUES ('t166-a','s1','b1','T166 Sami','sami.t166@client.test','0612236358','sv1',?, 'confirmed','tok166')", [DAY + ' 10:40:00']);
    let r = await call('PUT', '/api/appointments/t166-a/note', { note: 'Préfère dégradé américain' }, H('b2', '2222'));
    check('poste / caisse : note sur un RDV à venir (même d\'un collègue) -> enregistrée', r.status === 200, JSON.stringify(r.data));
    r = await call('GET', '/api/appointments?date=' + DAY, null, ADMIN);
    const a = (r.data.items || []).find((x) => x.id === 't166-a');
    check('la note revient avec le RDV (tiroir, agenda)', a && a.note === 'Préfère dégradé américain', a && a.note);
    const [[n]] = await pool.query("SELECT COUNT(*) n FROM client_notes WHERE salon_id = 's1' AND note = 'Préfère dégradé américain'");
    check('même note client que la file (client_notes)', n.n === 1);
    r = await call('PUT', '/api/appointments/t166-a/note', { note: '' }, ADMIN);
    const [[n2]] = await pool.query("SELECT COUNT(*) n FROM client_notes WHERE salon_id = 's1' AND note = 'Préfère dégradé américain'");
    check('admin : note vidée -> supprimée', r.status === 200 && n2.n === 0);
    r = await call('PUT', '/api/appointments/inconnu/note', { note: 'x' }, ADMIN);
    check('RDV inconnu : 404', r.status === 404);
    r = await call('PUT', '/api/appointments/t166-a/note', { note: 'x' }, { 'Content-Type': 'application/json', 'X-Salon-Slug': 'test' });
    check('sans connexion : refusé', r.status === 401 || r.status === 403, String(r.status));
  } finally { await del(); }
  const read = (f) => fs.readFileSync(path.join(__dirname, '../../public/' + f), 'utf8');
  for (const f of ['poste.html', 'caisse.html']) {
    const h = read(f);
    check(f + ' : tiroir -> la note est toujours modifiable (plus « disponible lorsque le RDV entrera dans la file »)',
      !h.includes('La note interne sera disponible lorsque') && h.includes("adQueueId ? '/api/queue/' + adQueueId + '/note' : '/api/appointments/' + adAppt.id + '/note'"));
  }
  const d = read('dashboard.html');
  check('admin : RDV à venir -> note enregistrée via le RDV', d.includes("'/api/appointments/' + encodeURIComponent(drawerClientId) + '/note'") && !d.includes("ce RDV n\\'est pas encore dans la file (jour futur)"));
  await pool.end();
  console.log(`\n${pass} OK, ${fail} ECHEC`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
