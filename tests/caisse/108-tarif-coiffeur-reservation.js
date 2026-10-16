// Offre propre a chaque coiffeur, partout ou l'on reserve :
// - son tarif personnalise (prix ET duree) remplace celui du catalogue : creneaux, RDV deja pris, affichage ;
// - une prestation qu'il ne fait pas, archivee ou supprimee n'est plus reservable (en ligne, groupe, staff, deplacement) ;
// - barberItems (app.js) applique la meme regle cote ecrans.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { execSync } = require('child_process');
const BASE = 'http://127.0.0.1:3999';
const sql = (q) => execSync(`mariadb -uroot salonq -N -e "${q.replace(/"/g, '\\"')}"`).toString().trim();
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n + (x ? '  [' + (typeof x === 'string' ? x : JSON.stringify(x)).slice(0, 160) + ']' : '')); };
const ADMIN = { 'Content-Type': 'application/json', 'X-Salon-Slug': 'test', 'X-Admin-Password': 'adminpw' };
const PUB = { 'Content-Type': 'application/json', 'X-Salon-Slug': 'test' };
async function call(method, url, headers, body) {
  const r = await fetch(BASE + url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let j = null; try { j = await r.json(); } catch (e) { /* vide */ }
  return { status: r.status, body: j };
}

(async () => {
  // Jour de test : dans 9 jours, horaires 09:00-19:00 pour Alice (b1) et Bob (b2).
  const d = new Date(Date.now() + 9 * 86400000);
  const DAY = d.toISOString().slice(0, 10), WD = new Date(DAY + 'T00:00:00Z').getUTCDay();
  sql(`DELETE FROM appointments WHERE scheduled_at LIKE '${DAY}%';
       DELETE FROM barber_schedules WHERE barber_id IN ('b1','b2') AND weekday = ${WD};
       INSERT INTO barber_schedules (id, barber_id, weekday, start_time, end_time, active) VALUES (UUID(),'b1',${WD},'09:00','19:00',1),(UUID(),'b2',${WD},'09:00','19:00',1);
       DELETE FROM barber_leaves WHERE barber_id IN ('b1','b2');
       DELETE FROM salon_closures WHERE salon_id = 's1';
       DELETE FROM barber_service_prices WHERE barber_id IN ('b1','b2');
       DELETE FROM barber_service_exclusions WHERE barber_id IN ('b1','b2');
       DELETE FROM services WHERE id IN ('t108x','t108i','t108d');
       INSERT INTO services (id, salon_id, name, duration_min, price_cents, active) VALUES ('t108x','s1','Couleur',60,4000,1),('t108i','s1','Archivee',30,1000,0),('t108d','s1','Supprimee',30,1000,1);
       UPDATE services SET deleted_at = NOW() WHERE id = 't108d';
       INSERT INTO barber_service_prices (barber_id, service_id, price_cents, duration_min) VALUES ('b2','sv1',2500,40);
       INSERT INTO barber_service_exclusions (barber_id, service_id) VALUES ('b2','t108x');`);

  console.log('\n[A] Tarif personnalise de Bob : Coupe 25 EUR / 40 min (catalogue : 20 EUR / 30 min)');
  let r = await call('GET', `/api/appointments/availability?date=${DAY}&service_id=sv1&barber_id=b2`, PUB);
  check('availability Bob : duree 40 min et prix 25 EUR annonces', r.body && r.body.duration_min === 40 && r.body.price_cents === 2500, r.body);
  check('dernier creneau de Bob = 18:20 (40 min avant 19:00)', r.body.slots.slice(-1)[0].time === '18:20', r.body.slots.slice(-2));
  r = await call('GET', `/api/appointments/availability?date=${DAY}&service_id=sv1&barber_id=b1`, PUB);
  check('Alice (sans tarif perso) : 30 min / 20 EUR, dernier creneau 18:30', r.body.duration_min === 30 && r.body.price_cents === 2000 && r.body.slots.slice(-1)[0].time === '18:30', r.body.slots.slice(-1));

  r = await call('POST', '/api/appointments/admin-create', ADMIN, { client_name: 'Tarif Bob', service_id: 'sv1', extras: [], date: DAY, time: '10:00', barber_id: 'b2' });
  check('RDV Coupe chez Bob a 10:00 cree', r.status === 200, r.body);
  r = await call('GET', `/api/appointments/availability?date=${DAY}&service_id=sv1&barber_id=b2`, PUB);
  const bobTimes = r.body.slots.map((s) => s.time);
  check('son RDV bloque bien 40 min : 10:30 pris, 10:45 libre', !bobTimes.includes('10:30') && bobTimes.includes('10:45'), bobTimes.filter((t) => t >= '09:00' && t <= '11:00'));
  check('...et 09:30 aussi refuse (09:30 + 40 min deborde sur 10:00)', !bobTimes.includes('09:30') && bobTimes.includes('09:15'));
  r = await call('GET', `/api/appointments?from=${DAY}&to=${DAY}&all=1`, ADMIN);
  const it = r.body && r.body.items && r.body.items.find((a) => a.client_name === 'Tarif Bob');
  check('liste des RDV : duree 40 min (tarif de Bob)', it && it.duration_min === 40, it && it.duration_min);

  r = await call('GET', '/api/barbers', PUB);
  const bob = r.body.items.find((b) => b.id === 'b2');
  check('/api/barbers : tarif perso et prestation exclue publies', bob.service_overrides && bob.service_overrides.sv1 && bob.service_overrides.sv1.price_cents === 2500 && bob.service_overrides.sv1.duration_min === 40 && bob.disabled_service_ids.includes('t108x'), bob.service_overrides);

  console.log('\n[B] Prestation que Bob ne fait pas (Couleur)');
  r = await call('GET', `/api/appointments/availability?date=${DAY}&service_id=t108x&barber_id=b2`, PUB);
  check('availability Bob : aucun creneau, avec la raison', r.status === 200 && r.body.slots.length === 0 && /ne r.alise pas/.test(r.body.reason || ''), r.body);
  r = await call('GET', `/api/appointments/availability?date=${DAY}&service_id=t108x`, PUB);
  check('« premier disponible » : seulement des creneaux d\'Alice', r.body.slots.length > 0 && r.body.slots.every((s) => s.barber_id === 'b1'), r.body.slots.slice(0, 2));
  r = await call('POST', '/api/appointments', PUB, { client_name: 'Refus', email: 'refus@test.fr', phone: '0600000000', service_id: 't108x', barber_id: 'b2', extras: [], date: DAY, time: '15:00' });
  check('reservation en ligne chez Bob refusee (409)', r.status === 409 && /ne r.alise pas/.test(r.body.error), r.body);
  r = await call('POST', '/api/appointments/admin-create', ADMIN, { client_name: 'Refus', service_id: 't108x', extras: [], date: DAY, time: '15:00', barber_id: 'b2' });
  check('creation par le salon chez Bob refusee (409)', r.status === 409, r.body);
  r = await call('POST', '/api/appointments/admin-group', ADMIN, { client_name: 'Groupe', email: 'grp@test.fr', people: [{ name: 'Moi', service_id: 't108x', barber_id: 'b2', extras: [], date: DAY, time: '15:00' }] });
  check('reservation a plusieurs chez Bob refusee (409)', r.status === 409, r.body);
  r = await call('POST', '/api/appointments/admin-create', ADMIN, { client_name: 'Couleur Alice', service_id: 't108x', extras: [], date: DAY, time: '15:00', barber_id: 'b1' });
  check('la meme chez Alice : acceptee', r.status === 200, r.body);
  const aliceId = sql("SELECT id FROM appointments WHERE client_name = 'Couleur Alice' LIMIT 1");
  r = await call('PUT', `/api/appointments/${aliceId}/reschedule`, ADMIN, { date: DAY, time: '16:00', barber_id: 'b2' });
  check('deplacer ce RDV chez Bob : refuse (409)', r.status === 409 && /ne r.alise pas/.test(r.body.error), r.body);

  console.log('\n[C] Prestation archivee ou supprimee');
  for (const [id, label] of [['t108i', 'archivee'], ['t108d', 'supprimee']]) {
    r = await call('POST', '/api/appointments/admin-create', ADMIN, { client_name: 'X', service_id: id, extras: [], date: DAY, time: '17:00', barber_id: 'b1' });
    check('prestation ' + label + ' : creation refusee (404)', r.status === 404, r.body);
    r = await call('GET', `/api/appointments/availability?date=${DAY}&service_id=${id}&barber_id=b1`, PUB);
    check('prestation ' + label + ' : pas de creneau propose', r.status === 404, r.body);
  }

  console.log('\n[D] Ecrans : barberItems (app.js)');
  const app = fs.readFileSync(path.join(__dirname, '../../public/app.js'), 'utf8');
  const a = app.indexOf('function barberItems('), b = app.indexOf('window.barberItems = barberItems;');
  const ctx = { window: {} }; vm.createContext(ctx); vm.runInContext(app.slice(a, b + 'window.barberItems = barberItems;'.length), ctx);
  const cat = [{ id: 'sv1', name: 'Coupe', price_cents: 2000, duration_min: 30 }, { id: 't108x', name: 'Couleur', price_cents: 4000, duration_min: 60 }];
  const out = ctx.barberItems(bob, 'services', cat);
  check('Bob : Couleur retiree, Coupe a 25 EUR / 40 min', out.length === 1 && out[0].price_cents === 2500 && out[0].duration_min === 40, out);
  check('le catalogue n\'est pas modifie', cat[0].price_cents === 2000 && cat.length === 2);
  check('sans coiffeur (premier disponible) : catalogue tel quel', ctx.barberItems(null, 'services', cat).length === 2);
  const pages = ['rdv.html', 'compte.html', 'dashboard.html', 'caisse.html', 'poste.html'].map((f) => [f, fs.readFileSync(path.join(__dirname, '../../public', f), 'utf8')]);
  pages.forEach(([f, s]) => check(f + ' : utilise l\'offre du coiffeur (barberItems)', /barberItems\(/.test(s)));
  check('group-booking.js : prestations et prix par coiffeur', /barberItems\(offerBarber\(p\), 'services'/.test(fs.readFileSync(path.join(__dirname, '../../public/group-booking.js'), 'utf8')));

  sql(`DELETE FROM appointments WHERE scheduled_at LIKE '${DAY}%'; DELETE FROM barber_service_prices WHERE barber_id='b2'; DELETE FROM barber_service_exclusions WHERE barber_id='b2';
       DELETE FROM services WHERE id IN ('t108x','t108i','t108d');`);
  console.log('\nRESULTAT : ' + pass + ' verifications reussies, ' + fail + ' echec(s)');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERREUR TEST', e); process.exit(1); });
