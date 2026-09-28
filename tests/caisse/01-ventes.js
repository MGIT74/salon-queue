const { execSync } = require('child_process');
const BASE = 'http://127.0.0.1:3999';
const sql = (q) => execSync(`mariadb -uroot salonq -N -e "${q.replace(/"/g,'\\"')}"`).toString().trim();
const H = { 'Content-Type':'application/json','X-Salon-Slug':'test','X-Barber-Id':'b1','X-Barber-Pin':'1111' };
async function api(method, path, body, headers = H) {
  const r = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let j = null; try { j = await r.json(); } catch (e) {}
  return { status: r.status, body: j };
}
const line = (t) => console.log('\n=== ' + t);
const item = (over = {}) => Object.assign({ item_type:'service', item_id:'sv1', item_name:'Coupe', unit_price_cents:2000, quantity:1 }, over);

(async () => {
  // T1 vente simple
  line('T1  vente simple');
  let r = await api('POST','/api/sales',{ payment_method:'especes', items:[item()] });
  console.log(r.status, JSON.stringify(r.body));

  // T2 ventes simultanées -> numéros de ticket
  line('T2  15 ventes SIMULTANEES : numeros de ticket');
  const res = await Promise.all(Array.from({length:15}, () => api('POST','/api/sales',{ payment_method:'especes', items:[item()] })));
  const codes = res.map(x => x.status);
  console.log('statuts :', JSON.stringify(codes.reduce((a,c)=>(a[c]=(a[c]||0)+1,a),{})));
  const dup = sql("SELECT ticket_number, COUNT(*) c FROM sales WHERE salon_id='s1' GROUP BY ticket_number HAVING c>1");
  console.log('numeros en double :', dup ? dup.replace(/\n/g,' | ') : 'aucun');
  console.log('total ventes en base :', sql("SELECT COUNT(*) FROM sales WHERE salon_id='s1'"));

  // T3 client en attente + stock insuffisant
  line('T3  client en file + produit en rupture -> le client reste-t-il "encaisse" ?');
  sql("INSERT INTO queue (id,salon_id,client_name,barber_id,status,total_price_cents) VALUES ('q1','s1','Client Test','b1','done',2500)");
  r = await api('POST','/api/sales',{ payment_method:'cb', queue_id:'q1', items:[item(), item({item_type:'product',item_id:'p1',item_name:'Gel',unit_price_cents:500,quantity:99})] });
  console.log('1re tentative :', r.status, r.body && r.body.error);
  console.log('queue.paid_at apres refus :', sql("SELECT IFNULL(paid_at,'NULL') FROM queue WHERE id='q1'"));
  r = await api('POST','/api/sales',{ payment_method:'cb', queue_id:'q1', items:[item()] });
  console.log('2e tentative (sans le produit) :', r.status, r.body && r.body.error);
  console.log('ventes liees a q1 :', sql("SELECT COUNT(*) FROM sales WHERE queue_id='q1'"));

  // T4 quantités
  line('T4  quantites fractionnaires / enormes');
  r = await api('POST','/api/sales',{ payment_method:'especes', items:[item({quantity:2.5})] });
  console.log('qte 2.5 :', r.status, JSON.stringify(r.body && r.body.sale));
  console.log('  en base -> sales.total =', sql("SELECT total_price_cents FROM sales ORDER BY created_at DESC, ticket_number DESC LIMIT 1"), '| sale_items.quantity =', sql("SELECT quantity FROM sale_items ORDER BY id DESC LIMIT 1"));
  r = await api('POST','/api/sales',{ payment_method:'especes', items:[item({quantity:1e9})] });
  console.log('qte 1e9 :', r.status, r.body && (r.body.error || JSON.stringify(r.body.sale)));

  // T5 prix pilote par le client
  line('T5  prix envoye par le client (Coupe a 20,00 EUR au catalogue)');
  r = await api('POST','/api/sales',{ payment_method:'especes', items:[item({unit_price_cents:1})] });
  console.log('Coupe vendue 0,01 EUR :', r.status, JSON.stringify(r.body && r.body.sale));
  r = await api('POST','/api/sales',{ payment_method:'especes', items:[item({item_name:'Nom invente', unit_price_cents:0})] });
  console.log('Article "Nom invente" a 0 EUR :', r.status);

  // T11 PIN
  line('T11 code PIN stocke');
  console.log('barbers.pin_code =', sql("SELECT GROUP_CONCAT(pin_code) FROM barbers WHERE salon_id='s1'"));
})().catch(e => { console.error('ERREUR TEST', e); process.exit(1); });
