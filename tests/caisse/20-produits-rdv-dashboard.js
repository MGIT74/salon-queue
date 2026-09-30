// Formulaire "Ajouter un RDV" du dashboard (admin) : verifie que la nouvelle
// etape "Produits" (entre Supplements et Creneau) fonctionne, et que la
// selection arrive bien dans la requete envoyee au serveur. Execute la VRAIE
// fonction openAdminAddAppointment extraite du fichier, avec les vraies
// fonctions de fenetre modale (app.js) et le vrai serveur pour les creneaux.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
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
  sql("DELETE FROM queue WHERE client_name = 'Test Dashboard Produits'");
  sql("DELETE FROM appointments WHERE client_name = 'Test Dashboard Produits'");

  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', {
    runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true, url: BASE + '/dashboard.html?salon=test'
  });
  const w = dom.window, d = w.document;
  w.fetch = (u, o) => fetch(String(u).startsWith('http') ? u : BASE + u, o);
  w.toast = (m, err) => { w.__lastToast = { m, err: !!err }; };

  // app.js fournit _buildModal/_closeModal/api/setAdminPw/esc/eur, deja
  // eprouves - on les charge reellement plutot que d'en refaire une copie.
  w.eval(fs.readFileSync(path.join(__dirname, '../../public/app.js'), 'utf8'));
  w.setAdminPw('adminpw');
  w.SALON_SLUG = 'test';
  w.formatMinutes = function (m) { return m + ' min'; };
  w.isBookableForAdmin = function () { return true; };
  w.attachClientAutocomplete = function () {};
  w.calMonthCache = {};
  w.loadCalendarPeriod = function () {};
  w.refreshQueue = function () { return Promise.resolve(); };

  const [barbersRes, servicesRes, extrasRes, productsRes] = await Promise.all([
    fetch(BASE + '/api/barbers', { headers: { 'X-Salon-Slug': 'test', 'X-Admin-Password': 'adminpw' } }).then(r => r.json()),
    fetch(BASE + '/api/catalog/services', { headers: { 'X-Salon-Slug': 'test' } }).then(r => r.json()),
    fetch(BASE + '/api/catalog/extras', { headers: { 'X-Salon-Slug': 'test' } }).then(r => r.json()),
    fetch(BASE + '/api/catalog/products', { headers: { 'X-Salon-Slug': 'test' } }).then(r => r.json())
  ]);
  w.barbers = barbersRes.items; w.services = servicesRes.items; w.extras = extrasRes.items; w.products = productsRes.items;

  const src = fs.readFileSync(path.join(__dirname, '../../public/dashboard.html'), 'utf8');
  const fnStart = src.indexOf('function openAdminAddAppointment');
  const fnEnd = src.indexOf('\nfunction ', fnStart + 10);
  w.eval(src.slice(fnStart, fnEnd));

  console.log('\n[A] La nouvelle etape Produits existe entre Supplements et Creneau');
  const today = new Date().toISOString().slice(0, 10);
  w.openAdminAddAppointment(today, 'b1');
  check('l\'etape #aa-step-products existe dans le formulaire', Boolean(d.getElementById('aa-step-products')));
  check('elle propose bien "Gel" (produit de test)', /Gel/.test(d.getElementById('aa-step-products').textContent));

  console.log('\n[B] Parcours complet : coiffeur deja preselectionne -> prestation -> supplement -> PRODUIT -> creneau -> contact -> envoi');
  d.getElementById('aa-step-service').querySelector('.aa-card[data-id="sv1"]').click();
  check('etape suivante : Supplements affichee', d.getElementById('aa-step-extras').style.display === 'block');
  w.aaGoStep('products');
  check('bouton Retour de l\'etape Produits ramene bien vers Supplements', d.getElementById('aa-step-products').querySelector('.aa-back').getAttribute('onclick') === "aaGoStep('extras')");
  d.getElementById('aa-step-products').querySelector('.aa-chip[data-id="p1"]').click();
  check('la tuile "Gel" est bien marquee selectionnee', d.getElementById('aa-step-products').querySelector('.aa-chip[data-id="p1"]').classList.contains('sel'));
  w.aaGoStep('datetime');
  check('etape suivante : Creneau affichee', d.getElementById('aa-step-datetime').style.display === 'block');

  await sleep(600); // chargement reel des creneaux disponibles cote serveur
  const slotBtn = d.getElementById('aa-slots').querySelector('.aa-slot');
  check('au moins un creneau reel propose par le serveur', Boolean(slotBtn));
  if (slotBtn) slotBtn.click();
  check('etape suivante : Contact affichee', d.getElementById('aa-step-contact').style.display === 'block');
  d.getElementById('aa-name').value = 'Test Dashboard Produits';

  let capturedBody = null;
  const realFetch = w.fetch;
  w.fetch = function (u, o) {
    if (String(u).includes('/api/appointments/admin-create')) capturedBody = JSON.parse(o.body);
    return realFetch(u, o);
  };
  d.getElementById('aa-save-btn').click();
  await sleep(400);

  check('la requete envoyee au serveur contient bien le produit choisi', Boolean(capturedBody && capturedBody.products && capturedBody.products.length === 1 && capturedBody.products[0].id === 'p1' && capturedBody.products[0].quantity === 1), JSON.stringify(capturedBody && capturedBody.products));

  console.log('\n[C] Le RDV cree est bien remonte jusqu\'a la file, avec le produit');
  const q = await fetch(BASE + '/api/queue', { headers: { 'X-Salon-Slug': 'test' } }).then(r => r.json())
    .then(d2 => d2.queue.find(x => x.client_name === 'Test Dashboard Produits'));
  check('present dans la file', Boolean(q));
  check('le produit "Gel" y est bien attache', q && q.products.length === 1 && q.products[0].name === 'Gel', q && JSON.stringify(q.products));

  sql("DELETE FROM queue WHERE client_name = 'Test Dashboard Produits'");
  sql("DELETE FROM appointments WHERE client_name = 'Test Dashboard Produits'");
  sql("DELETE FROM barber_schedules WHERE barber_id='b1'");
  sql("UPDATE barbers SET accepts_appointments=0 WHERE id='b1'");
  console.log(`\nRESULTAT : ${pass} verifications reussies, ${fail} echec(s)`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('ERREUR TEST', e); process.exit(2); });
