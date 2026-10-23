// Borne (kiosk) : proposition de produits avant la confirmation, et mise en page qui tient avec beaucoup de prestations.
// - POST /api/queue/checkin accepte products : enregistres dans queue_products (pour la caisse) et appointment_products (agenda) ;
//   un produit « caisse seulement », inactif, supprime ou d'un autre salon est ignore ; quantite bornee 1-99.
// - kiosk.html : etape « Un produit avec ça ? », barre du bas fixe (total + bouton), en-tete jamais coupe.
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const BASE = 'http://127.0.0.1:3999';
const sql = (q) => execSync(`mariadb -uroot salonq -N -e "${q.replace(/"/g, '\\"')}"`).toString().trim();
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n + (x ? '  [' + (typeof x === 'string' ? x : JSON.stringify(x)).slice(0, 160) + ']' : '')); };
const PUB = { 'Content-Type': 'application/json', 'X-Salon-Slug': 'test' };

(async () => {
  sql(`DELETE FROM products WHERE id IN ('t110a','t110b','t110c','t110d','t110e');
       INSERT IGNORE INTO salons (id, owner_id, name, slug, is_default) VALUES ('s110','o1','Autre','autre110',0);
       INSERT INTO products (id, salon_id, name, price_cents, active, online_bookable) VALUES
         ('t110a','s1','Cire',1200,1,1),('t110b','s1','Caisse seule',900,1,0),('t110c','s1','Inactif',900,0,1),
         ('t110d','s1','Supprime',900,1,1),('t110e','s110','Autre salon',900,1,1);
       UPDATE products SET deleted_at = NOW() WHERE id = 't110d';`);

  console.log('\n[A] Check-in borne avec produits');
  const r = await fetch(BASE + '/api/queue/checkin', { method: 'POST', headers: PUB, body: JSON.stringify({
    client_name: 'Borne110', service_id: 'sv1', barber_id: 'b1', extras: [],
    products: [{ id: 't110a', quantity: 500 }, { id: 't110b' }, { id: 't110c' }, { id: 't110d' }, { id: 't110e' }, null]
  }) });
  const j = await r.json();
  check('check-in accepte', r.status === 200 && j.ok, j);
  const qid = j.entry && j.entry.id;
  const qp = sql(`SELECT CONCAT(product_id,':',quantity) FROM queue_products WHERE queue_id = '${qid}'`);
  check('queue_products : seul le produit valide, quantite bornee a 99', qp === 't110a:99', qp);
  const ap = sql(`SELECT CONCAT(ap.product_id,':',ap.quantity) FROM appointment_products ap JOIN appointments a ON a.id = ap.appointment_id WHERE a.promoted_queue_id = '${qid}'`);
  check('agenda : meme produit sur le RDV synchronise', ap === 't110a:99', ap);

  const r2 = await fetch(BASE + '/api/queue/checkin', { method: 'POST', headers: PUB, body: JSON.stringify({ client_name: 'Borne110b', service_id: 'sv1' }) });
  const j2 = await r2.json();
  check('check-in sans produit toujours possible', r2.status === 200 && j2.ok && sql(`SELECT COUNT(*) FROM queue_products WHERE queue_id = '${j2.entry.id}'`) === '0', j2);

  console.log('\n[B] Page de la borne');
  const html = fs.readFileSync(path.join(__dirname, '../../public/kiosk.html'), 'utf8');
  check('etape produits presente', /id="p-form-products"/.test(html) && /Un produit avec ça \?/.test(html) && /id="products-grid"/.test(html));
  check('produits « caisse seulement » filtres', /online_bookable !== 0/.test(html));
  check('produits envoyes a la confirmation', /products: selProducts\.map/.test(html));
  check('etapes en colonne : en-tete / liste qui defile / barre du bas', (html.match(/class="panel kflow"/g) || []).length === 3 && /\.kflow \.kbody \{[^}]*overflow-y: auto/.test(html) && /\.kflow \.kfoot \{[^}]*flex: none/.test(html));
  check('accueil centre sans couper le haut', /\.stage \{ justify-content: safe center; \}/.test(html));
  check('recherche des supplements et produits', /id="extras-q"/.test(html) && /id="products-q"/.test(html));
  check('tarif du coiffeur applique a la borne', /barberItems\(b, 'services', services\)/.test(html));
  check('bouton : Confirmer quand il n\'y a plus d\'etape (a plusieurs : « Valider pour ... »)', /'Suivant' : finalLabel\(\)/.test(html) && /: 'Confirmer'; \}/.test(html));

  sql(`DELETE FROM queue_products WHERE product_id LIKE 't110%'; DELETE FROM appointment_products WHERE product_id LIKE 't110%';
       DELETE FROM appointments WHERE client_name IN ('Borne110','Borne110b'); DELETE FROM queue_extras WHERE queue_id IN (SELECT id FROM queue WHERE client_name IN ('Borne110','Borne110b'));
       DELETE FROM queue WHERE client_name IN ('Borne110','Borne110b'); DELETE FROM products WHERE id LIKE 't110%'; DELETE FROM salons WHERE id = 's110';`);
  console.log(`\n${pass} OK, ${fail} ECHEC`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
