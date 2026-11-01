// « Modifier la prestation » dans les listes « À suivre » du Timer (poste et caisse) : un client pas encore
// commencé dont la prestation a été mal choisie (kiosk) est corrigé avant de commencer. Même fenêtre que
// « À encaisser » de la caisse (app.js : editQueueServiceDialog). Vraie base + vrai serveur (port 3999).
process.env.DB_HOST = process.env.DB_HOST || '127.0.0.1';
process.env.DB_USER = process.env.DB_USER || 'sq';
process.env.DB_PASSWORD = process.env.DB_PASSWORD || 'sqpass';
process.env.DB_NAME = process.env.DB_NAME || 'salonq';
process.env.SETTINGS_ENCRYPTION_KEY = process.env.SETTINGS_ENCRYPTION_KEY || 'testkeytestkeytestkeytestkey123456';
const path = require('path'), fs = require('fs');
const { pool } = require(path.join(__dirname, '../../src/db'));
const BASE = 'http://127.0.0.1:3999';
const H = (barber, pin, acting) => Object.assign({ 'Content-Type': 'application/json', 'X-Salon-Slug': 'test', 'X-Barber-Id': barber, 'X-Barber-Pin': pin }, acting ? { 'X-Acting-As-Barber-Id': acting } : {});
const call = async (method, p, body, h) => { const r = await fetch(BASE + p, { method, headers: h, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, data: await r.json().catch(() => ({})) }; };
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n + (x ? '  [' + String(x).slice(0, 220) + ']' : '')); };
const svcOf = async (id) => (await pool.query('SELECT service_id FROM queue WHERE id = ?', [id]))[0][0].service_id;

(async () => {
  const clean = async () => {
    await pool.query("DELETE FROM queue WHERE id LIKE 't161%'");
    await pool.query("DELETE FROM appointments WHERE promoted_queue_id LIKE 't161%'");
    await pool.query("DELETE FROM services WHERE id = 't161-barbe'");
  };
  await clean();
  await pool.query("INSERT INTO services (id, salon_id, name, duration_min, price_cents) VALUES ('t161-barbe','s1','T161 Coupe + barbe',45,3000)");
  const ins = (id, barber) => pool.query(
    "INSERT INTO queue (id, salon_id, client_name, service_id, barber_id, status, checkin_at) VALUES (?,'s1',?,'sv1',?,'waiting', NOW())", [id, 'T161 ' + id, barber]);
  try {
    await ins('t161-bob', 'b2'); await ins('t161-libre', null); await ins('t161-alice', 'b1');
    let r = await call('PUT', '/api/queue/t161-bob', { service_id: 't161-barbe', extras: [] }, H('b2', '2222'));
    check('Bob corrige la prestation de SON client en attente', r.status === 200 && await svcOf('t161-bob') === 't161-barbe', JSON.stringify(r.data));
    r = await call('PUT', '/api/queue/t161-libre', { service_id: 't161-barbe', extras: [] }, H('b2', '2222'));
    check('client « premier disponible » en attente : n\'importe quel coiffeur peut corriger', r.status === 200 && await svcOf('t161-libre') === 't161-barbe', JSON.stringify(r.data));
    r = await call('PUT', '/api/queue/t161-alice', { service_id: 't161-barbe', extras: [] }, H('b2', '2222'));
    check('client d\'Alice : Bob seul ne peut pas', r.status === 403 && await svcOf('t161-alice') === 'sv1', JSON.stringify(r.data));
    r = await call('PUT', '/api/queue/t161-alice', { service_id: 't161-barbe', extras: [] }, H('b1', '1111'));
    check('client d\'Alice : Alice peut', r.status === 200 && await svcOf('t161-alice') === 't161-barbe', JSON.stringify(r.data));
    await pool.query("UPDATE queue SET status = 'in_progress', start_at = NOW() WHERE id = 't161-libre'");
    await pool.query("UPDATE queue SET barber_id = 'b1' WHERE id = 't161-libre'");
    r = await call('PUT', '/api/queue/t161-libre', { service_id: 'sv1', extras: [] }, H('b2', '2222'));
    check('client commencé par Alice : Bob ne peut plus (seulement en attente)', r.status === 403, JSON.stringify(r.data));
  } finally {
    await clean();
  }
  const app = fs.readFileSync(path.join(__dirname, '../../public/app.js'), 'utf8');
  const h = fs.readFileSync(path.join(__dirname, '../../public/poste.html'), 'utf8');
  const c = fs.readFileSync(path.join(__dirname, '../../public/caisse.html'), 'utf8');
  check('fenêtre commune editQueueServiceDialog (prestations / suppléments / total / PUT)', /function editQueueServiceDialog\(q, opts\)/.test(app) && app.includes("'/api/queue/' + encodeURIComponent(q.id)") && app.includes('Total actualisé'));
  check('poste : bouton « Modifier la prestation » dans la liste À suivre', /onclick="editWaitingService\(\\'' \+ q\.id \+ '\\'\)">Modifier la prestation<\/button>/.test(h) && /function editWaitingService\(id\)/.test(h));
  check('caisse : bouton dans À suivre + « À encaisser » inchangé (même fenêtre)', /onclick="editWaitingService\(\\'' \+ q\.id \+ '\\'\)">Modifier la prestation<\/button>/.test(c) && /function editFinishedService\(queueId\)[\s\S]{0,300}editQueueServiceDialog\(q, \{ hint: 'Correction avant encaissement uniquement\.'/.test(c));
  await pool.end();
  console.log(`\n${pass} OK, ${fail} ECHEC`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
