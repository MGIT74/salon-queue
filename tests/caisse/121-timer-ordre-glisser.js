// Timer de la caisse : changer l'ordre des clients SANS RDV en les glissant (poignee a gauche). Memes heures d'arrivee,
// nouvel ordre (file, borne, ecran TV et « arrive avant » suivent). Les RDV ne bougent pas. Un coiffeur ne deplace que
// les clients qu'il peut prendre.
const fs = require('fs'), path = require('path');
const { execSync } = require('child_process');
const BASE = 'http://127.0.0.1:3999';
const sql = (q) => execSync(`mariadb -uroot salonq -N -e "${q.replace(/"/g, '\\"')}"`).toString().trim();
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n + (x ? '  [' + (typeof x === 'string' ? x : JSON.stringify(x)).slice(0, 160) + ']' : '')); };
const ADMIN = { 'Content-Type': 'application/json', 'X-Salon-Slug': 'test', 'X-Admin-Password': 'adminpw' };
const ALICE = { 'Content-Type': 'application/json', 'X-Salon-Slug': 'test', 'X-Barber-Id': 'b1', 'X-Barber-Pin': sql(`SELECT pin_code FROM barbers WHERE id = 'b1'`) };
const call = async (m, u, h, b) => { const r = await fetch(BASE + u, { method: m, headers: h, body: b ? JSON.stringify(b) : undefined }); let j = null; try { j = await r.json(); } catch (e) {} return { status: r.status, body: j }; };
const order = () => sql(`SELECT GROUP_CONCAT(id ORDER BY checkin_at, id) FROM queue WHERE id LIKE 't121%' AND status = 'waiting'`);

(async () => {
  sql(`DELETE FROM queue WHERE id LIKE 't121%'; DELETE FROM barber_walkin_days WHERE barber_id = 'b1';
       INSERT INTO queue (id, salon_id, client_name, service_id, barber_id, status, is_appointment, checkin_at) VALUES
       ('t121a','s1','T121 A','sv1',NULL,'waiting',0, DATE_SUB(NOW(), INTERVAL 9 MINUTE)),
       ('t121b','s1','T121 B','sv1',NULL,'waiting',0, DATE_SUB(NOW(), INTERVAL 7 MINUTE)),
       ('t121c','s1','T121 C','sv1','b1','waiting',0, DATE_SUB(NOW(), INTERVAL 5 MINUTE)),
       ('t121r','s1','T121 RDV','sv1','b1','waiting',1, DATE_SUB(NOW(), INTERVAL 3 MINUTE));`);
  const before = sql(`SELECT GROUP_CONCAT(DATE_FORMAT(checkin_at, '%H:%i:%s') ORDER BY checkin_at) FROM queue WHERE id IN ('t121a','t121b','t121c')`);

  console.log('\n[A] Nouvel ordre');
  let r = await call('POST', '/api/queue/reorder', ADMIN, { ids: ['t121c', 't121a', 't121b'] });
  check('enregistre', r.status === 200, r.body);
  check('C passe devant A et B ; le RDV reste a sa place', order() === 't121c,t121a,t121b,t121r', order());
  check('memes heures d\'arrivee, redistribuees', sql(`SELECT GROUP_CONCAT(DATE_FORMAT(checkin_at, '%H:%i:%s') ORDER BY checkin_at) FROM queue WHERE id IN ('t121a','t121b','t121c')`) === before);
  const qd = await call('GET', '/api/queue', ADMIN);
  const pos = (id) => ((qd.body.queue || []).find((e) => e.id === id) || {}).position;
  check('places de la file recalculees (C avant A)', pos('t121c') < pos('t121a'), [pos('t121c'), pos('t121a')]);

  console.log('\n[B] Garde-fous');
  r = await call('POST', '/api/queue/reorder', ADMIN, { ids: ['t121r', 't121a'] });
  check('un RDV ne se deplace pas', r.status === 400, r.body);
  r = await call('POST', '/api/queue/reorder', ADMIN, { ids: ['t121a'] });
  check('au moins 2 clients', r.status === 400, r.body);
  sql(`UPDATE barbers SET kiosk_hidden = 1, accepts_appointments = 1 WHERE id = 'b1';`);
  r = await call('POST', '/api/queue/reorder', ALICE, { ids: ['t121b', 't121a'] });
  check('Alice en RDV : ne deplace pas les clients sans coiffeur', r.status === 403, r.body);
  sql(`UPDATE barbers SET kiosk_hidden = 0, accepts_appointments = 0 WHERE id = 'b1';`);
  r = await call('POST', '/api/queue/reorder', ALICE, { ids: ['t121b', 't121a'] });
  check('Alice sans RDV : peut les deplacer', r.status === 200 && order().startsWith('t121c,t121b,t121a'), order());
  r = await call('POST', '/api/queue/reorder', { 'Content-Type': 'application/json', 'X-Salon-Slug': 'test' }, { ids: ['t121a', 't121b'] });
  check('reserve a l\'equipe', r.status === 401 || r.status === 403, r.status);
  sql(`UPDATE queue SET status = 'in_progress' WHERE id = 't121c';`);
  r = await call('POST', '/api/queue/reorder', ADMIN, { ids: ['t121c', 't121a'] });
  check('un client deja en coupe ne se deplace pas', r.status === 409, r.body);

  console.log('\n[C] Ecran');
  const c = fs.readFileSync(path.join(__dirname, '../../public/caisse.html'), 'utf8');
  check('poignee seulement sur les clients sans RDV (au moins 2)', /var sortable = canSort && !q\.is_appointment;/.test(c) && /filter\(function \(q\) \{ return !q\.is_appointment; \}\)\.length >= 2/.test(c));
  check('glisser au doigt ou a la souris, avec deplacement anime', /onpointerdown="timerDragStart\(event/.test(c) && /\.next-zone-sorting \.next-item \{ transition: transform \.2s ease;/.test(c) && /touch-action: none/.test(c));
  check('pas de rafraichissement pendant le deplacement', /if \(timerDrag\) return;/.test(c));
  check('nouvel ordre envoye au serveur', /barberApi\('\/api\/queue\/reorder'/.test(c));

  sql(`DELETE FROM queue WHERE id LIKE 't121%'; UPDATE barbers SET kiosk_hidden = 1, accepts_appointments = 1 WHERE id = 'b1';`);
  console.log(`\n${pass} OK, ${fail} ECHEC`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
