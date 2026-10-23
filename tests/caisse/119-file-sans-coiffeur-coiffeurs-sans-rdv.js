// File d'attente : un client SANS coiffeur venu sans RDV (« Premier disponible ») n'est pris QUE par un coiffeur sans RDV
// aujourd'hui (mode sans RDV, ou jour « sans RDV » de son calendrier). Un coiffeur en RDV ne le voit pas dans son Timer
// (caisse, Mon poste) et ne peut pas le demarrer, et ce client ne bloque plus ses propres clients (ordre d'arrivee).
// Un RDV promu dans la file sans coiffeur reste ouvert a tous.
const fs = require('fs'), path = require('path'), vm = require('vm');
const { execSync } = require('child_process');
const BASE = 'http://127.0.0.1:3999';
const sql = (q) => execSync(`mariadb -uroot salonq -N -e "${q.replace(/"/g, '\\"')}"`).toString().trim();
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n + (x ? '  [' + (typeof x === 'string' ? x : JSON.stringify(x)).slice(0, 160) + ']' : '')); };
const ADMIN = { 'Content-Type': 'application/json', 'X-Salon-Slug': 'test', 'X-Admin-Password': 'adminpw' };
const call = async (m, u, h, b) => { const r = await fetch(BASE + u, { method: m, headers: h, body: b ? JSON.stringify(b) : undefined }); let j = null; try { j = await r.json(); } catch (e) {} return { status: r.status, body: j }; };
const q = (id, name, barber, min, appt) => `INSERT INTO queue (id, salon_id, client_name, service_id, barber_id, status, checkin_at, is_appointment) VALUES ('${id}', 's1', '${name}', 'sv1', ${barber ? `'${barber}'` : 'NULL'}, 'waiting', DATE_SUB(NOW(), INTERVAL ${min} MINUTE), ${appt ? 1 : 0});`;

(async () => {
  const reset = () => sql(`DELETE FROM queue WHERE client_name LIKE 'T119%' OR status IN ('waiting','in_progress'); DELETE FROM barber_walkin_days WHERE barber_id IN ('b1','b2');`);
  reset();
  // Alice : sans RDV ; Bob : en RDV.
  sql(`UPDATE barbers SET kiosk_hidden = 0, accepts_appointments = 0 WHERE id = 'b1'; UPDATE barbers SET kiosk_hidden = 1, accepts_appointments = 1 WHERE id = 'b2';`);
  sql(q('t119w1', 'T119 Sans coiffeur', null, 30) + q('t119b', 'T119 Client de Bob', 'b2', 20) + q('t119w2', 'T119 Sans coiffeur 2', null, 10) + q('t119a', 'T119 RDV sans coiffeur', null, 5, true));

  console.log('\n[A] Serveur');
  let r = await call('POST', '/api/queue/t119w1/start', ADMIN, { barber_id: 'b2' });
  check('Bob (en RDV) ne peut pas prendre un client sans coiffeur venu sans RDV', r.status === 403 && /sans RDV/.test(r.body.error), r.body);
  r = await call('POST', '/api/queue/t119w2/quick-finish', ADMIN, { barber_id: 'b2' });
  check('... ni le terminer directement', r.status === 403, r.body);
  r = await call('POST', '/api/queue/t119b/start', ADMIN, { barber_id: 'b2' });
  check('Bob prend SON client, meme si des clients sans coiffeur sont arrives avant', r.status === 200, r.body);
  r = await call('POST', '/api/queue/t119w2/start', ADMIN, { barber_id: 'b1' });
  check('Alice (sans RDV) : ordre d\'arrivee respecte entre clients sans coiffeur', r.status === 409 && /T119 Sans coiffeur est/.test(r.body.error), r.body);
  r = await call('POST', '/api/queue/t119w1/start', ADMIN, { barber_id: 'b1' });
  check('Alice prend le premier client sans coiffeur', r.status === 200, r.body);
  sql(`UPDATE queue SET status = 'done' WHERE id = 't119b';`);
  r = await call('POST', '/api/queue/t119a/start', ADMIN, { barber_id: 'b2' });
  check('un RDV promu sans coiffeur reste ouvert a un coiffeur en RDV', r.status === 200, r.body);
  sql(`UPDATE queue SET status = 'done' WHERE id = 't119a'; INSERT INTO barber_walkin_days (id, barber_id, start_date, end_date) VALUES (UUID(), 'b2', DATE_SUB(CURDATE(), INTERVAL 1 DAY), DATE_ADD(CURDATE(), INTERVAL 1 DAY));`);
  r = await call('POST', '/api/queue/t119w2/start', ADMIN, { barber_id: 'b2' });
  check('jour « sans RDV » dans son calendrier : Bob peut alors le prendre', r.status === 200, r.body);

  console.log('\n[B] Ecrans (caisse, Mon poste, dashboard)');
  const rd = (f) => fs.readFileSync(path.join(__dirname, '../../public', f), 'utf8');
  const app = rd('app.js'), caisse = rd('caisse.html'), poste = rd('poste.html'), dash = rd('dashboard.html');
  const ctx = {}; vm.createContext(ctx);
  const grab = (name) => { const i = app.indexOf('function ' + name + '('); let d = 0, j = app.indexOf('{', i); for (; j < app.length; j++) { if (app[j] === '{') d++; else if (app[j] === '}' && --d === 0) break; } return app.slice(i, j + 1); };
  vm.runInContext(grab('takesWalkinsToday') + grab('canTakeQueueEntry'), ctx);
  const list = [{ id: 'A', kiosk_hidden: 0 }, { id: 'B', kiosk_hidden: 1, walkin_today: false }, { id: 'C', kiosk_hidden: 1, walkin_today: true }];
  check('sans coiffeur + sans RDV : seulement les coiffeurs sans RDV (mode ou jour)', ctx.canTakeQueueEntry({}, 'A', list) && !ctx.canTakeQueueEntry({}, 'B', list) && ctx.canTakeQueueEntry({}, 'C', list));
  check('client d\'un coiffeur : seulement lui ; RDV sans coiffeur : tout le monde', ctx.canTakeQueueEntry({ barber_id: 'B' }, 'B', list) && !ctx.canTakeQueueEntry({ barber_id: 'B' }, 'A', list) && ctx.canTakeQueueEntry({ is_appointment: 1 }, 'B', list));
  check('caisse : Timer et paiement d\'avance suivent la regle', (caisse.match(/canTakeQueueEntry\(q, activeBarberId, allBarbers\)/g) || []).length === 3 && !/!q\.barber_id \|\| q\.barber_id === activeBarberId/.test(caisse));
  check('Mon poste : Timer suit la regle', (poste.match(/canTakeQueueEntry\(q, me\.id, barbers\)/g) || []).length === 2 && !/!q\.barber_id \|\| q\.barber_id === me\.id/.test(poste));
  check('dashboard : ordre d\'arrivee + transfert limite aux coiffeurs sans RDV', /canTakeQueueEntry\(q, targetBarberId, barbers\)/.test(dash) && /free = free\.filter\(takesWalkinsToday\)/.test(dash));

  reset();
  sql(`UPDATE barbers SET kiosk_hidden = 1, accepts_appointments = 1 WHERE id IN ('b1','b2');`);
  console.log(`\n${pass} OK, ${fail} ECHEC`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
