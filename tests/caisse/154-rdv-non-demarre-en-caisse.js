// RDV jamais demarre (ni « Commencer » ni « Absent ») : a la fin de son creneau prevu, il passe tout seul en
// « A encaisser » marque « Non demarre — a verifier ». Pas dans les statistiques tant qu'il n'est pas encaisse ;
// « Absent » en caisse le retire. Vraie base + vrai serveur (port 3999).
process.env.DB_HOST = process.env.DB_HOST || '127.0.0.1';
process.env.DB_USER = process.env.DB_USER || 'sq';
process.env.DB_PASSWORD = process.env.DB_PASSWORD || 'sqpass';
process.env.DB_NAME = process.env.DB_NAME || 'salonq';
process.env.SETTINGS_ENCRYPTION_KEY = process.env.SETTINGS_ENCRYPTION_KEY || 'testkeytestkeytestkeytestkey123456';
const path = require('path'), fs = require('fs');
const { pool } = require(path.join(__dirname, '../../src/db'));
const { autoManageTimersForSalon } = require(path.join(__dirname, '../../src/cron/autoTimer'));
const BASE = 'http://127.0.0.1:3999';
const H = { 'Content-Type': 'application/json', 'X-Salon-Slug': 'test', 'X-Barber-Id': 'b1', 'X-Barber-Pin': '1111' };
const call = async (method, p, body) => { const r = await fetch(BASE + p, { method, headers: H, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, data: await r.json().catch(() => ({})) }; };
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n + (x ? '  [' + x + ']' : '')); };
const row = async (id) => { const [[r]] = await pool.query('SELECT status, start_at, end_at, auto_unstarted FROM queue WHERE id = ?', [id]); return r; };
const minAgo = (m) => new Date(Date.now() - m * 60000);
const utc = (v) => (typeof v === 'string' ? new Date(v.replace(' ', 'T') + 'Z') : new Date(v)).getTime();
const ins = (id, barber, status, ago, extra = '') => pool.query(
  "INSERT INTO queue (id,salon_id,client_name,barber_id,service_id,status,checkin_at,start_at,is_appointment,total_duration_min,total_price_cents) VALUES (?,'s1',?,?,'sv1',?,?,?,1,30,2000)",
  [id, 'T154 ' + id, barber, status, minAgo(ago), status === 'in_progress' ? minAgo(ago) : null]);

(async () => {
  await pool.query("DELETE FROM queue WHERE id LIKE 't154%'");
  try { await pool.query("INSERT INTO barbers (id,salon_id,name,pin_code) VALUES ('b2','s1','Bob','2222') ON DUPLICATE KEY UPDATE name=name"); } catch (_) {}

  console.log('\n[A] Le cron');
  await ins('t154a', 'b1', 'waiting', 45);     // RDV il y a 45 min, prestation 30 min : creneau fini
  await ins('t154b', 'b1', 'waiting', 10);     // creneau pas fini
  await pool.query("UPDATE queue SET is_appointment = 0 WHERE id = 't154b'");
  await ins('t154c', 'b1', 'waiting', 20);     // RDV pendant son creneau : on attend
  await autoManageTimersForSalon('s1');
  let r = await row('t154a');
  check('creneau fini, jamais demarre : passe « termine », marque a verifier', r.status === 'done' && r.auto_unstarted === 1, JSON.stringify(r));
  check('aux heures PREVUES (debut = heure du RDV, fin = + 30 min)', Math.abs(utc(r.start_at) - minAgo(45).getTime()) < 5000 && Math.abs(utc(r.end_at) - (minAgo(45).getTime() + 30 * 60000)) < 5000);
  check('client sans RDV : jamais touche', (await row('t154b')).status === 'waiting');
  check('RDV encore dans son creneau : attend', (await row('t154c')).status === 'waiting');
  await ins('t154d', 'b2', 'waiting', 60);
  await ins('t154e', 'b2', 'in_progress', 5);   // Bob coiffe quelqu'un : il a du retard, le client attend sans doute
  await autoManageTimersForSalon('s1');
  check('coiffeur en train de coiffer : son RDV en retard n\'est PAS envoye en caisse', (await row('t154d')).status === 'waiting');

  console.log('\n[B] Caisse et statistiques');
  let p = await call('GET', '/api/queue/pending-payment');
  const it = (p.data.items || []).find((x) => x.id === 't154a');
  check('apparait dans « A encaisser » avec auto_unstarted', Boolean(it && it.auto_unstarted === 1), p.status);
  const [[st]] = await pool.query(
    "SELECT COUNT(*) AS n FROM queue WHERE id = 't154a' AND status = 'done' AND NOT (auto_unstarted = 1 AND paid_at IS NULL AND prepaid_at IS NULL)");
  check('pas compte dans les statistiques tant qu\'il n\'est pas encaisse', st.n === 0);
  const files = ['queue.js', 'barbers.js', 'automation.js', 'salons.js'].map((f) => fs.readFileSync(path.join(__dirname, '../../src/routes/' + f), 'utf8'));
  check('les statistiques (dashboard, coiffeurs, salon, emails d\'avis) excluent les « a verifier »', files.every((s) => /auto_unstarted = 1 AND (q\.)?paid_at IS NULL/.test(s)));

  console.log('\n[C] « Absent » en caisse');
  const a = await call('POST', '/api/queue/t154a/unstarted-absent');
  check('Absent : 200', a.status === 200, JSON.stringify(a.data));
  check('passage marque absent (annule), sorti de la caisse', (await row('t154a')).status === 'cancelled');
  p = await call('GET', '/api/queue/pending-payment');
  check('plus dans « A encaisser »', !(p.data.items || []).some((x) => x.id === 't154a'));
  await pool.query("UPDATE queue SET status='done', auto_unstarted=0, start_at=NOW(), end_at=NOW() WHERE id='t154c'");
  check('refuse pour un passage vraiment demarre', (await call('POST', '/api/queue/t154c/unstarted-absent')).status === 409);

  const caisse = fs.readFileSync(path.join(__dirname, '../../public/caisse.html'), 'utf8');
  check('caisse : etiquette « Non démarré — à vérifier » + bouton Absent', /Non démarré — à vérifier/.test(caisse) && /unstartedAbsentBtn\(q\) \+/.test(caisse) && /\/unstarted-absent'/.test(caisse));

  await pool.query("DELETE FROM queue WHERE id LIKE 't154%'");
  console.log(`\nRESULTAT : ${pass} verifications reussies, ${fail} echec(s)`);
  await pool.end();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERREUR TEST', e); process.exit(2); });
