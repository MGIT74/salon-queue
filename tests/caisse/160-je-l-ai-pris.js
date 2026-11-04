// « Je l'ai pris » : un coiffeur a pris en vrai le client SANS RDV inscrit (kiosk) pour un autre coiffeur.
// Tout coiffeur peut le signaler (celui qui l'a pris, ou celui qui l'avait : « Pris par un collègue ? »).
// Le client passe chez le preneur (coupe démarrée ou déjà faite) ; l'autre coiffeur est seulement prévenu.
// Vraie base + vrai serveur (port 3999).
process.env.DB_HOST = process.env.DB_HOST || '127.0.0.1';
process.env.DB_USER = process.env.DB_USER || 'sq';
process.env.DB_PASSWORD = process.env.DB_PASSWORD || 'sqpass';
process.env.DB_NAME = process.env.DB_NAME || 'salonq';
process.env.SETTINGS_ENCRYPTION_KEY = process.env.SETTINGS_ENCRYPTION_KEY || 'testkeytestkeytestkeytestkey123456';
const path = require('path'), fs = require('fs');
const { pool } = require(path.join(__dirname, '../../src/db'));
const BASE = 'http://127.0.0.1:3999';
const H = (barber, pin) => ({ 'Content-Type': 'application/json', 'X-Salon-Slug': 'test', 'X-Barber-Id': barber, 'X-Barber-Pin': pin });
const ALICE = H('b1', '1111'), BOB = H('b2', '2222'), ZOE = H('t160z', '6060');
const call = async (method, p, body, h) => { const r = await fetch(BASE + p, { method, headers: h, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, data: await r.json().catch(() => ({})) }; };
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n + (x ? '  [' + String(x).slice(0, 220) + ']' : '')); };
const row = async (id) => (await pool.query('SELECT status, barber_id, taken_from_barber_id, taken_by_barber_id, taken_at, start_at, end_at FROM queue WHERE id = ?', [id]))[0][0];

(async () => {
  const clean = async () => {
    await pool.query("DELETE FROM queue WHERE id LIKE 't160%'");
    await pool.query("DELETE FROM activity_log WHERE action = 'client_taken' AND description LIKE '%T160%'");
    await pool.query("DELETE FROM barbers WHERE id = 't160z'");
  };
  await clean();
  // Le salon ne doit pas avoir d'autre coupe en cours chez Alice/Bob pour ce test.
  const [busyRows] = await pool.query("SELECT id FROM queue WHERE salon_id = 's1' AND status = 'in_progress' AND barber_id IN ('b1','b2')");
  if (busyRows.length) await pool.query("UPDATE queue SET status = 'done', end_at = NOW() WHERE id IN (?)", [busyRows.map((r) => r.id)]);
  await pool.query("INSERT INTO barbers (id, salon_id, name, pin_code) VALUES ('t160z','s1','Zoe','6060')");
  const ins = (id, name, barber, mins, appt) => pool.query(
    "INSERT INTO queue (id, salon_id, client_name, service_id, barber_id, status, checkin_at, is_appointment) VALUES (?,'s1',?,'sv1',?,'waiting', NOW() - INTERVAL ? MINUTE, ?)",
    [id, name, barber, mins, appt ? 1 : 0]);
  try {
    await ins('t160-karim', 'T160 Karim', 'b1', 20);
    await ins('t160-sofia', 'T160 Sofia', 'b1', 10);
    await ins('t160-yanis', 'T160 Yanis', 'b2', 8);
    await ins('t160-rdv', 'T160 Rdv', 'b1', 5, true);
    await ins('t160-libre', 'T160 Libre', null, 4);

    // --- Bob : « Je l'ai pris » sur Karim (1er chez Alice), il commence ---
    let r = await call('POST', '/api/queue/t160-karim/taken', { barber_id: 'b2', mode: 'start' }, BOB);
    check('Bob prend Karim (attendait Alice) : ok', r.status === 200 && r.data.mode === 'start', JSON.stringify(r.data));
    let k = await row('t160-karim');
    check('Karim : en cours chez Bob, pris à Alice, signalé par Bob', k.status === 'in_progress' && k.barber_id === 'b2' && k.taken_from_barber_id === 'b1' && k.taken_by_barber_id === 'b2' && k.start_at && k.taken_at, JSON.stringify(k));
    r = await call('GET', '/api/queue', null, ALICE);
    const aliceNext = (r.data.queue || []).filter((q) => q.status === 'waiting' && q.barber_id === 'b1' && !q.is_appointment).map((q) => q.client_name);
    check('chez Alice, Sofia est maintenant la première sans RDV', aliceNext[0] === 'T160 Sofia', aliceNext.join(','));
    r = await call('GET', '/api/queue/taken-notices', null, ALICE);
    const na = (r.data.items || []).find((n) => n.id === 't160-karim');
    check('Alice est prévenue : « Bob a pris Karim »', na && na.lost === true && na.to_name === 'Bob' && na.from_name === 'Alice' && na.to_id === 'b2', JSON.stringify(r.data));
    r = await call('GET', '/api/queue/taken-notices', null, BOB);
    check('Bob (qui l\'a signalé) n\'a pas de message', !(r.data.items || []).some((n) => n.id === 't160-karim'), JSON.stringify(r.data));
    const [[log]] = await pool.query("SELECT actor, description FROM activity_log WHERE action = 'client_taken' AND description LIKE '%T160 Karim%'");
    check('journal : « Bob a pris "Karim" (attendait Alice) »', log && log.actor === 'Bob' && /Bob a pris "T160 Karim" \(attendait Alice\)/.test(log.description), JSON.stringify(log));

    // --- Bob a déjà une coupe en cours : « Je commence » refusé, « déjà fait » accepté ---
    r = await call('POST', '/api/queue/t160-sofia/taken', { barber_id: 'b2', mode: 'start' }, BOB);
    check('Bob occupé : « commencer » refusé (busy)', r.status === 409 && r.data.code === 'busy', JSON.stringify(r.data));
    r = await call('POST', '/api/queue/t160-sofia/taken', { barber_id: 'b2', mode: 'done' }, BOB);
    let so = await row('t160-sofia');
    check('« Je l\'ai déjà fait » : Sofia terminée chez Bob (à encaisser)', r.status === 200 && so.status === 'done' && so.barber_id === 'b2' && so.end_at && so.taken_from_barber_id === 'b1', JSON.stringify(so));

    // --- « Pris par un collègue ? » : Bob signale que Zoe a pris SON client Yanis ---
    r = await call('POST', '/api/queue/t160-yanis/taken', { barber_id: 't160z', mode: 'start' }, BOB);
    let y = await row('t160-yanis');
    check('Bob : « Pris par un collègue » -> Yanis en cours chez Zoe', r.status === 200 && y.status === 'in_progress' && y.barber_id === 't160z' && y.taken_from_barber_id === 'b2' && y.taken_by_barber_id === 'b2', JSON.stringify(y));
    r = await call('GET', '/api/queue/taken-notices', null, ZOE);
    const nz = (r.data.items || []).find((n) => n.id === 't160-yanis');
    check('Zoe est prévenue : Yanis est passé chez elle (signalé par Bob)', nz && nz.lost === false && nz.reporter_name === 'Bob' && nz.from_name === 'Bob', JSON.stringify(r.data));

    // --- Refus ---
    await ins('t160-x', 'T160 X', 'b1', 3);
    r = await call('POST', '/api/queue/t160-x/taken', { barber_id: 't160z', mode: 'done' }, BOB);
    check('Bob ne peut pas donner le client d\'Alice à Zoe (ni à lui, ni le sien)', r.status === 403, JSON.stringify(r.data));
    r = await call('POST', '/api/queue/t160-rdv/taken', { barber_id: 'b2', mode: 'done' }, ALICE);
    const rd = await row('t160-rdv');
    check('client avec RDV : Alice signale que Bob l\'a pris -> chez Bob', r.status === 200 && rd.barber_id === 'b2' && rd.taken_from_barber_id === 'b1', JSON.stringify(r.data));
    r = await call('POST', '/api/queue/t160-libre/taken', { barber_id: 't160z', mode: 'done' }, BOB);
    const lb = await row('t160-libre');
    check('client « premier disponible » : Bob signale que Zoe l\'a pris -> chez Zoe', r.status === 200 && lb.barber_id === 't160z' && lb.taken_from_barber_id === null, JSON.stringify(r.data));
    r = await call('GET', '/api/queue/taken-notices', null, ZOE);
    const nl = (r.data.items || []).find((n) => n.id === 't160-libre');
    check('Zoe prévenue (il attendait le premier disponible)', nl && nl.lost === false && nl.from_name === null, JSON.stringify(nl));
    r = await call('POST', '/api/queue/t160-karim/taken', { barber_id: 'b1', mode: 'done' }, ALICE);
    check('client qui n\'attend plus : refusé', r.status === 409, JSON.stringify(r.data));
    r = await call('POST', '/api/queue/t160-x/taken', { barber_id: 'b1', mode: 'done' }, ALICE);
    check('« pris » par son propre coiffeur : refusé', r.status === 400, JSON.stringify(r.data));
    r = await call('POST', '/api/queue/t160-x/taken', { barber_id: 'b2', mode: 'done' }, { 'Content-Type': 'application/json', 'X-Salon-Slug': 'test' });
    check('sans connexion : refusé', r.status === 401 || r.status === 403, String(r.status));
  } finally {
    await clean();
  }

  // --- Poste et caisse ---
  const h = fs.readFileSync(path.join(__dirname, '../../public/poste.html'), 'utf8');
  const c = fs.readFileSync(path.join(__dirname, '../../public/caisse.html'), 'utf8');
  const app = fs.readFileSync(path.join(__dirname, '../../public/app.js'), 'utf8');
  check('poste : vrai bouton « Pris par un collègue » sur toute la liste', /'<div class="next-btns">' \+\n[^\n]*\n\s*\(takenColleagues\(q\)\.length \? '<button class="btn btn-soft" onclick="takenByColleague\(/.test(h));
  check('caisse : même bouton, « moi » = la bulle choisie', /\(takenColleaguesOf\(q, activeBarberId, allBarbers, queue\)\.length \? '<button class="btn btn-soft" onclick="takenByColleague\(/.test(c) && /takenColleagueDialog\(id, \{ meId: activeBarberId, barbers: allBarbers/.test(c));
  check('fenêtres communes (app.js) : « Qui a pris » puis commencer / déjà fait', app.includes('function takenColleagueDialog(') && app.includes('Qui a pris ') && app.includes('Je commence maintenant') && app.includes("'/api/queue/' + id + '/taken'"));
  check('poste : plus de bloc « Chez les autres coiffeurs » (le bouton suffit)', !h.includes('Chez les autres coiffeurs') && !h.includes('takenOthersHtml'));
  check('poste : une coupe en cours ne cache plus la liste, elle bloque seulement « Commencer »', h.includes('var locked = somethingActive || i > 0') && !h.includes('Terminez la coupe en cours pour passer à la suivante'));
  {
    // Qui est proposé dans « Qui a pris ? » : comme le kiosk (sans RDV, au travail maintenant), + ceux qui coupent.
    const src = ['isOnLeaveOn', 'takenColleaguesOf'].map((n) => app.match(new RegExp('function ' + n + '\\([\\s\\S]*?\\n}\\n'))[0]).join('\n');
    const f = new Function(src + '; return takenColleaguesOf;')();
    const B = (id, o) => Object.assign({ id, active: 1, kiosk_hidden: 0, walkin_today: false, on_break_now: false, outside_hours_now: false, on_leave_today: false }, o);
    const list = [B('me'), B('owner'), B('ok'), B('rdv', { kiosk_hidden: 1 }), B('rdvWalk', { kiosk_hidden: 1, walkin_today: true }), B('conge', { on_leave_today: true }),
      B('horsHoraires', { outside_hours_now: true }), B('pause', { on_break_now: true }), B('coupe', { kiosk_hidden: 1 }), B('off', { active: 0 })];
    const got = f({ barber_id: 'owner' }, 'me', list, [{ status: 'in_progress', barber_id: 'coupe' }]).map((b) => b.id).join(',');
    check('« Qui a pris ? » : sans les coiffeurs en mode RDV, en congé, hors horaires, en pause (comme le kiosk)', got === 'ok,rdvWalk,coupe', got);
  }
  check('poste : message « X a pris Y » + OK', h.includes("'/api/queue/taken-notices'") && h.includes(" a pris ") && h.includes('takenSeenOk('));
  check('poste : étiquette « pris à Alice » sur la coupe en cours', h.includes("'pris à ' + esc("));
  check('app.js / app.css rechargés (v=53 / v=46), queue-sim chargé', h.includes('app.js?v=64') && c.includes('app.js?v=64') && h.includes('app.css?v=58') && h.includes('queue-sim.js') && c.includes('queue-sim.js'));
  check('« Qui a pris » : attente estimée de chaque coiffeur (comme le kiosk) + fenêtre élargie', app.includes('QueueSim.simulate(') && app.includes('tk-wait') && app.includes("classList.add('tk-wide')"));
  await pool.end();
  console.log(`\n${pass} OK, ${fail} ECHEC`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
