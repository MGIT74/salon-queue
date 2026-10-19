// Reservation a plusieurs, « une personne a la fois » : apres « Qui vient ? », chaque personne refait la reservation
// normale (coiffeur > prestation > supplements > produits > date), « Valider pour X » la met dans un panier, le panier
// enchaine « Continuer pour Tom » puis « Terminer » (coordonnees une fois, un seul envoi groupe).
// - group-booking.js : onPeople (la page reprend la main apres « Qui vient ? »), cartHeld / cartPayload / cartRowsHtml ;
// - serveur : un creneau deja dans le panier n'est plus propose chez le meme coiffeur (held) ; l'envoi cree tous les RDV
//   avec supplements et produits ;
// - rdv.html (en ligne + mode salon) et compte.html branches sur ce parcours.
// Lancer : NODE_PATH=/tmp/claude-0/jd/node_modules node tests/caisse/111-groupe-une-personne-a-la-fois.js
const fs = require('fs'), path = require('path');
const { execSync } = require('child_process');
const root = path.join(__dirname, '..', '..');
const BASE = 'http://127.0.0.1:3999';
const sql = (q) => execSync(`mariadb -uroot salonq -N -e "${q.replace(/"/g, '\\"')}"`).toString().trim();
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n + (x ? '  [' + (typeof x === 'string' ? x : JSON.stringify(x)).slice(0, 160) + ']' : '')); };
const PUB = { 'Content-Type': 'application/json', 'X-Salon-Slug': 'test' };

(async () => {
  console.log('\n[A] Panier : fonctions communes');
  const GB = require(path.join(root, 'public/group-booking.js'));
  const cart = [
    { person: 0, name: 'Moi', isSelf: true, barber_id: 'b1', barber_name: 'Alice', service_id: 'sv1', service_name: 'Coupe', extras: ['e1'], extra_names: ['Soin'], products: ['p1'], product_names: ['Gel'], date: '2030-01-10', time: '10:00', dur: 40, price_cents: 3000 },
    { person: 1, name: 'Tom', isSelf: false, barber_id: 'b2', barber_name: 'Bob', service_id: 'sv1', service_name: 'Coupe', extras: [], extra_names: [], products: [], product_names: [], date: '2030-01-11', time: '11:00', dur: 30, price_cents: 2000 }
  ];
  check('cartHeld : seulement le meme jour', GB.cartHeld(cart, '2030-01-10', -1) === 'b1|2030-01-10|10:00|40');
  check('cartHeld : la personne en cours de modification ne se bloque pas elle-meme', GB.cartHeld(cart, '2030-01-10', 0) === '');
  const pl = GB.cartPayload(cart);
  check('cartPayload : « Moi » sans prenom (nom du client), produits en quantite 1', pl[0].name === '' && pl[1].name === 'Tom' && pl[0].products[0].id === 'p1' && pl[0].products[0].quantity === 1 && pl[0].extras[0] === 'e1' && pl[1].barber_id === 'b2' && pl[1].time === '11:00', pl);
  const rows = GB.cartRowsHtml(cart, (c) => (c / 100) + ' €', 'cart');
  check('cartRowsHtml : heure, nom, prestation + supplement, coiffeur, produit, prix, Modifier / retirer', /10:00/.test(rows) && /Coupe \+ Soin · Alice/.test(rows) && /Produit : Gel/.test(rows) && /30 €/.test(rows) && /cartEdit\(0\)/.test(rows) && /cartRemove\(1\)/.test(rows));

  const pills = GB.peoplePillsHtml([{ name: 'Moi' }, { name: 'momo' }, { name: 'elo' }], [{ person: 0 }], 1, 'grpRemovePerson');
  check('pastilles : faite / en cours / a faire, chacune avec sa croix « ne vient plus »', /grp-pill done/.test(pills) && /grp-pill cur/.test(pills) && /grp-pill todo/.test(pills) && /grpRemovePerson\(2\)/.test(pills) && (pills.match(/grp-pill-x/g) || []).length === 3);
  const todo = GB.peoplePillsHtml([{ name: 'Moi' }, { name: 'momo' }, { name: 'elo' }], [{ person: 0 }], -1, 'f', true);
  check('panier : seulement les personnes pas encore reservees', !/Moi/.test(todo) && /momo/.test(todo) && /elo/.test(todo));

  console.log('\n[B] « Qui vient ? » rend la main a la page (onPeople)');
  let JSDOM; try { ({ JSDOM } = require('jsdom')); } catch (e) { /* absent */ }
  if (JSDOM) {
    const dom = new JSDOM('<div id="m"></div>', { pretendToBeVisual: true });
    global.document = dom.window.document; global.window = dom.window; global.self = dom.window;
    delete require.cache[require.resolve(path.join(root, 'public/group-booking.js'))];
    const GB2 = require(path.join(root, 'public/group-booking.js'));
    let got = null, cont = 0;
    GB2.create({ mount: document.getElementById('m'), api: () => Promise.resolve({ slots: [] }), services: [], extras: [], barbers: [], eur: (c) => c,
      today: () => '2030-01-10', onSolo: () => {}, onPeople: (p) => { got = p; }, onContinue: () => { cont++; } });
    const m = document.getElementById('m'), click = (s) => m.querySelector(s).dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    click('[data-act=multi]');
    check('« Qui vient ? » vide au depart : rien de coche, « Continuer » inactif', !m.querySelector('.gb-who.on') && m.querySelector('[data-act=who-next]').disabled);
    click('[data-act=who-self]');
    const inp = m.querySelector('#gb-who-name'); inp.value = 'Tom'; inp.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    click('[data-act=who-add]'); click('[data-act=who-next]');
    await new Promise((r) => setTimeout(r, 30));
    check('apres « Continuer » : la page recoit Moi + Tom, sans passer par l\'ancien ecran « Que fait chacun ? »', got && got.length === 2 && got[0].isSelf && got[1].name === 'Tom' && cont === 0 && !/Que fait/.test(m.textContent), got);
  }

  console.log('\n[C] Serveur : creneau du panier retenu, envoi groupe');
  const d = new Date(Date.now() + 11 * 86400000), DAY = d.toISOString().slice(0, 10), WD = new Date(DAY + 'T00:00:00Z').getUTCDay();
  sql(`DELETE FROM appointments WHERE scheduled_at LIKE '${DAY}%';
       DELETE FROM barber_schedules WHERE barber_id IN ('b1','b2') AND weekday = ${WD};
       INSERT INTO barber_schedules (id, barber_id, weekday, start_time, end_time, active) VALUES (UUID(),'b1',${WD},'09:00','19:00',1),(UUID(),'b2',${WD},'09:00','19:00',1);
       DELETE FROM barber_leaves WHERE barber_id IN ('b1','b2'); DELETE FROM salon_closures WHERE salon_id = 's1';
       DELETE FROM products WHERE id = 't111p'; INSERT INTO products (id, salon_id, name, price_cents, active) VALUES ('t111p','s1','Gel111',500,1);`);
  const held = GB.cartHeld([{ barber_id: 'b1', date: DAY, time: '10:00', dur: 30 }], DAY, -1);
  let r = await (await fetch(`${BASE}/api/appointments/availability?date=${DAY}&service_id=sv1&barber_id=b1&held=${encodeURIComponent(held)}`, { headers: PUB })).json();
  const t1 = (r.slots || []).map((s) => s.time);
  check('meme coiffeur : 10:00 (et ce qui chevauche) n\'est plus propose, 10:30 l\'est', !t1.includes('10:00') && !t1.includes('10:15') && t1.includes('10:30'), t1.slice(0, 20));
  r = await (await fetch(`${BASE}/api/appointments/availability?date=${DAY}&service_id=sv1&barber_id=b2&held=${encodeURIComponent(held)}`, { headers: PUB })).json();
  check('autre coiffeur : 10:00 reste propose (venir en meme temps)', (r.slots || []).some((s) => s.time === '10:00'));
  const payload = GB.cartPayload([
    { name: 'Moi', isSelf: true, barber_id: 'b1', service_id: 'sv1', extras: [], products: ['t111p'], date: DAY, time: '10:00' },
    { name: 'Tom', isSelf: false, barber_id: 'b1', service_id: 'sv1', extras: [], products: [], date: DAY, time: '10:30' }]);
  const res = await fetch(BASE + '/api/appointments/group', { method: 'POST', headers: PUB, body: JSON.stringify({ client_name: 'Groupe111', email: 'g111@example.com', phone: '0600000000', people: payload, base_url: BASE + '/rdv.html?salon=test' }) });
  const j = await res.json();
  check('envoi du panier : 2 rendez-vous crees', res.status === 200 && j.appointments && j.appointments.length === 2, j);
  check('« Moi » au nom du client, Tom a son prenom, produit enregistre',
    sql(`SELECT GROUP_CONCAT(client_name ORDER BY scheduled_at) FROM appointments WHERE scheduled_at LIKE '${DAY}%' AND email = 'g111@example.com'`) === 'Groupe111,Tom' &&
    sql(`SELECT COUNT(*) FROM appointment_products WHERE product_id = 't111p'`) === '1');
  sql(`DELETE FROM appointment_products WHERE product_id = 't111p'; DELETE FROM appointments WHERE email = 'g111@example.com'; DELETE FROM products WHERE id = 't111p';`);

  console.log('\n[D] Pages branchees');
  const rdv = fs.readFileSync(path.join(root, 'public/rdv.html'), 'utf8'), cmp = fs.readFileSync(path.join(root, 'public/compte.html'), 'utf8');
  check('rdv.html : apres « Qui vient ? », reservation normale personne par personne', /onPeople: function \(people\) \{ cartStart\(people\); \}/.test(rdv) && /function cartBeginPerson/.test(rdv) && /show\('p-barber'\)/.test(rdv));
  check('rdv.html : « Valider pour X » met dans le panier au lieu des coordonnees', /if \(grp\) return cartAddCurrent\(\);/.test(rdv) && /'Valider pour ' \+/.test(rdv) && /id="p-cart"/.test(rdv));
  check('rdv.html : panier « Continuer pour Tom » / « Terminer » puis coordonnees une seule fois', /'Continuer pour ' \+/.test(rdv) && /'Terminer'/.test(rdv) && /show\('p-group-contact'\)/.test(rdv) && /GroupBooking\.cartPayload\(grp\.cart\)/.test(rdv));
  check('rdv.html : creneaux du panier retenus, meme jour propose par defaut, bandeau « 2 sur 3 »', /GroupBooking\.cartHeld\(grp\.cart/.test(rdv) && /grp\.date && !document\.getElementById\('rdv-date'\)\.value/.test(rdv) && /id="grp-banner"/.test(rdv) && /' sur ' \+ grp\.people\.length/.test(rdv));
  check('rdv.html : pas de carte cadeau pendant un groupe ; retour a une seule personne remet les libelles', /grp\) \? '' : giftTileHtml/.test(rdv) && /function soloMode\(\)/.test(rdv));
  check('rdv.html : creneau pris entre-temps -> on refait seulement l\'heure de cette personne', /cartRedoTime\(e\.data\.person_index\)/.test(rdv));
  check('compte.html : meme parcours (panier, retenus, envoi)', /onPeople: function \(people\) \{ bkCartStart\(people\); \}/.test(cmp) && /if \(bkGrp\) return bkCartAddCurrent\(\);/.test(cmp) && /id="p-book-cart"/.test(cmp) && /GroupBooking\.cartHeld\(bkGrp\.cart/.test(cmp) && /GroupBooking\.cartPayload\(bkGrp\.cart\)/.test(cmp));
  check('rdv.html (en ligne) : pas de pastille « Moi », on tape les prenoms', /noSelfChip: !STAFF_BRIDGE/.test(rdv));
  check('compte.html : le coiffeur est affiche sur les prochains RDV et le dernier passage', /when \+ \(a\.barber_name \? ' · avec ' \+ esc\(a\.barber_name\)/.test(cmp) && /\(v\.barber_name \? ' · avec ' \+ esc\(v\.barber_name\)/.test(cmp));
  check('enlever une personne a tout moment (bandeau et panier), rdv.html et compte.html', /function grpRemovePerson\(pi\)/.test(rdv) && /peoplePillsHtml\(grp\.people, grp\.cart, grp\.current, 'grpRemovePerson'\)/.test(rdv) && /id="cart-todo"/.test(rdv) &&
    /function bkGrpRemovePerson\(pi\)/.test(cmp) && /'bkGrpRemovePerson'/.test(cmp) && /id="bk-cart-todo"/.test(cmp));
  const css = fs.readFileSync(path.join(root, 'public/app.css'), 'utf8');
  check('style du bandeau et du panier dans app.css', /\.grp-banner \{/.test(css) && /\.cart-row \{/.test(css));

  console.log(`\n${pass} OK, ${fail} ECHEC`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
