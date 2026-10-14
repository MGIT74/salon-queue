// Fidelite a DEUX paliers (base et serveur reels, voir README) : un nombre de points pour la remise
// prestation, un autre pour la remise produit ; utiliser une remise retire les points de son palier.
// Base de test (README) pour l'appel direct de convertLegacyRewards.
process.env.DB_HOST = process.env.DB_HOST || '127.0.0.1'; process.env.DB_USER = process.env.DB_USER || 'sq';
process.env.DB_PASSWORD = process.env.DB_PASSWORD || 'sqpass'; process.env.DB_NAME = process.env.DB_NAME || 'salonq';
const { execSync } = require('child_process');
const fs = require('fs');
const BASE = 'http://127.0.0.1:3999';
const sql = (q) => execSync(`mariadb -uroot salonq -N -e "${q.replace(/"/g, '\\"')}"`).toString().trim();
const BARBER = { 'Content-Type': 'application/json', 'X-Salon-Slug': 'test', 'X-Barber-Id': 'b1', 'X-Barber-Pin': '1111' };
const ADMIN = { 'Content-Type': 'application/json', 'X-Salon-Slug': 'test', 'X-Admin-Password': 'adminpw' };
async function api(method, path, body, headers) {
  const r = await fetch(BASE + path, { method, headers: headers || BARBER, body: body ? JSON.stringify(body) : undefined });
  let j = null; try { j = await r.json(); } catch (e) {}
  return { status: r.status, body: j };
}
let pass = 0, fail = 0;
const check = (n, ok, extra) => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n + (ok || extra === undefined ? '' : '  -> ' + JSON.stringify(extra))); };
const svc = { item_type: 'service', item_id: 'sv1', item_name: 'Coupe', unit_price_cents: 2000, quantity: 1 };
const points = () => Number(sql("SELECT points FROM loyalty_accounts WHERE salon_id='s1' AND client_key='leo@x.fr'"));
let n = 0;
async function visit(extra) {
  const id = 'lv' + (++n);
  sql(`INSERT INTO queue (id,salon_id,client_name,email,service_id,barber_id,status,checkin_at,end_at) VALUES ('${id}','s1','Leo','leo@x.fr','sv1','b1','done',UTC_TIMESTAMP(),UTC_TIMESTAMP())`);
  return { id, r: await api('POST', '/api/sales', Object.assign({ payment_method: 'especes', items: [svc], queue_id: id }, extra || {})) };
}

(async () => {
  sql("DELETE FROM sales; DELETE FROM queue; DELETE FROM loyalty_accounts; DELETE FROM owner_settings WHERE owner_id='o1' AND \\`key\\` LIKE 'loyalty%'");

  console.log('\n[A] Reglages : deux paliers separes');
  let r = await api('PUT', '/api/owner/marketing-settings', { loyalty_service_threshold: 3, loyalty_product_threshold: 5, loyalty_service_discount_pct: 50, loyalty_product_discount_pct: 20 }, ADMIN);
  check('enregistrement des deux paliers', r.status === 200, r.body);
  r = await api('GET', '/api/owner/marketing-settings');
  check('relus : prestation 3, produit 5', r.body.settings.loyalty_service_threshold === 3 && r.body.settings.loyalty_product_threshold === 5, r.body);
  r = await api('PUT', '/api/owner/marketing-settings', { loyalty_product_threshold: 0 }, ADMIN);
  check('palier a 0 refuse', r.status === 400);

  console.log('\n[B] Les points s\'accumulent, chaque remise a son palier');
  sql("INSERT INTO loyalty_accounts (id,owner_id,salon_id,client_key,client_name,recipient_email,points,rewards_available,activated_at) VALUES (UUID(),'o1','s1','leo@x.fr','Leo','leo@x.fr',0,0,NOW())");
  for (let i = 0; i < 3; i++) await visit();
  check('3 passages payes = 3 points (plus de remise a zero)', points() === 3, points());
  sql("INSERT INTO queue (id,salon_id,client_name,email,service_id,barber_id,status,checkin_at,end_at) VALUES ('lvx','s1','Leo','leo@x.fr','sv1','b1','done',UTC_TIMESTAMP(),UTC_TIMESTAMP())");
  let row = ((await api('GET', '/api/queue/pending-payment')).body.items || []).find((x) => x.id === 'lvx');
  check('caisse : remise PRESTATION debloquee a 3 points, produit pas encore', row && row.loyalty_rewards && row.loyalty_rewards.service === true && row.loyalty_rewards.product === false, row && row.loyalty_rewards);
  sql("DELETE FROM queue WHERE id='lvx'");
  for (let i = 0; i < 2; i++) await visit();
  sql("INSERT INTO queue (id,salon_id,client_name,email,service_id,barber_id,status,checkin_at,end_at) VALUES ('lvy','s1','Leo','leo@x.fr','sv1','b1','done',UTC_TIMESTAMP(),UTC_TIMESTAMP())");
  row = ((await api('GET', '/api/queue/pending-payment')).body.items || []).find((x) => x.id === 'lvy');
  check('a 5 points : les deux remises disponibles', row && row.loyalty_rewards && row.loyalty_rewards.service && row.loyalty_rewards.product, row && row.loyalty_rewards);
  sql("DELETE FROM queue WHERE id='lvy'");

  console.log('\n[C] Utiliser une remise retire les points de SON palier');
  let v = await visit({ loyalty_redeem: 'product' });
  check('remise produit : 5 + 1 (passage) - 5 = 1 point', v.r.status === 200 && points() === 1, points());
  for (let i = 0; i < 2; i++) await visit();
  v = await visit({ loyalty_redeem: 'service' });
  check('remise prestation : 3 + 1 - 3 = 1 point', points() === 1, points());
  v = await visit({ loyalty_redeem: 'service' });
  check('palier pas atteint : aucune deduction (2 points)', points() === 2, points());

  console.log('\n[D] Anciennes recompenses reconverties en points');
  sql("UPDATE loyalty_accounts SET points=2, rewards_available=1 WHERE client_key='leo@x.fr'; INSERT INTO owner_settings (owner_id,\\`key\\`,value,updated_at) VALUES ('o1','loyalty_threshold','10',NOW()) ON DUPLICATE KEY UPDATE value='10'");
  const { convertLegacyRewards } = require('../../src/lib/loyaltyRules');
  try {
    await convertLegacyRewards();
    check('1 ancienne recompense (palier 10) + 2 points = 12 points', points() === 12 && sql("SELECT rewards_available FROM loyalty_accounts WHERE client_key='leo@x.fr'") === '0', points());
    await convertLegacyRewards();
    check('reconversion sans effet la deuxieme fois', points() === 12);
  } finally { require('../../src/db').pool.end(); }

  console.log('\n[E] Ecrans');
  const dash = fs.readFileSync(__dirname + '/../../public/dashboard.html', 'utf8');
  const caisse = fs.readFileSync(__dirname + '/../../public/caisse.html', 'utf8');
  check('dashboard : deux champs de points (prestation / produit)', /Points à atteindre — remise prestation/.test(dash) && /id="mk-product-threshold"/.test(dash) && /loyalty_product_threshold: productThreshold/.test(dash));
  check('caisse : chaque bouton de remise n\'apparait que si son palier est atteint, type envoye au serveur', /loyalty-btn-product'\)\.style\.display = lr\.product/.test(caisse) && /usedLoyalty = loyaltyDiscount \? loyaltyDiscount\.type : false/.test(caisse));
  check('compte client : progression des deux paliers', /function renderLoyaltyTiers/.test(fs.readFileSync(__dirname + '/../../public/compte.html', 'utf8')));

  sql("DELETE FROM loyalty_accounts; DELETE FROM owner_settings WHERE owner_id='o1' AND \\`key\\` LIKE 'loyalty%'");
  console.log('\nRESULTAT : ' + pass + ' verifications reussies, ' + fail + ' echec(s)');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
