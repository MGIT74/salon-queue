const { execSync } = require('child_process');
const BASE = 'http://127.0.0.1:3999';
const sql = (q) => execSync(`mariadb -uroot salonq -N -e "${q.replace(/"/g,'\\"')}"`).toString().trim();
const H = { 'Content-Type':'application/json','X-Salon-Slug':'test','X-Barber-Id':'b1','X-Barber-Pin':'1111' };
async function api(method, path, body, headers = H) {
  const r = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let j = null; try { j = await r.json(); } catch (e) {}
  return { status: r.status, body: j };
}
const it = (o={}) => Object.assign({ item_type:'service', item_id:'sv1', item_name:'Coupe', unit_price_cents:2000, quantity:1 }, o);
const uuid = () => require('crypto').randomUUID();
(async () => {
  console.log('\n=== I1  meme demande envoyee 5 fois EN MEME TEMPS (double envoi / nouvel essai)');
  const rid = uuid();
  const rs = await Promise.all(Array.from({length:5}, () => api('POST','/api/sales',{ payment_method:'cb', items:[it()], client_request_id: rid })));
  console.log('statuts :', rs.map(r=>r.status).join(','), '| tickets renvoyes :', [...new Set(rs.map(r=>r.body.sale.ticket_number))].join(','), '| marques "duplicate" :', rs.filter(r=>r.body.duplicate).length);
  console.log('ventes en base pour cette demande :', sql(`SELECT COUNT(*) FROM sales WHERE client_request_id='${rid}'`));

  console.log('\n=== I2  client en file d\'attente : encaissement puis 2e encaissement');
  sql("INSERT INTO queue (id,salon_id,client_name,email,barber_id,status,total_price_cents) VALUES ('q2','s1','Client Q2','q2@test.fr','b1','done',2000)");
  let r = await api('POST','/api/sales',{ payment_method:'especes', queue_id:'q2', items:[it()], client_request_id: uuid() });
  console.log('1er :', r.status, '| paid_at =', sql("SELECT paid_at IS NOT NULL FROM queue WHERE id='q2'"));
  r = await api('POST','/api/sales',{ payment_method:'especes', queue_id:'q2', items:[it()], client_request_id: uuid() });
  console.log('2e (autre demande) :', r.status, r.body.error);

  console.log('\n=== I3  autre coiffeur : "Ce n\'est pas votre client"');
  sql("INSERT INTO queue (id,salon_id,client_name,barber_id,status,total_price_cents) VALUES ('q3','s1','Client Q3','b2','done',2000)");
  r = await api('POST','/api/sales',{ payment_method:'especes', queue_id:'q3', items:[it()] });
  console.log(r.status, r.body.error, '| paid_at =', sql("SELECT IFNULL(paid_at,'NULL') FROM queue WHERE id='q3'"));

  console.log('\n=== I4  cadeau : vente + carte cadeau dans la meme transaction');
  r = await api('POST','/api/sales',{ payment_method:'cb', items:[it({unit_price_cents:5000})], gift:{recipient_name:'Dest',recipient_phone:'0600000000',recipient_email:'d@test.fr'}, client_request_id: uuid() });
  console.log(r.status, JSON.stringify(r.body.gift));
  console.log('cartes cadeau en base :', sql("SELECT COUNT(*) FROM gift_cards WHERE salon_id='s1'"));

  console.log('\n=== I5  stock : deux lignes du meme produit (2 + 2) alors qu\'il en reste 3');
  r = await api('POST','/api/sales',{ payment_method:'especes', items:[it({item_type:'product',item_id:'p1',item_name:'Gel',unit_price_cents:500,quantity:2}), it({item_type:'product',item_id:'p1',item_name:'Gel',unit_price_cents:500,quantity:2})] });
  console.log(r.status, r.body.error);
  r = await api('POST','/api/sales',{ payment_method:'especes', items:[it({item_type:'product',item_id:'p1',item_name:'Gel',unit_price_cents:500,quantity:3})] });
  console.log('3 unites :', r.status, '| stock restant =', sql("SELECT stock_quantity FROM products WHERE id='p1'"));
  r = await api('POST','/api/sales',{ payment_method:'especes', items:[it({item_type:'product',item_id:'p1',item_name:'Gel',unit_price_cents:500,quantity:1})] });
  console.log('1 de plus :', r.status, r.body.error);

  console.log('\n=== I6  autres validations');
  r = await api('POST','/api/sales',{ payment_method:'bitcoin', items:[it()] }); console.log('moyen invalide :', r.status);
  r = await api('POST','/api/sales',{ payment_method:'cb', items:[] }); console.log('ticket vide :', r.status);
  r = await api('POST','/api/sales',{ payment_method:'cb', items:[it({unit_price_cents:99999999999})] }); console.log('prix absurde :', r.status);
  r = await api('POST','/api/sales',{ payment_method:'cb', items:[it()] }, { 'Content-Type':'application/json','X-Salon-Slug':'test' }); console.log('sans authentification :', r.status);
  r = await api('POST','/api/sales',{ payment_method:'cb', items:[it()], barber_id:'inexistant' }, { 'Content-Type':'application/json','X-Salon-Slug':'test','X-Admin-Password':'adminpw' });
  console.log('admin + barber_id inconnu :', r.status, '| barber_id enregistre =', r.body.sale && r.body.sale.barber_id);

  console.log('\n=== I7  continuite des numeros de ticket');
  console.log(sql("SELECT COUNT(*), MIN(ticket_number), MAX(ticket_number), COUNT(DISTINCT ticket_number) FROM sales WHERE salon_id='s1'"), '(nb, min, max, distincts)');

  console.log('\n=== I8  cloture puis message de fermeture (heure de Paris attendue)');
  r = await api('POST','/api/owner/caisse/close',{ starting_cash_cents: 20000, closed_by_barber_id:'b1' });
  console.log('close :', r.status, JSON.stringify(r.body));
  r = await api('POST','/api/sales',{ payment_method:'cb', items:[it()] });
  console.log(r.status, r.body.error);
  const z = sql("SELECT total_cents, (SELECT SUM(total_price_cents) FROM sales WHERE salon_id='s1'), (SELECT SUM(i.quantity*i.unit_price_cents) FROM sale_items i JOIN sales s ON s.id=i.sale_id WHERE s.salon_id='s1') FROM cash_closings ORDER BY period_end DESC LIMIT 1").split('\t');
  console.log('Z total =', z[0], '| somme ventes =', z[1], '| somme lignes =', z[2], z[0]===z[1] && z[1]===z[2] ? '=> COHERENT' : '=> INCOHERENT');
})().catch(e => { console.error('ERREUR TEST', e); process.exit(1); });
