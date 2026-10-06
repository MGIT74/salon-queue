// Un client peut choisir d'avance des produits (ex: une boisson) au moment
// de reserver un RDV. Verifie contre la vraie base : la selection remonte
// jusqu'a la file d'attente (queue_products), SANS jamais s'ajouter a la
// duree/prix de la prestation, et se retrouve automatiquement dans le
// ticket au moment d'encaisser (usePendingForTicket, cote caisse.html).
const { execSync } = require('child_process');
const BASE = 'http://127.0.0.1:3999';
const sql = (q) => execSync(`mariadb -uroot salonq -e "${q.replace(/"/g,'\\"')}"`, { stdio: 'pipe' });
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n + (x ? '  [' + x + ']' : '')); };

(async () => {
  sql("DELETE FROM queue WHERE client_name IN ('Test Produits','Test Sans Produits')");
  sql("DELETE FROM appointments WHERE client_name IN ('Test Produits','Test Sans Produits')");
  // b1 doit accepter les RDV et avoir un horaire large pour aujourd'hui -
  // prepare et nettoye ici (pas a la main en dehors du test), pour que ce
  // script reste reproductible tel quel, tout seul comme dans la batterie.
  for (const bid of ['b1', 'b2']) {
    sql(`UPDATE barbers SET accepts_appointments=1 WHERE id='${bid}'`);
    sql(`DELETE FROM barber_schedules WHERE barber_id='${bid}'`);
    for (let w = 0; w <= 6; w++) {
      sql(`INSERT INTO barber_schedules (id, barber_id, weekday, start_time, end_time, active) VALUES (UUID(), '${bid}', ${w}, '00:00:00', '23:59:00', 1)`);
    }
  }
  // "aujourd'hui" = la date de PARIS (le serveur compare a l'heure de Paris), pas celle du conteneur (UTC).
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  // Des creneaux surs quelle que soit l'heure reelle a laquelle ce test
  // tourne : bases sur MAINTENANT + un delai, jamais une heure fixe qui
  // finirait par etre dans le passe. Espaces de 40 min (le service dure
  // 30 min) pour ne jamais se chevaucher entre eux.
  function futureTime(offsetMin) {
    // Le serveur compare a l'heure de PARIS (rdvSettings.timezone), pas a
    // celle du conteneur qui execute ce test (UTC ici, 2h d'ecart en ete) -
    // sans ca, un creneau "dans le futur" ici pouvait sembler deja passe
    // la-bas. Les creneaux sont aussi cales sur une grille de 15 min
    // (rdv_slot_step_min) depuis le debut des horaires (00:00) - un
    // horaire calcule a la minute pres (ex: 14:37) ne correspondrait a
    // AUCUN creneau propose, d'ou l'arrondi ci-dessous.
    var d = new Date(Date.now() + offsetMin * 60000);
    var parts = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d);
    var hh = Number(parts.find(function (p) { return p.type === 'hour'; }).value);
    var mm = Number(parts.find(function (p) { return p.type === 'minute'; }).value);
    var totalMin = hh * 60 + mm;
    totalMin = Math.ceil(totalMin / 15) * 15;
    hh = Math.floor(totalMin / 60) % 24;
    mm = totalMin % 60;
    return String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
  }
  // UN seul creneau proche (maintenant + 15 min, sur la grille de 15 min) : A pour b1, B pour b2 au MEME
  // horaire (deux coiffeurs, donc aucun conflit), et C pour b1 juste apres A. Avant : trois creneaux espaces
  // jusqu'a +160 min, qui depassaient minuit (et la fin des horaires) passe ~21h20 - le test echouait pour une
  // raison sans rapport avec ce qu'il verifie. Trop tard pour qu'il reste de la place aujourd'hui : on le dit.
  const timeA = futureTime(15), timeB = timeA;
  const toMin = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
  const timeCmin = toMin(timeA) + 30;
  if (toMin(timeA) < toMin(futureTime(0)) || timeCmin + 30 > 23 * 60 + 59) {
    console.log('  SKIP  trop tard dans la journee (heure de Paris) : plus de creneau libre aujourd\'hui pour ce test');
    for (const bid of ['b1', 'b2']) { sql(`DELETE FROM barber_schedules WHERE barber_id='${bid}'`); sql(`UPDATE barbers SET accepts_appointments=0 WHERE id='${bid}'`); }
    process.exit(0);
  }
  const timeC = String(Math.floor(timeCmin / 60)).padStart(2, '0') + ':' + String(timeCmin % 60).padStart(2, '0');

  console.log('\n[A] Reservation publique AVEC produits pre-choisis, pour aujourd\'hui');
  let r = await (await fetch(BASE + '/api/appointments', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Salon-Slug': 'test' },
    body: JSON.stringify({
      client_name: 'Test Produits', email: 'testproduits@example.com', phone: '0600000000',
      service_id: 'sv1', barber_id: 'b1', date: today, time: timeA,
      products: [{ id: 'p1', quantity: 2 }]
    })
  })).json();
  check('rendez-vous cree', r.ok === true, JSON.stringify(r));

  const q = await (await fetch(BASE + '/api/queue', { headers: { 'X-Salon-Slug': 'test' } })).json()
    .then(d => d.queue.find(x => x.client_name === 'Test Produits'));
  check('present dans la file (promu automatiquement, RDV du jour)', Boolean(q));
  check('le produit "Gel" apparait, quantite 2', q && q.products.length === 1 && q.products[0].name === 'Gel' && q.products[0].quantity === 2, q && JSON.stringify(q.products));
  check('duree de la prestation INCHANGEE (30 min, le produit n\'allonge rien)', q && q.total_duration_min === 30, q && q.total_duration_min);
  check('prix de la prestation INCHANGE (20,00€, le produit n\'est pas ajoute ici)', q && q.total_price_cents === 2000, q && q.total_price_cents);

  console.log('\n[B] Reservation SANS aucun produit choisi : products doit etre un tableau vide, jamais une erreur');
  r = await (await fetch(BASE + '/api/appointments', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Salon-Slug': 'test' },
    body: JSON.stringify({
      client_name: 'Test Sans Produits', email: 'testsansproduits@example.com', phone: '0600000001',
      service_id: 'sv1', barber_id: 'b2', date: today, time: timeB
    })
  })).json();
  check('rendez-vous cree sans probleme', r.ok === true, JSON.stringify(r));
  const q2 = await (await fetch(BASE + '/api/queue', { headers: { 'X-Salon-Slug': 'test' } })).json()
    .then(d => d.queue.find(x => x.client_name === 'Test Sans Produits'));
  check('products est un tableau VIDE (pas null, pas d\'erreur)', q2 && Array.isArray(q2.products) && q2.products.length === 0, q2 && JSON.stringify(q2.products));

  console.log('\n[C] Un identifiant de produit invalide/inexistant est ignore silencieusement (pas de plantage)');
  r = await (await fetch(BASE + '/api/appointments', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Salon-Slug': 'test' },
    body: JSON.stringify({
      client_name: 'Test Produit Invalide', email: 'x@example.com', phone: '0600000002',
      service_id: 'sv1', barber_id: 'b1', date: today, time: timeC,
      products: [{ id: 'ce-produit-nexiste-pas', quantity: 1 }]
    })
  })).json();
  check('rendez-vous quand meme cree', r.ok === true, JSON.stringify(r));
  sql("DELETE FROM queue WHERE client_name = 'Test Produit Invalide'");
  sql("DELETE FROM appointments WHERE client_name = 'Test Produit Invalide'");

  sql("DELETE FROM queue WHERE client_name IN ('Test Produits','Test Sans Produits')");
  sql("DELETE FROM appointments WHERE client_name IN ('Test Produits','Test Sans Produits')");
  for (const bid of ['b1', 'b2']) { sql(`DELETE FROM barber_schedules WHERE barber_id='${bid}'`); sql(`UPDATE barbers SET accepts_appointments=0 WHERE id='${bid}'`); }
  console.log(`\nRESULTAT : ${pass} verifications reussies, ${fail} echec(s)`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('ERREUR TEST', e); process.exit(2); });
