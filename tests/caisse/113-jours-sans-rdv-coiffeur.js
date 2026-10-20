// Jours « sans RDV » d'un coiffeur, choisis dans le calendrier de l'onglet Congés :
// - ces jours-la plus aucun creneau (en ligne, groupe, staff) et le coiffeur apparait a la borne ;
// - un jour ou il a deja des rendez-vous a venir ne peut PAS passer en « sans RDV » (renvoye dans blocked, reste en RDV) ;
// - decocher le remet en RDV ; « Répéter chaque année » pose aussi les annees suivantes.
const fs = require('fs'), path = require('path');
const { execSync } = require('child_process');
const BASE = 'http://127.0.0.1:3999';
const sql = (q) => execSync(`mariadb -uroot salonq -N -e "${q.replace(/"/g, '\\"')}"`).toString().trim();
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n + (x ? '  [' + (typeof x === 'string' ? x : JSON.stringify(x)).slice(0, 160) + ']' : '')); };
const ADMIN = { 'Content-Type': 'application/json', 'X-Salon-Slug': 'test', 'X-Admin-Password': 'adminpw' };
const PUB = { 'Content-Type': 'application/json', 'X-Salon-Slug': 'test' };
const call = async (m, u, h, b) => { const r = await fetch(BASE + u, { method: m, headers: h, body: b ? JSON.stringify(b) : undefined }); let j = null; try { j = await r.json(); } catch (e) {} return { status: r.status, body: j }; };

(async () => {
  const y = new Date().getFullYear() + 1;
  const D1 = `${y}-11-12`, D2 = `${y}-11-13`, D3 = `${y}-11-14`;
  const wd = (d) => new Date(d + 'T00:00:00Z').getUTCDay();
  sql(`DELETE FROM barber_walkin_days WHERE barber_id IN ('b1','b2'); DELETE FROM barber_leaves WHERE barber_id IN ('b1','b2');
       DELETE FROM appointments WHERE client_name LIKE 'T113%'; DELETE FROM salon_closures WHERE salon_id = 's1';
       UPDATE barbers SET accepts_appointments = 1, kiosk_hidden = 1 WHERE id IN ('b1','b2');
       DELETE FROM barber_schedules WHERE barber_id = 'b1' AND weekday IN (${wd(D1)},${wd(D2)},${wd(D3)});
       INSERT INTO barber_schedules (id, barber_id, weekday, start_time, end_time, active) VALUES
         (UUID(),'b1',${wd(D1)},'09:00','19:00',1),(UUID(),'b1',${wd(D2)},'09:00','19:00',1),(UUID(),'b1',${wd(D3)},'09:00','19:00',1);
       INSERT INTO appointments (id, salon_id, barber_id, client_name, phone, service_id, scheduled_at, status, cancel_token)
         VALUES (UUID(),'s1','b1','T113 Karim','0600000000','sv1','${D1} 10:30:00','confirmed','t113');`);

  console.log('\n[A] Passer des jours en « sans RDV »');
  let r = await call('POST', '/api/barbers/b1/walkin-days/days', ADMIN, { dates: [D1, D2, D3], on: true, repeat: false });
  check('jour avec un RDV refuse (reste en RDV), les autres passent en « sans RDV »', r.status === 200 && r.body.blocked.length === 1 && r.body.blocked[0].client_name === 'T113 Karim' &&
    r.body.items.length === 1 && r.body.items[0].start_date === D2 && r.body.items[0].end_date === D3, r.body);
  r = await call('GET', '/api/barbers/b1/walkin-days', ADMIN);
  check('relu : du 13 au 14', r.body.items.length === 1 && r.body.items[0].start_date === D2 && r.body.items[0].end_date === D3, r.body);
  r = await call('POST', '/api/barbers/b1/walkin-days/days', PUB, { dates: [D2], on: true });
  check('reserve a l\'admin', r.status === 401 || r.status === 403, r.status);

  console.log('\n[B] Plus de reservation ces jours-la');
  r = await call('GET', `/api/appointments/availability?date=${D2}&service_id=sv1&barber_id=b1`, PUB);
  check('jour « sans RDV » : aucun creneau', r.body && Array.isArray(r.body.slots) && r.body.slots.length === 0, r.body);
  r = await call('GET', `/api/appointments/availability?date=${D1}&service_id=sv1&barber_id=b1`, PUB);
  check('jour reste en RDV : creneaux proposes', r.body && r.body.slots.length > 0);
  r = await call('POST', '/api/appointments', PUB, { client_name: 'T113 X', email: 't113@example.com', phone: '0600000001', service_id: 'sv1', barber_id: 'b1', date: D2, time: '11:00', base_url: BASE + '/rdv.html' });
  check('reservation directe refusee par le serveur', r.status >= 400, r);
  r = await call('POST', '/api/appointments/group', PUB, { client_name: 'T113 G', email: 't113@example.com', phone: '0600000001', people: [{ name: '', service_id: 'sv1', barber_id: 'b1', date: D2, time: '11:00' }], base_url: BASE + '/rdv.html' });
  check('reservation a plusieurs refusee aussi', r.status >= 400, r);

  console.log('\n[C] Borne et liste des coiffeurs');
  const T = sql(`SELECT DATE_FORMAT(CONVERT_TZ(UTC_TIMESTAMP(),'+00:00','+02:00'),'%Y-%m-%d')`);
  r = await call('GET', '/api/barbers', PUB);
  const alice = r.body.items.find((b) => b.id === 'b1');
  check('liste : jours « sans RDV » a venir fournis', alice && alice.walkin_days.some((w) => w.start_date === D2 && w.end_date === D3), alice && alice.walkin_days);
  const k = fs.readFileSync(path.join(__dirname, '../../public/kiosk.html'), 'utf8');
  check('borne : un coiffeur « RDV uniquement » est propose son jour « sans RDV »', /\(!b\.kiosk_hidden \|\| b\.walkin_today\)/.test(k));

  console.log('\n[D] Remettre en RDV, repetition annuelle');
  r = await call('POST', '/api/barbers/b1/walkin-days/days', ADMIN, { dates: [D3], on: false });
  check('decocher le 14 : il redevient reservable', r.body.items.length === 1 && r.body.items[0].start_date === D2 && r.body.items[0].end_date === D2, r.body);
  r = await call('POST', '/api/barbers/b1/walkin-days/days', ADMIN, { dates: [D3], on: true, repeat: true });
  check('« Répéter chaque année » : le meme jour les annees suivantes', r.body.items.some((i) => i.start_date === `${y + 1}-11-14` && Number(i.repeat_yearly) === 1), r.body.items);

  console.log('\n[E] Ecran');
  const d = fs.readFileSync(path.join(__dirname, '../../public/dashboard.html'), 'utf8');
  check('bulle du calendrier : case « Sans RDV », couleur orange, legende', /'Sans RDV ce jour' : 'Sans RDV ces ' \+ n \+ ' jours'/.test(d) && /\.lv-day\.walk \{ background: #f97316/.test(d) && /Sans RDV \(borne seulement\)/.test(d));
  check('jours refuses : fenetre « reste en RDV » avec les rendez-vous', /function lvShowBlockedWalk\(id, items\)/.test(d) && /Déplacez ou annulez ces rendez-vous d\\'abord/.test(d));
  check('pastille « Sans RDV aujourd\'hui » sur la fiche', /Sans RDV aujourd\\'hui/.test(d));

  console.log('\n[F] Plus de type « RDV uniquement / Sans RDV uniquement »');
  check('fiche : plus d\'etiquette de type (seul « Masqué partout » reste)', !/RDV uniquement<\/span>/.test(d) && !/RDV \+ sans RDV/.test(d) && /Masqué partout/.test(d));
  check('« + Ajouter un coiffeur » : juste son nom, coiffeur avec RDV', /function openAddBarberChoice\(\) \{ addBarber\(\); \}/.test(d) && /title: 'Nouveau coiffeur', placeholder/.test(d) && /mode: 'online' \}/.test(d));
  r = await call('POST', '/api/barbers', ADMIN, { name: 'T113 Nouveau' });
  check('serveur : sans type precise, le coiffeur prend des RDV', r.status === 200 && sql(`SELECT CONCAT(accepts_appointments, kiosk_hidden) FROM barbers WHERE name = 'T113 Nouveau'`) === '11', r);
  const schema = fs.readFileSync(path.join(__dirname, '../../sql/schema.sql'), 'utf8');
  check('anciens « Sans RDV uniquement » passes en RDV (« Masqué partout » inchange)', /UPDATE barbers SET accepts_appointments = 1, kiosk_hidden = 1 WHERE accepts_appointments = 0 AND kiosk_hidden = 0;/.test(schema));
  sql(`DELETE FROM barbers WHERE name = 'T113 Nouveau';`);

  sql(`DELETE FROM barber_walkin_days WHERE barber_id IN ('b1','b2'); DELETE FROM appointments WHERE client_name LIKE 'T113%';`);
  console.log(`\n${pass} OK, ${fail} ECHEC`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
