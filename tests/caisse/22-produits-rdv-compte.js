// Derniere etape (6/6) : l'espace client (compte.html) a sa PROPRE copie du
// flux de reservation (quasi-identique a rdv.html) - meme etape "Produits"
// entre Supplements et Creneau. Charge la VRAIE page contre le vrai
// serveur ; l'authentification client se fait par jeton (client_token),
// cree ici directement en base pour eviter le detour par un email de
// verification.
const { JSDOM } = require('jsdom');
const { execSync } = require('child_process');
const crypto = require('crypto');
const BASE = 'http://127.0.0.1:3999';
const sql = (q) => execSync(`mariadb -uroot salonq -e "${q.replace(/"/g,'\\"')}"`, { stdio: 'pipe' });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n + (x ? '  [' + x + ']' : '')); };

(async () => {
  sql("UPDATE barbers SET accepts_appointments=1 WHERE id='b1'");
  sql("DELETE FROM barber_schedules WHERE barber_id='b1'");
  for (let w = 0; w <= 6; w++) {
    sql(`INSERT INTO barber_schedules (id, barber_id, weekday, start_time, end_time, active) VALUES (UUID(), 'b1', ${w}, '00:00:00', '23:59:00', 1)`);
  }
  sql("DELETE FROM queue WHERE client_name = 'Test Compte Produits'");
  sql("DELETE FROM appointments WHERE client_name = 'Test Compte Produits'");
  sql("DELETE FROM client_sessions WHERE client_id IN (SELECT id FROM clients WHERE email='testcompteproduits@example.com')");
  sql("DELETE FROM clients WHERE email='testcompteproduits@example.com'");

  // Compte client cree directement en base (email deja verifie, mot de
  // passe hache exactement comme le fait le serveur) - evite le detour
  // par un vrai envoi d'email de verification pour ce test.
  const clientId = crypto.randomUUID();
  const token = crypto.randomBytes(32).toString('hex');
  const { hashPassword } = require('../../src/lib/password');
  const passwordHash = await hashPassword('motdepasse123');
  const ownerId = execSync("mariadb -uroot -N salonq -e \"SELECT owner_id FROM salons WHERE id='s1'\"").toString().trim();
  sql(`INSERT INTO clients (id, owner_id, salon_id, name, email, phone, password_hash, email_verified) VALUES ('${clientId}', '${ownerId}', 's1', 'Test Compte Produits', 'testcompteproduits@example.com', '0600000099', '${passwordHash}', 1)`);
  sql(`INSERT INTO client_sessions (token, client_id, expires_at) VALUES ('${token}', '${clientId}', DATE_ADD(NOW(), INTERVAL 1 DAY))`);

  const dom = await JSDOM.fromURL(BASE + '/compte.html?salon=test', {
    runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true,
    beforeParse(w) {
      w.localStorage.setItem('client_token', token);
      w.fetch = (u, o) => fetch(String(u).startsWith('http') ? u : BASE + u, o);
      w.HTMLElement.prototype.scrollIntoView = () => {};
    }
  });
  const w = dom.window, d = w.document;
  await sleep(1500);

  console.log('\n[A] La nouvelle etape Produits existe entre Supplements et Creneau');
  w.goBook();
  await sleep(500);
  check('l\'etape #p-book-products existe', Boolean(d.getElementById('p-book-products')));
  check('elle propose bien "Gel"', /Gel/.test(d.getElementById('p-book-products').textContent));

  console.log('\n[B] Parcours complet jusqu\'a l\'envoi, avec un produit choisi');
  w.selBookBarber = 'b1'; w.selectBookService(d.querySelector('#bk-svc-grid .item-card[data-id="sv1"]') || { classList: { add(){}, remove(){} } }, 'sv1');
  w.goToBookProductsStep();
  check('etape Produits bien affichee', d.getElementById('p-book-products').classList.contains('on'));
  const tile = d.getElementById('bk-products-grid').querySelector('.item-card[data-id="p1"]');
  check('la tuile "Gel" existe bien', Boolean(tile));
  w.toggleBookProduct(tile, 'p1');
  check('produit bien enregistre dans selBookProducts', w.selBookProducts.indexOf('p1') !== -1);
  check('tuile bien marquee selectionnee', tile.classList.contains('sel'));

  w.goToBookDateStep();
  await sleep(300);
  var today = new Date().toISOString().slice(0, 10);
  d.getElementById('bk-date').value = today;
  w.loadBookSlots();
  await sleep(700);
  const slotBtn = d.getElementById('bk-slots-grid').querySelector('.slot-btn, button[data-time]');
  check('au moins un creneau reel propose par le serveur', Boolean(slotBtn), d.getElementById('bk-slots-grid').innerHTML.slice(0, 200));
  if (slotBtn) slotBtn.click();

  let capturedBody = null;
  const realFetch = w.fetch;
  w.fetch = function (u, o) { if (String(u).includes('/api/appointments') && o && o.method === 'POST') capturedBody = JSON.parse(o.body); return realFetch(u, o); };
  if (typeof w.submitBookAppointment === 'function') {
    w.submitBookAppointment();
    await sleep(600);
  }
  check('produit envoye au serveur', Boolean(capturedBody && capturedBody.products && capturedBody.products.length === 1 && capturedBody.products[0].id === 'p1'), JSON.stringify(capturedBody && capturedBody.products));

  console.log('\n[C] Le RDV cree est bien remonte jusqu\'a la file, avec le produit');
  const q = await (await fetch(BASE + '/api/queue', { headers: { 'X-Salon-Slug': 'test' } })).json()
    .then(r => r.queue.find(x => x.client_name === 'Test Compte Produits'));
  check('present dans la file', Boolean(q));
  check('le produit "Gel" y est bien attache', q && q.products.length === 1 && q.products[0].name === 'Gel', q && JSON.stringify(q.products));

  sql("DELETE FROM queue WHERE client_name = 'Test Compte Produits'");
  sql("DELETE FROM appointments WHERE client_name = 'Test Compte Produits'");
  sql("DELETE FROM client_sessions WHERE token='" + token + "'");
  sql("DELETE FROM clients WHERE id='" + clientId + "'");
  sql("DELETE FROM barber_schedules WHERE barber_id='b1'");
  sql("UPDATE barbers SET accepts_appointments=0 WHERE id='b1'");
  console.log(`\nRESULTAT : ${pass} verifications reussies, ${fail} echec(s)`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('ERREUR TEST', e); process.exit(2); });
