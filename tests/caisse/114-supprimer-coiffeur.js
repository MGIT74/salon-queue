// Supprimer un coiffeur sans fausser l'historique :
// - refuse tant qu'il a des RDV a venir ou des clients dans la file (liste renvoyee) ; confirmation par son nom ;
// - il disparait de toutes les listes ; ventes / stats / tickets restent rattaches a lui (« Nom (supprimé) ») ;
// - ses reglages sont retires ; son code PIN ne marche plus et ne sera JAMAIS redonne (ni un code remplace).
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
  sql(`DELETE FROM sales WHERE id = 't114s'; DELETE FROM appointments WHERE id = 't114a'; DELETE FROM queue WHERE id = 't114q';
       DELETE FROM barbers WHERE name LIKE 'T114%'; DELETE FROM barber_retired_pins WHERE salon_id = 's1';`);

  console.log('\n[A] Code PIN choisi par le serveur');
  let r = await call('POST', '/api/barbers', ADMIN, { name: 'T114 Zed', pin_code: 'auto' });
  const id = r.body.item && r.body.item.id, pin = r.body.pin;
  check('nouveau coiffeur : code PIN genere et renvoye une seule fois', r.status === 200 && /^\d{4,6}$/.test(pin || '') && !('pin_code' in r.body.item), r.body);
  sql(`INSERT INTO barber_schedules (id, barber_id, weekday, start_time, end_time, active) VALUES (UUID(), '${id}', 1, '09:00', '18:00', 1);
       INSERT INTO sales (id, salon_id, barber_id, total_price_cents, payment_method, created_at) VALUES ('t114s', 's1', '${id}', 2500, 'cash', NOW());
       INSERT INTO appointments (id, salon_id, barber_id, client_name, phone, service_id, scheduled_at, status, cancel_token) VALUES ('t114a', 's1', '${id}', 'T114 Futur', '0611', 'sv1', DATE_ADD(NOW(), INTERVAL 30 DAY), 'confirmed', 't114a');
       INSERT INTO queue (id, salon_id, client_name, service_id, barber_id, status) VALUES ('t114q', 's1', 'T114 File', 'sv1', '${id}', 'waiting');`);

  console.log('\n[B] Garde-fous');
  r = await call('POST', `/api/barbers/${id}/remove`, ADMIN, { confirm_name: 'Autre' });
  check('nom de confirmation faux : refuse', r.status === 400, r.body);
  r = await call('POST', `/api/barbers/${id}/remove`, ADMIN, { confirm_name: 't114 zed' });
  check('RDV a venir + client dans la file : refuse, avec la liste', r.status === 409 && r.body.appointments.length === 1 && r.body.queue.length === 1, r.body);
  r = await call('POST', `/api/barbers/${id}/remove`, PUB, { confirm_name: 'T114 Zed' });
  check('reserve a l\'admin', r.status === 401 || r.status === 403, r.status);
  sql(`UPDATE appointments SET status = 'cancelled' WHERE id = 't114a'; UPDATE queue SET status = 'cancelled' WHERE id = 't114q';`);

  console.log('\n[C] Suppression');
  r = await call('POST', `/api/barbers/${id}/remove`, ADMIN, { confirm_name: 'T114 Zed' });
  check('supprime', r.status === 200 && r.body.deleted, r.body);
  r = await call('GET', '/api/barbers?all=1', ADMIN);
  check('disparait de toutes les listes (meme des desactives)', !r.body.items.some((b) => b.id === id));
  check('historique garde : la vente reste a son nom « (supprimé) »', sql(`SELECT CONCAT(HEX(b.name), '|', s.total_price_cents) FROM sales s JOIN barbers b ON b.id = s.barber_id WHERE s.id = 't114s'`) === Buffer.from('T114 Zed (supprimé)').toString('hex').toUpperCase() + '|2500');
  check('reglages retires (horaires...)', sql(`SELECT COUNT(*) FROM barber_schedules WHERE barber_id = '${id}'`) === '0');
  r = await call('POST', '/api/barbers/login', PUB, { pin });
  check('son code ne permet plus de se connecter a Mon poste', r.status === 401 || r.status === 404, r.status);
  r = await call('PUT', '/api/barbers/b2', ADMIN, { pin_code: pin });
  check('son code ne peut jamais etre redonne', r.status === 409 && /déjà servi/.test(r.body.error), r.body);
  r = await call('PUT', `/api/barbers/${id}`, ADMIN, { active: true });
  check('un coiffeur supprime ne peut pas etre reactive', r.status === 410, r.status);

  console.log('\n[D] Code remplace : l\'ancien n\'est plus jamais redonne');
  const old = sql(`SELECT pin_code FROM barbers WHERE id = 'b1'`);
  r = await call('PUT', '/api/barbers/b1', ADMIN, { pin_code: 'auto' });
  check('nouveau code genere pour Alice', r.status === 200 && /^\d{4,6}$/.test(r.body.pin || '') && r.body.pin !== old, r.body);
  r = await call('PUT', '/api/barbers/b2', ADMIN, { pin_code: old });
  check('son ancien code ne peut pas etre donne a Bob', r.status === 409, r.body);
  sql(`UPDATE barbers SET pin_code = '${old}' WHERE id = 'b1'; DELETE FROM barber_retired_pins WHERE salon_id = 's1';`);

  console.log('\n[E] Ecran');
  const d = fs.readFileSync(path.join(__dirname, '../../public/dashboard.html'), 'utf8');
  check('fiche : « Supprimer ce coiffeur », confirmation par le nom, liste des RDV bloquants', /Supprimer ce coiffeur/.test(d) && /function openRemoveBarber\(id\)/.test(d) && /id="rmb-name"/.test(d) && /d\.appointments \|\| \[\]/.test(d));
  check('codes PIN generes par le serveur (ajout et changement)', /pin_code: 'auto', mode: 'online'/.test(d) && /body: \{ pin_code: 'auto' \}/.test(d) && !/Math\.floor\(1000 \+ Math\.random\(\) \* 9000\)/.test(d));

  sql(`DELETE FROM sales WHERE id = 't114s'; DELETE FROM appointments WHERE id = 't114a'; DELETE FROM queue WHERE id = 't114q'; DELETE FROM barbers WHERE id = '${id}';`);
  console.log(`\n${pass} OK, ${fail} ECHEC`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
