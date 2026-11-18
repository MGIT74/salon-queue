// Fidélité à PLUSIEURS cartes (Marketing > Cartes de fidélité) :
// - la carte d'avant devient la 1re carte (paliers repris des réglages) ;
// - l'admin crée d'autres cartes : paliers (remise % prestation / produit, article offert) et articles qui
//   rapportent des points (tous, ou seulement ceux cochés) ; publier / dépublier ;
// - un client peut avoir plusieurs cartes, activées en caisse carte par carte ;
// - 1 point par passage payé, sur chaque carte dont un article coché est sur le ticket ;
// - utiliser un palier retire SES points sur SA carte.
const { execSync } = require('child_process');
const fs = require('fs'), path = require('path');
const BASE = 'http://127.0.0.1:3999';
const sql = (q) => execSync(`mariadb -uroot salonq -N -e "${q.replace(/"/g, '\\"')}"`).toString().trim();
const BARBER = { 'Content-Type': 'application/json', 'X-Salon-Slug': 'test', 'X-Barber-Id': 'b1', 'X-Barber-Pin': '1111' };
const ADMIN = { 'Content-Type': 'application/json', 'X-Salon-Slug': 'test', 'X-Admin-Password': 'adminpw' };
async function api(method, p, body, headers) {
  const r = await fetch(BASE + p, { method, headers: headers || ADMIN, body: body ? JSON.stringify(body) : undefined });
  let j = null; try { j = await r.json(); } catch (e) {}
  return { status: r.status, body: j };
}
let pass = 0, fail = 0;
const check = (n, ok, extra) => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n + (ok || extra === undefined ? '' : '  -> ' + JSON.stringify(extra))); };
const EMAIL = 'mila179@x.fr';
const pts = (cardId) => Number(sql(`SELECT COALESCE(MAX(points),-1) FROM loyalty_accounts WHERE salon_id='s1' AND client_key='${EMAIL}' AND card_id='${cardId}'`));
let n = 0;
async function visit(items, extra) {
  const id = 't179q' + (++n);
  sql(`INSERT INTO queue (id,salon_id,client_name,email,service_id,barber_id,status,checkin_at,end_at) VALUES ('${id}','s1','Mila','${EMAIL}','sv1','b1','done',UTC_TIMESTAMP(),UTC_TIMESTAMP())`);
  return api('POST', '/api/sales', Object.assign({ payment_method: 'especes', items, queue_id: id }, extra || {}), BARBER);
}
const L = {
  coupe: { item_type: 'service', item_id: 'sv1', item_name: 'Coupe', unit_price_cents: 2000, quantity: 1 },
  barbe: { item_type: 'service', item_id: 'sv3', item_name: 'Barbe', unit_price_cents: 1500, quantity: 1 },
  huile: { item_type: 'product', item_id: 'p2', item_name: 'Huile à barbe', unit_price_cents: 1200, quantity: 1 }
};

(async () => {
  sql(`DELETE FROM sales WHERE id IN (SELECT sale_id FROM (SELECT s.id AS sale_id FROM sales s JOIN queue q ON q.id = s.queue_id WHERE q.id LIKE 't179q%') t)`);
  sql("DELETE FROM queue WHERE id LIKE 't179q%'");
  sql(`DELETE FROM loyalty_accounts WHERE client_key='${EMAIL}'`);
  sql("DELETE FROM loyalty_cards WHERE owner_id='o1' AND name LIKE 'T179%'");

  console.log('\n[A] La carte d\'avant est la 1re carte');
  let r = await api('GET', '/api/owner/loyalty-cards');
  const first = (r.body.items || [])[0];
  check('1re carte publiée, « tous les articles », paliers prestation + produit repris', first && first.published && first.scope_all &&
    first.tiers.some((t) => t.reward === 'service_pct') && first.tiers.some((t) => t.reward === 'product_pct'), r.body);
  // Paliers bas pour le test (remis à la fin).
  const savedTiers = first.tiers;
  r = await api('PUT', '/api/owner/loyalty-cards/' + first.id, { name: first.name, published: true, auto_on_signup: first.auto_on_signup, scope_all: true,
    tiers: [{ id: savedTiers[0].id, points: 2, reward: 'service_pct', pct: 50 }, { id: savedTiers[1].id, points: 4, reward: 'product_pct', pct: 20 }] });
  check('paliers de la 1re carte modifiables (2 et 4 points)', r.status === 200, r.body);

  console.log('\n[B] Nouvelle carte : seulement la Barbe, palier « Barbe offerte »');
  r = await api('POST', '/api/owner/loyalty-cards', { name: 'T179 Carte Barbe', scope_all: false, items: [], tiers: [{ points: 2, reward: 'free_item', free_item_kind: 'service', free_item_id: 'sv3' }] });
  check('articles cochés obligatoires si « seulement les articles cochés »', r.status === 400, r.body);
  r = await api('POST', '/api/owner/loyalty-cards', { name: 'T179 Carte Barbe', scope_all: false, items: [{ kind: 'service', id: 'sv3' }], tiers: [{ points: 2, reward: 'service_pct', pct: 0 }] });
  check('remise de 0 % refusée', r.status === 400, r.body);
  r = await api('POST', '/api/owner/loyalty-cards', { name: 'T179 Carte Barbe', scope_all: false, items: [{ kind: 'service', id: 'sv3' }], tiers: [{ points: 2, reward: 'free_item', free_item_kind: 'service', free_item_id: 'sv3' }] });
  check('carte créée', r.status === 200 && r.body.id, r.body);
  const barbeId = r.body.id;
  r = await api('POST', '/api/owner/loyalty-cards', { name: 'T179 Brouillon', published: false, scope_all: true, tiers: [{ points: 5, reward: 'product_pct', pct: 10 }] }, BARBER);
  check('un coiffeur ne peut pas créer de carte', r.status === 401 || r.status === 403, r.status);
  r = await api('GET', '/api/owner/loyalty-cards');
  const barbe = r.body.items.find((c) => c.id === barbeId);
  check('libellé du palier : « Barbe offert »', barbe && barbe.tiers[0].label === 'Barbe offert', barbe && barbe.tiers);

  console.log('\n[C] Activation en caisse, carte par carte');
  r = await api('POST', '/api/owner/loyalty-accounts/activate', { client_name: 'Mila', client_email: EMAIL, card_ids: [first.id, barbeId] }, BARBER);
  check('deux cartes activées d\'un coup', r.status === 200 && r.body.activated.length === 2, r.body);
  r = await api('POST', '/api/owner/loyalty-accounts/activate', { client_name: 'Mila', client_email: EMAIL, card_ids: [barbeId] }, BARBER);
  check('déjà activée : 409', r.status === 409, r.body);

  console.log('\n[D] Points : seulement les cartes dont un article est sur le ticket');
  await visit([L.coupe]);
  check('ticket « Coupe » : +1 sur la 1re carte, 0 sur la Carte Barbe', pts(first.id) === 1 && pts(barbeId) === 0, [pts(first.id), pts(barbeId)]);
  await visit([L.coupe, L.barbe]);
  check('ticket « Coupe + Barbe » : +1 sur chaque carte (1 point par passage, pas par article)', pts(first.id) === 2 && pts(barbeId) === 1, [pts(first.id), pts(barbeId)]);
  await visit([L.barbe, L.barbe]);
  check('2 barbes sur un ticket : toujours 1 point par passage (et +1 sur la 1re carte, « tous les articles »)', pts(barbeId) === 2 && pts(first.id) === 3, [pts(barbeId), pts(first.id)]);

  console.log('\n[E] Caisse : paliers atteints carte par carte');
  sql(`INSERT INTO queue (id,salon_id,client_name,email,service_id,barber_id,status,checkin_at,end_at) VALUES ('t179qx','s1','Mila','${EMAIL}','sv1','b1','done',UTC_TIMESTAMP(),UTC_TIMESTAMP())`);
  let row = ((await api('GET', '/api/queue/pending-payment', null, BARBER)).body.items || []).find((x) => x.id === 't179qx');
  const lcBarbe = row && row.loyalty_cards.find((c) => c.card_id === barbeId), lcFirst = row && row.loyalty_cards.find((c) => c.card_id === first.id);
  check('Carte Barbe : « Barbe offerte » disponible (2 pts)', lcBarbe && lcBarbe.points === 2 && lcBarbe.available.length === 1, row && row.loyalty_cards);
  check('1re carte : remise prestation (2 pts) disponible, produit (4 pts) pas encore', lcFirst && lcFirst.available.length === 1 && lcFirst.available[0] === savedTiers[0].id, lcFirst);
  check('plus de carte à proposer (toutes activées)', row && row.loyalty_missing.length === 0, row && row.loyalty_missing);
  sql("DELETE FROM queue WHERE id='t179qx'");

  console.log('\n[F] Utiliser un palier retire SES points sur SA carte');
  await visit([Object.assign({}, L.barbe, { unit_price_cents: 0 })], { loyalty_redeem: { card_id: barbeId, tier_id: barbe.tiers[0].id } });
  check('Barbe offerte : 2 + 1 - 2 = 1 point sur la Carte Barbe ; 1re carte : 3 + 1 = 4, rien de retiré', pts(barbeId) === 1 && pts(first.id) === 4, [pts(barbeId), pts(first.id)]);
  await visit([L.coupe], { loyalty_redeem: 'service' });
  check('ancien format « service » (caisse pas rechargée) : 1re carte, 4 + 1 - 2 = 3', pts(first.id) === 3, pts(first.id));
  await visit([L.coupe], { loyalty_redeem: { card_id: barbeId, tier_id: barbe.tiers[0].id } });
  check('palier pas atteint (Carte Barbe à 1 point, ticket sans barbe) : rien n\'est retiré', pts(barbeId) === 1, pts(barbeId));

  console.log('\n[G] Dépublier / supprimer');
  r = await api('POST', '/api/owner/loyalty-cards/' + barbeId + '/publish', { published: false });
  await visit([L.barbe]);
  check('carte dépubliée : plus de points, mais les points restent', r.status === 200 && pts(barbeId) === 1, pts(barbeId));
  r = await api('GET', '/api/client-auth/me');
  r = await api('DELETE', '/api/owner/loyalty-cards/' + barbeId);
  check('suppression refusée tant que des clients ont la carte', r.status === 409, r.body);
  r = await api('GET', '/api/owner/loyalty-accounts');
  const accs = (r.body.items || []).filter((a) => a.client_key === EMAIL);
  check('liste « Clients fidèles » : une ligne par carte, avec son nom', accs.length === 2 && accs.some((a) => a.card_name === 'T179 Carte Barbe'), accs.map((a) => a.card_name));

  console.log('\n[H] Écrans');
  const d = fs.readFileSync(path.join(__dirname, '../../public/dashboard.html'), 'utf8');
  const c = fs.readFileSync(path.join(__dirname, '../../public/caisse.html'), 'utf8');
  const k = fs.readFileSync(path.join(__dirname, '../../public/compte.html'), 'utf8');
  check('Marketing : liste des cartes, publier / dépublier, éditeur (paliers, articles cochés, visuel)', d.includes('id="lc-list"') && d.includes('function openLoyaltyCardEditor(') &&
    d.includes('Remise % sur une prestation') && d.includes('Article offert') && d.includes('Seulement les articles cochés') && d.includes('function toggleLoyaltyCardPublished('));
  check('Marketing : « tout cocher » par groupe (prestations / suppléments / produits)', d.includes('function lcToggleGroup(kind, on)') && d.includes('class="lc-grp"') && d.includes('— tout cocher'));
  check('caisse : un bouton par palier atteint, palier envoyé au serveur, activation carte par carte', c.includes('id="loyalty-btns"') && c.includes('function loyaltyOffers()') &&
    c.includes('usedLoyalty = loyaltyDiscount ? { card_id: loyaltyDiscount.card_id, tier_id: loyaltyDiscount.tier_id } : false') && c.includes('card_ids: cardIds'));
  check('compte client : une carte par carte activée', k.includes('id="loyalty-cards-list"') && k.includes('function renderLoyaltyCards(') && k.includes('renderLoyaltyCards(lcards)'));

  // Remise en état
  await api('PUT', '/api/owner/loyalty-cards/' + first.id, { name: first.name, published: true, auto_on_signup: first.auto_on_signup, scope_all: true,
    tiers: savedTiers.map((t) => ({ id: t.id, points: t.points, reward: t.reward, pct: t.pct, free_item_kind: t.free_item_kind, free_item_id: t.free_item_id })) });
  sql(`DELETE FROM loyalty_accounts WHERE client_key='${EMAIL}'`);
  sql("DELETE FROM loyalty_cards WHERE owner_id='o1' AND name LIKE 'T179%'");
  sql("DELETE FROM queue WHERE id LIKE 't179q%'");
  console.log('\n' + pass + ' OK, ' + fail + ' ECHEC');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
