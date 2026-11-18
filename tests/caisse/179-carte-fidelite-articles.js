// Fidélité : UNE seule carte (la carte d'avant), modifiable dans Marketing — paliers au choix (remise % prestation,
// remise % produit, article offert) et articles qui rapportent des points (tous, ou seulement ceux cochés).
// 1 point par passage payé si un article qui compte est sur le ticket.
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

  console.log('\n[A] UNE seule carte de fidélité (la carte d\'avant), modifiable');
  let r = await api('GET', '/api/owner/loyalty-cards');
  check('une seule carte listée', r.status === 200 && r.body.items.length === 1, r.body.items && r.body.items.map((c) => c.name));
  const card = r.body.items[0];
  const saved = { name: card.name, auto_on_signup: card.auto_on_signup, scope_all: card.scope_all, items: card.items,
    tiers: card.tiers.map((t) => ({ id: t.id, points: t.points, reward: t.reward, pct: t.pct, free_item_kind: t.free_item_kind, free_item_id: t.free_item_id })) };
  r = await api('POST', '/api/owner/loyalty-cards', { name: 'T179 Autre', scope_all: true, tiers: [{ points: 5, reward: 'product_pct', pct: 10 }] });
  check('pas de 2e carte (409)', r.status === 409, r.body);
  r = await api('POST', '/api/owner/loyalty-cards/' + card.id + '/publish', { published: false });
  check('pas de dépublication (toujours active)', r.status === 400, r.body);
  r = await api('DELETE', '/api/owner/loyalty-cards/' + card.id);
  check('pas de suppression', r.status === 400, r.body);

  console.log('\n[B] Articles qui comptent : seulement la Barbe et l\'Huile à barbe');
  r = await api('PUT', '/api/owner/loyalty-cards/' + card.id, { name: card.name, auto_on_signup: true, scope_all: false, items: [], tiers: saved.tiers });
  check('articles cochés obligatoires si « seulement les articles cochés »', r.status === 400, r.body);
  r = await api('PUT', '/api/owner/loyalty-cards/' + card.id, { name: card.name, published: false, auto_on_signup: true, scope_all: false,
    items: [{ kind: 'service', id: 'sv3' }, { kind: 'product', id: 'p2' }],
    tiers: [{ id: saved.tiers[0].id, points: 2, reward: 'service_pct', pct: 50 }, { points: 3, reward: 'free_item', free_item_kind: 'product', free_item_id: 'p2' }] });
  check('enregistrée (paliers : -50 % prestation à 2 pts, Huile offerte à 3 pts)', r.status === 200, r.body);
  r = await api('GET', '/api/owner/loyalty-cards');
  check('reste active même si « published: false » est envoyé', r.body.items[0].published === true, r.body.items[0]);
  check('libellé : « <nom de l\'article> offert »', r.body.items[0].tiers.some((t) => t.reward === 'free_item' && /^Huile .* offert$/.test(t.label)), r.body.items[0].tiers);

  console.log('\n[C] Points selon les articles du ticket');
  r = await api('POST', '/api/owner/loyalty-accounts/activate', { client_name: 'Mila', client_email: EMAIL }, BARBER);
  check('activation en caisse', r.status === 200, r.body);
  await visit([L.coupe]);
  check('ticket « Coupe » (pas coché) : 0 point', pts(card.id) === 0, pts(card.id));
  await visit([L.coupe, L.barbe]);
  check('ticket « Coupe + Barbe » : +1', pts(card.id) === 1, pts(card.id));
  await visit([L.huile, L.barbe]);
  check('deux articles cochés sur le ticket : toujours 1 point par passage', pts(card.id) === 2, pts(card.id));

  console.log('\n[D] Caisse et récompense');
  sql(`INSERT INTO queue (id,salon_id,client_name,email,service_id,barber_id,status,checkin_at,end_at) VALUES ('t179qx','s1','Mila','${EMAIL}','sv1','b1','done',UTC_TIMESTAMP(),UTC_TIMESTAMP())`);
  let row = ((await api('GET', '/api/queue/pending-payment', null, BARBER)).body.items || []).find((x) => x.id === 't179qx');
  check('caisse : -50 % prestation disponible (2 pts), rien à activer', row && row.loyalty_cards.length === 1 && row.loyalty_cards[0].available.length === 1 && row.loyalty_missing.length === 0, row && [row.loyalty_cards, row.loyalty_missing]);
  sql("DELETE FROM queue WHERE id='t179qx'");
  await visit([L.barbe], { loyalty_redeem: { card_id: card.id, tier_id: saved.tiers[0].id } });
  check('remise utilisée : 2 + 1 - 2 = 1 point', pts(card.id) === 1, pts(card.id));
  await visit([L.coupe], { loyalty_redeem: 'service' });
  check('ancien format « service », palier pas atteint : rien retiré, pas de point (Coupe)', pts(card.id) === 1, pts(card.id));

  console.log('\n[E] Écrans');
  const d = fs.readFileSync(path.join(__dirname, '../../public/dashboard.html'), 'utf8');
  check('Marketing : une carte, pas de « + Nouvelle carte » ni « Publier », éditeur avec articles cochés + « tout cocher »', d.includes('id="lc-list"') && !d.includes('+ Nouvelle carte') &&
    !d.includes('Publiée (proposée aux clients)') && d.includes('Seulement les articles cochés') && d.includes('function lcToggleGroup(kind, on)'));

  // Remise en état
  await api('PUT', '/api/owner/loyalty-cards/' + card.id, saved);
  sql(`DELETE FROM loyalty_accounts WHERE client_key='${EMAIL}'`);
  sql("DELETE FROM queue WHERE id LIKE 't179q%'");
  console.log('\n' + pass + ' OK, ' + fail + ' ECHEC');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
