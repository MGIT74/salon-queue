// Crédit produits des coiffeurs (base et serveur réels, voir README) :
// - recharge à la caisse = vente normale avec une ligne « Crédit produits · Prénom » (credit_barber_id) ;
// - le coiffeur prend un produit depuis son poste (son PIN) : stock −1, crédit −prix ; bloqué à 0 € ;
// - annulable par lui pendant 10 min ; l'admin voit les soldes, règle les catégories, ajuste.
const { execSync } = require('child_process');
const fs = require('fs'), path = require('path');
const BASE = 'http://127.0.0.1:3999';
const sql = (q) => execSync(`mariadb -uroot salonq -N -e "${q.replace(/"/g, '\\"')}"`).toString().trim();
const B1 = { 'Content-Type': 'application/json', 'X-Salon-Slug': 'test', 'X-Barber-Id': 'b1', 'X-Barber-Pin': '1111' };
const ADMIN = { 'Content-Type': 'application/json', 'X-Salon-Slug': 'test', 'X-Admin-Password': 'adminpw' };
async function api(method, p, body, headers) {
  const r = await fetch(BASE + p, { method, headers: headers || B1, body: body ? JSON.stringify(body) : undefined });
  let j = null; try { j = await r.json(); } catch (e) {}
  return { status: r.status, body: j };
}
let pass = 0, fail = 0;
const check = (n, ok, extra) => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n + (ok || extra === undefined ? '' : '  -> ' + JSON.stringify(extra))); };
const stock = (id) => Number(sql(`SELECT stock_quantity FROM products WHERE id='${id}'`));

(async () => {
  sql("DELETE FROM barber_credit_moves WHERE salon_id='s1'");
  sql("DELETE FROM settings WHERE salon_id='s1' AND \\`key\\` LIKE 'barber_credit%'");
  sql("UPDATE products SET stock_enabled=1, stock_quantity=5, active=1 WHERE id='p1'");
  const price = Number(sql("SELECT price_cents FROM products WHERE id='p1'"));
  const otherB = sql("SELECT id FROM barbers WHERE salon_id='s1' AND id<>'b1' LIMIT 1");

  console.log('\n[A] Poste : rien sans crédit');
  let r = await api('GET', '/api/barber-credit/me');
  check('solde 0, produits listés (aucune catégorie choisie = tous)', r.status === 200 && r.body.balance_cents === 0 && r.body.products.some((p) => p.id === 'p1'), r.body);
  r = await api('POST', '/api/barber-credit/take', { product_id: 'p1' });
  check('crédit insuffisant : refusé, stock intact', r.status === 409 && r.body.code === 'no_credit' && stock('p1') === 5, r.body);
  r = await api('GET', '/api/barber-credit/me', null, ADMIN);
  check('admin sans code coiffeur : pas de « Mon crédit »', r.status === 403, r.status);

  console.log('\n[B] Recharge à la caisse (vente normale)');
  r = await api('POST', '/api/sales', { payment_method: 'especes', items: [{ item_type: 'product', item_name: 'Crédit produits · Karim', unit_price_cents: 2000, quantity: 1, credit_barber_id: 'b1' }] });
  check('vente de 20 € enregistrée', r.status === 200 && r.body.sale.total_price_cents === 2000, r.body);
  const saleId = r.body.sale && r.body.sale.id;
  check('mouvement +20 € lié à la vente, stock non touché', sql(`SELECT CONCAT(kind,':',amount_cents) FROM barber_credit_moves WHERE sale_id='${saleId}'`) === 'recharge:2000' && stock('p1') === 5);
  r = await api('POST', '/api/sales', { payment_method: 'especes', items: [{ item_type: 'product', item_name: 'x', unit_price_cents: 1000, credit_barber_id: 'inconnu' }] });
  check('coiffeur inconnu : vente refusée', r.status === 400, r.body);

  console.log('\n[C] Prendre un produit depuis le poste');
  r = await api('POST', '/api/barber-credit/take', { product_id: 'p1' });
  check('stock −1, crédit −prix', r.status === 200 && r.body.balance_cents === 2000 - price && stock('p1') === 4, r.body);
  const moveId = r.body.move_id;
  r = await api('GET', '/api/barber-credit/me');
  check('historique : la prise est annulable', r.body.moves[0].kind === 'take' && r.body.moves[0].can_undo === true, r.body.moves[0]);
  r = await api('POST', '/api/barber-credit/moves/' + moveId + '/undo');
  check('annulation : crédit et stock rendus', r.status === 200 && r.body.balance_cents === 2000 && stock('p1') === 5, r.body);
  r = await api('POST', '/api/barber-credit/moves/' + moveId + '/undo');
  check('pas deux fois', r.status === 404);
  sql("UPDATE products SET stock_quantity=0 WHERE id='p1'");
  r = await api('POST', '/api/barber-credit/take', { product_id: 'p1' });
  check('plus de stock : refusé', r.status === 409, r.body);
  sql("UPDATE products SET stock_quantity=5 WHERE id='p1'");
  r = await api('POST', '/api/barber-credit/take', { product_id: 'p1' }, Object.assign({}, B1, { 'X-Acting-As-Barber-Id': otherB }));
  check('toujours sur SON crédit (jamais « pour » un collègue)', r.status === 200 && sql(`SELECT COUNT(*) FROM barber_credit_moves WHERE barber_id='${otherB}'`) === '0', r.body);

  console.log('\n[D] Catégories autorisées et admin');
  r = await api('PUT', '/api/barber-credit/settings', { categories: ['cat-inexistante'], alert_cents: 300 }, ADMIN);
  check('réglages enregistrés', r.status === 200, r.body);
  r = await api('POST', '/api/barber-credit/take', { product_id: 'p1' });
  check('produit hors catégories : refusé', r.status === 404, r.body);
  r = await api('GET', '/api/barber-credit/me');
  check('…et absent de la grille', r.body.products.length === 0, r.body.products);
  await api('PUT', '/api/barber-credit/settings', { categories: [], alert_cents: 300 }, ADMIN);
  r = await api('GET', '/api/barber-credit/overview', null, ADMIN);
  const k = (r.body.items || []).find((x) => x.id === 'b1');
  check('dashboard : solde, rechargé et pris ce mois', k && k.balance_cents === 2000 - price && k.month_recharged_cents === 2000 && k.month_taken_count === 1, k);

  console.log('\n[D bis] Coiffeur « gratuit » : produits offerts, seul le stock baisse');
  r = await api('PUT', '/api/barber-credit/free/b1', { free: true });
  check('un coiffeur ne peut pas se mettre en gratuit', r.status === 401 || r.status === 403, r.status);
  r = await api('PUT', '/api/barber-credit/free/b1', { free: true }, ADMIN);
  check('admin : b1 en gratuit', r.status === 200 && r.body.free === true, r.body);
  const balBefore = 2000 - price;
  sql("UPDATE products SET stock_quantity=5 WHERE id='p1'");
  for (let i = 0; i < 3; i++) r = await api('POST', '/api/barber-credit/take', { product_id: 'p1' });
  check('3 produits pris même au-delà du crédit : stock −3, crédit inchangé', r.status === 200 && r.body.free === true && stock('p1') === 2 && r.body.balance_cents === balBefore, [r.body, stock('p1')]);
  r = await api('GET', '/api/barber-credit/me');
  check('poste : mode gratuit, mouvements « free » avec la valeur du produit', r.body.free === true && r.body.moves[0].kind === 'free' && r.body.moves[0].value_cents === price && r.body.moves[0].amount_cents === 0, r.body.moves[0]);
  r = await api('POST', '/api/barber-credit/moves/' + r.body.moves[0].id + '/undo');
  check('annulation : produit remis en stock', r.status === 200 && stock('p1') === 3, r.body);
  r = await api('GET', '/api/barber-credit/overview', null, ADMIN);
  const k2 = r.body.items.find((x) => x.id === 'b1');
  check('dashboard : gratuit, offert ce mois = 2 produits', k2.free === true && k2.month_free_cents === 2 * price && k2.month_taken_count === 3, k2);
  r = await api('GET', '/api/barber-credit/balances');
  check('caisse : b1 marqué gratuit (pas de recharge proposée)', r.body.items.find((x) => x.id === 'b1').free === true);
  await api('PUT', '/api/barber-credit/free/b1', { free: false }, ADMIN);
  r = await api('POST', '/api/barber-credit/adjust', { barber_id: 'b1', amount_cents: 500, note: 'x' }, ADMIN);
  check('plus de bouton / route « Ajuster »', r.status === 404, r.status);
  r = await api('GET', '/api/barber-credit/balances');
  check('caisse : soldes de tous les coiffeurs', r.status === 200 && r.body.items.some((x) => x.id === 'b1'), r.body);

  console.log('\n[E] Écrans');
  const poste = fs.readFileSync(path.join(__dirname, '../../public/poste.html'), 'utf8');
  const caisse = fs.readFileSync(path.join(__dirname, '../../public/caisse.html'), 'utf8');
  const dash = fs.readFileSync(path.join(__dirname, '../../public/dashboard.html'), 'utf8');
  check('poste : « Crédit » dans le menu du bas, grille, scan, « Je l\'ai pris », annuler', poste.includes('id="nav-credit"') && poste.includes('function openCreditScreen(') &&
    poste.includes('function startCreditScan(') && poste.includes("Je l'ai pris") && poste.includes('function undoCreditMove('));
  check('caisse : onglet « Crédit coiffeurs », ligne avec credit_barber_id', caisse.includes('data-cat="credit"') && caisse.includes('credit_barber_id: '));
  check('caisse : seulement le coiffeur choisi en haut (bulle), sa carte + les montants ; gratuit = rien à recharger', caisse.includes('<div id="credit-card"></div>') &&
    caisse.includes('var b = creditBalances.find(function (x) { return x.id === activeBarberId; });') && caisse.includes("if (currentCat === 'credit') renderCreditSection();") &&
    caisse.includes("(b.free || !low ? 'var(--green)' : 'var(--red)')") && caisse.includes('rien à recharger'));
  check('caisse : pas de « C\'est un cadeau » pour une recharge de crédit coiffeur', caisse.includes('!ticketQueueId && !ticket.some(function (l) { return l.credit_barber_id; })'));
  const scan = fs.readFileSync(path.join(__dirname, '../../public/scanner.js'), 'utf8');
  check('scanner caméra partagé (poste + dashboard) : BarcodeDetector sinon ZXing local', scan.includes("'BarcodeDetector' in window") && scan.includes("/vendor/zxing-0.21.3.min.js") &&
    poste.includes('<script src="/scanner.js?v=1"></script>') && dash.includes('<script src="/scanner.js?v=1"></script>') && fs.existsSync(path.join(__dirname, '../../public/vendor/zxing-0.21.3.min.js')));
  check('Produits (admin) : bouton « Scanner » (douchette ou caméra) et « Caméra » sur le code-barres ; produit inconnu = nouveau produit pré-rempli', dash.includes('onclick="openProductScan()"') &&
    dash.includes('onclick="scanBarcodeIntoField()"') && dash.includes("document.getElementById('sc-barcode').value = code;") && dash.includes("openCatalogForm('products', p.id)"));
  check('dashboard : Coiffeurs > Crédit produits (soldes, réglages, interrupteur « Gratuit », pas d\'« Ajuster »)', dash.includes('id="credit-box"') && dash.includes('function loadBarberCredit(') &&
    dash.includes('function toggleBarberCreditFree(') && !dash.includes('function adjustBarberCredit('));
  check('poste : mode gratuit (« Offerts »), caisse : pas de recharge pour un gratuit', poste.includes("free ? 'Offerts' : eur(bal)") && caisse.includes('rien à recharger'));

  sql("DELETE FROM barber_credit_moves WHERE salon_id='s1'");
  sql("DELETE FROM settings WHERE salon_id='s1' AND \\`key\\` LIKE 'barber_credit%'");
  console.log('\n' + pass + ' OK, ' + fail + ' ECHEC');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
