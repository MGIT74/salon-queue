// Fidélité, plusieurs cartes, côté CLIENT : dès que le client a une carte, toutes les cartes publiées apparaissent
// dans son compte ; il active / désactive celles qu'il veut, ou « Activer toutes mes cartes ». Une carte désactivée
// par le salon reste bloquée. Chaque carte activée gagne 1 point par passage selon SES articles.
const { execSync } = require('child_process');
const fs = require('fs'), path = require('path');
const BASE = 'http://127.0.0.1:3999';
const sql = (q) => execSync(`mariadb -uroot salonq -N -e "${q.replace(/"/g, '\\"')}"`).toString().trim();
let pass = 0, fail = 0;
const check = (n, ok, extra) => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n + (ok || extra === undefined ? '' : '  -> ' + JSON.stringify(extra))); };
const ADMIN = { 'Content-Type': 'application/json', 'X-Salon-Slug': 'test', 'X-Admin-Password': 'adminpw' };
const BARBER = { 'Content-Type': 'application/json', 'X-Salon-Slug': 'test', 'X-Barber-Id': 'b1', 'X-Barber-Pin': '1111' };
const call = async (method, p, body, headers) => {
  const r = await fetch(BASE + p, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let j = null; try { j = await r.json(); } catch (e) {}
  return { status: r.status, body: j };
};
const cli = (token) => ({ 'Content-Type': 'application/json', 'X-Salon-Slug': 'test', 'X-Client-Token': token });
const EMAIL = 'cartes180@exemple.fr';

(async () => {
  const { hashPassword } = require('../../src/lib/password');
  const hash = await hashPassword('MotDePasse1!');
  const clean = () => sql(`DELETE FROM clients WHERE id = 't180-c'; DELETE FROM loyalty_accounts WHERE client_key = '${EMAIL}'; DELETE FROM sales WHERE queue_id LIKE 't180q%'; DELETE FROM queue WHERE id LIKE 't180q%'; DELETE FROM loyalty_cards WHERE owner_id = 'o1' AND name LIKE 'T180 %'`);
  clean();
  sql(`INSERT INTO clients (id, owner_id, salon_id, name, email, phone, password_hash, email_verified) VALUES ('t180-c', 'o1', 's1', 'Eric', '${EMAIL}', '+33600000000', '${hash}', 1)`);
  let r = await call('POST', '/api/client-auth/login', { email: EMAIL, password: 'MotDePasse1!' }, { 'Content-Type': 'application/json', 'X-Salon-Slug': 'test' });
  const token = r.body && r.body.token;
  check('connexion client', !!token, r);

  // Deux cartes de plus : « Barbe » (seulement sur la prestation sv2) et « Tout » (tous les articles).
  r = await call('POST', '/api/owner/loyalty-cards', { name: 'T180 Barbe', published: true, scope_all: false, items: [{ kind: 'service', id: 'sv2' }], tiers: [{ points: 2, reward: 'service_pct', pct: 30 }] }, ADMIN);
  const barbe = r.body && (r.body.id || (r.body.card && r.body.card.id));
  r = await call('POST', '/api/owner/loyalty-cards', { name: 'T180 Tout', published: true, scope_all: true, tiers: [{ points: 3, reward: 'product_pct', pct: 10 }] }, ADMIN);
  const tout = r.body && (r.body.id || (r.body.card && r.body.card.id));
  check('deux cartes créées et publiées', !!barbe && !!tout, r.body);

  r = await call('GET', '/api/client-auth/me', null, cli(token));
  check('pas encore client fidélité : aucune carte affichée', r.status === 200 && r.body.loyalty_cards.length === 0, r.body.loyalty_cards);
  r = await call('POST', '/api/client-auth/loyalty-cards/' + tout + '/toggle', { on: true }, cli(token));
  check('pas encore client fidélité : il ne peut pas s\'activer seul (coiffeur ou création du compte)', r.status === 403, r);

  // Le coiffeur active UNE carte en caisse -> toutes les cartes publiées apparaissent dans le compte.
  r = await call('POST', '/api/owner/loyalty-accounts/activate', { client_name: 'Eric', client_email: EMAIL, card_ids: [barbe] }, BARBER);
  check('activation en caisse de la carte Barbe', r.status === 200, r);
  r = await call('GET', '/api/client-auth/me', null, cli(token));
  let cards = r.body.loyalty_cards;
  const byId = (id) => cards.find((c) => c.card_id === id);
  check('toutes les cartes publiées sont dans le compte', byId(barbe) && byId(tout) && cards.length >= 2, cards.map((c) => c.name));
  check('Barbe activée, Tout pas activée (0 point)', byId(barbe).activated === true && byId(tout).activated === false && byId(tout).points === 0, cards);

  r = await call('POST', '/api/client-auth/loyalty-cards/all/toggle', { on: true }, cli(token));
  cards = r.body.loyalty_cards;
  check('« Activer toutes mes cartes »', r.status === 200 && cards.every((c) => c.activated), cards);

  // Un passage « Coupe » (sv1) : seule la carte « tous les articles » gagne un point ; la carte Barbe non.
  const visit = async (id, svc) => {
    sql(`INSERT INTO queue (id,salon_id,client_name,email,service_id,barber_id,status,checkin_at,end_at) VALUES ('${id}','s1','Eric','${EMAIL}','${svc}','b1','done',UTC_TIMESTAMP(),UTC_TIMESTAMP())`);
    return call('POST', '/api/sales', { payment_method: 'especes', queue_id: id, items: [{ item_type: 'service', item_id: svc, item_name: 'x', unit_price_cents: 2000, quantity: 1 }] }, BARBER);
  };
  const pts = (id) => Number(sql(`SELECT points FROM loyalty_accounts WHERE client_key='${EMAIL}' AND card_id='${id}'`) || 0);
  await visit('t180q1', 'sv1');
  check('passage Coupe : +1 sur « Tout », 0 sur « Barbe » (pas dans ses articles)', pts(tout) === 1 && pts(barbe) === 0, [pts(tout), pts(barbe)]);
  await visit('t180q2', 'sv2');
  check('passage Barbe : +1 sur les deux cartes', pts(tout) === 2 && pts(barbe) === 1, [pts(tout), pts(barbe)]);

  r = await call('POST', '/api/client-auth/loyalty-cards/' + tout + '/toggle', { on: false }, cli(token));
  check('le client désactive « Tout » (points gardés)', r.status === 200 && r.body.loyalty_cards.find((c) => c.card_id === tout).activated === false && pts(tout) === 2, r.body);
  await visit('t180q3', 'sv2');
  check('carte désactivée : plus de point ; Barbe continue', pts(tout) === 2 && pts(barbe) === 2, [pts(tout), pts(barbe)]);
  r = await call('POST', '/api/client-auth/loyalty-cards/' + tout + '/toggle', { on: true }, cli(token));
  check('il la réactive, ses points sont là', r.status === 200 && r.body.loyalty_cards.find((c) => c.card_id === tout).points === 2, r.body);

  // L'admin désactive la carte Barbe : le client ne peut pas la réactiver lui-même.
  const accId = sql(`SELECT id FROM loyalty_accounts WHERE client_key='${EMAIL}' AND card_id='${barbe}'`);
  r = await call('POST', '/api/owner/loyalty-accounts/' + accId + '/deactivate', null, ADMIN);
  check('admin : désactivation de la carte Barbe', r.status === 200, r);
  r = await call('GET', '/api/client-auth/me', null, cli(token));
  check('client : carte Barbe « désactivée par le salon »', r.body.loyalty_cards.find((c) => c.card_id === barbe).locked === true, r.body.loyalty_cards);
  r = await call('POST', '/api/client-auth/loyalty-cards/' + barbe + '/toggle', { on: true }, cli(token));
  check('…et il ne peut pas la réactiver', r.status === 403, r);
  r = await call('POST', '/api/client-auth/loyalty-cards/all/toggle', { on: true }, cli(token));
  check('« Activer toutes » ne la réactive pas non plus', sql(`SELECT activated_at IS NULL FROM loyalty_accounts WHERE id='${accId}'`) === '1', r.body);
  r = await call('POST', '/api/owner/loyalty-accounts/activate', { client_name: 'Eric', client_email: EMAIL, card_ids: [barbe] }, BARBER);
  r = await call('GET', '/api/client-auth/me', null, cli(token));
  check('le coiffeur la réactive en caisse : débloquée', (() => { const b = r.body.loyalty_cards.find((c) => c.card_id === barbe); return b.activated && !b.locked; })(), r.body.loyalty_cards);

  r = await call('PUT', '/api/owner/loyalty-cards/' + tout, { name: 'T180 Tout', published: false, scope_all: true, tiers: [{ points: 3, reward: 'product_pct', pct: 10 }] }, ADMIN);
  r = await call('GET', '/api/client-auth/me', null, cli(token));
  check('carte dépubliée : plus affichée au client', !r.body.loyalty_cards.find((c) => c.card_id === tout), r.body.loyalty_cards.map((c) => c.name));

  const h = fs.readFileSync(path.join(__dirname, '../../public/compte.html'), 'utf8');
  check('compte : boutons Activer / Désactiver / Activer toutes mes cartes', h.includes('function toggleLoyaltyCard(cardId, on, btn)') && h.includes('Activer toutes mes cartes') && h.includes('Désactivée par le salon'));

  clean();
  console.log('\n' + pass + ' OK, ' + fail + ' ECHEC');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
