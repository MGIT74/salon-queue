// Meme fonctionnalite (etape "Produits" entre Supplements et Creneau), sur
// les DEUX formulaires d'ajout rapide de RDV restants : caisse.html (depuis
// l'Agenda) et poste.html (le coiffeur, toujours pour lui-meme). Charge les
// VRAIES pages contre le vrai serveur (comme les tests precedents de ce
// soir), plutot que d'extraire les fonctions isolement.
const { JSDOM } = require('jsdom');
const { execSync } = require('child_process');
const BASE = 'http://127.0.0.1:3999';
const sql = (q) => execSync(`mariadb -uroot salonq -e "${q.replace(/"/g,'\\"')}"`, { stdio: 'pipe' });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n + (x ? '  [' + x + ']' : '')); };

function setupBarberSchedule() {
  sql("UPDATE barbers SET accepts_appointments=1 WHERE id='b1'");
  sql("DELETE FROM barber_schedules WHERE barber_id='b1'");
  for (let w = 0; w <= 6; w++) {
    sql(`INSERT INTO barber_schedules (id, barber_id, weekday, start_time, end_time, active) VALUES (UUID(), 'b1', ${w}, '00:00:00', '23:59:00', 1)`);
  }
}
function teardownBarberSchedule() {
  sql("DELETE FROM barber_schedules WHERE barber_id='b1'");
  sql("UPDATE barbers SET accepts_appointments=0 WHERE id='b1'");
}

async function testCaisse() {
  console.log('\n===== caisse.html (ajout depuis l\'Agenda) =====');
  sql("DELETE FROM queue WHERE client_name = 'Test Caisse Produits'");
  sql("DELETE FROM appointments WHERE client_name = 'Test Caisse Produits'");
  const today = new Date().toISOString().slice(0, 10);

  const dom = await JSDOM.fromURL(BASE + '/caisse.html?salon=test', {
    runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true,
    beforeParse(w) {
      w.sessionStorage.setItem('caisse-session', JSON.stringify({ id: 'b1', pin: '1111', name: 'Alice' }));
      w.fetch = (u, o) => fetch(String(u).startsWith('http') ? u : BASE + u, o);
      w.HTMLElement.prototype.scrollIntoView = () => {};
    }
  });
  const w = dom.window, d = w.document;
  await sleep(1500);

  w.openCaisseAddAppointment(today, 'b1');
  check('l\'etape #pa-step-products existe', Boolean(d.getElementById('pa-step-products')));
  check('elle propose bien "Gel"', /Gel/.test(d.getElementById('pa-step-products').textContent));

  d.getElementById('pa-step-service').querySelector('.item-card[data-id="sv1"]').click();
  w.paGoStep('products');
  d.getElementById('pa-step-products').querySelector('.item-card[data-id="p1"]').click();
  check('tuile "Gel" bien selectionnee', d.getElementById('pa-step-products').querySelector('.item-card[data-id="p1"]').classList.contains('sel'));
  w.paGoStep('datetime');
  await sleep(700);
  const slotBtn = d.getElementById('pa-slots').querySelector('.aa-slot');
  check('au moins un creneau reel propose', Boolean(slotBtn));
  if (slotBtn) slotBtn.click();
  d.getElementById('pa-name').value = 'Test Caisse Produits';

  let capturedBody = null;
  const realFetch = w.fetch;
  w.fetch = function (u, o) { if (String(u).includes('/api/appointments/admin-create')) capturedBody = JSON.parse(o.body); return realFetch(u, o); };
  d.getElementById('pa-save-btn').click();
  await sleep(500);
  check('produit envoye au serveur', Boolean(capturedBody && capturedBody.products && capturedBody.products[0].id === 'p1'), JSON.stringify(capturedBody && capturedBody.products));

  const q = await (await fetch(BASE + '/api/queue', { headers: { 'X-Salon-Slug': 'test' } })).json()
    .then(r => r.queue.find(x => x.client_name === 'Test Caisse Produits'));
  check('present dans la file avec son produit', Boolean(q && q.products.length === 1 && q.products[0].name === 'Gel'), q && JSON.stringify(q.products));

  sql("DELETE FROM queue WHERE client_name = 'Test Caisse Produits'");
  sql("DELETE FROM appointments WHERE client_name = 'Test Caisse Produits'");
}

async function testPoste() {
  console.log('\n===== poste.html (le coiffeur, pour lui-meme) =====');
  sql("DELETE FROM queue WHERE client_name = 'Test Poste Produits'");
  sql("DELETE FROM appointments WHERE client_name = 'Test Poste Produits'");
  const today = new Date().toISOString().slice(0, 10);

  const dom = await JSDOM.fromURL(BASE + '/poste.html?salon=test', {
    runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true,
    beforeParse(w) {
      w.sessionStorage.setItem('poste-session', JSON.stringify({ id: 'b1', pin: '1111', name: 'Alice' }));
      w.fetch = (u, o) => fetch(String(u).startsWith('http') ? u : BASE + u, o);
      w.HTMLElement.prototype.scrollIntoView = () => {};
    }
  });
  const w = dom.window, d = w.document;
  await sleep(1500);

  if (typeof w.openPosteAddAppointment !== 'function') {
    check('openPosteAddAppointment est bien accessible (session correctement etablie)', false, 'fonction introuvable - cle de session probablement differente');
    return;
  }

  w.openPosteAddAppointment(today);
  check('l\'etape #pa-step-products existe', Boolean(d.getElementById('pa-step-products')));
  check('elle propose bien "Gel"', /Gel/.test(d.getElementById('pa-step-products').textContent));

  d.getElementById('pa-step-service').querySelector('.item-card[data-id="sv1"]').click();
  w.paGoStep('products');
  d.getElementById('pa-step-products').querySelector('.item-card[data-id="p1"]').click();
  check('tuile "Gel" bien selectionnee', d.getElementById('pa-step-products').querySelector('.item-card[data-id="p1"]').classList.contains('sel'));
  w.paGoStep('datetime');
  await sleep(700);
  const slotBtn = d.getElementById('pa-slots').querySelector('.aa-slot');
  check('au moins un creneau reel propose', Boolean(slotBtn));
  if (slotBtn) slotBtn.click();
  d.getElementById('pa-name').value = 'Test Poste Produits';

  let capturedBody = null;
  const realFetch = w.fetch;
  w.fetch = function (u, o) { if (String(u).includes('/api/appointments/admin-create')) capturedBody = JSON.parse(o.body); return realFetch(u, o); };
  d.getElementById('pa-save-btn').click();
  await sleep(500);
  check('produit envoye au serveur', Boolean(capturedBody && capturedBody.products && capturedBody.products[0].id === 'p1'), JSON.stringify(capturedBody && capturedBody.products));

  const q = await (await fetch(BASE + '/api/queue', { headers: { 'X-Salon-Slug': 'test' } })).json()
    .then(r => r.queue.find(x => x.client_name === 'Test Poste Produits'));
  check('present dans la file avec son produit', Boolean(q && q.products.length === 1 && q.products[0].name === 'Gel'), q && JSON.stringify(q.products));

  sql("DELETE FROM queue WHERE client_name = 'Test Poste Produits'");
  sql("DELETE FROM appointments WHERE client_name = 'Test Poste Produits'");
}

(async () => {
  setupBarberSchedule();
  try {
    await testCaisse();
    await testPoste();
  } finally {
    teardownBarberSchedule();
  }
  console.log(`\nRESULTAT : ${pass} verifications reussies, ${fail} echec(s)`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('ERREUR TEST', e); process.exit(2); });
