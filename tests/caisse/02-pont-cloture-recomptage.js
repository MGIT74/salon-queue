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
(async () => {
  // --- Pont : cle, statut, apercu (code recent) ---
  line('P1  cle du pont + apercu (code recent)');
  let r = await api('GET','/api/tpe/bridge-status');
  console.log('avant cle :', JSON.stringify(r.body));
  r = await api('POST','/api/tpe/bridge-key',{});
  const key = r.body.key; console.log('cle generee, longueur', key && key.length);
  r = await api('GET','/api/tpe/bridge-status');
  console.log('apres cle :', JSON.stringify(r.body));
  const BH = { 'X-Bridge-Key': key, 'X-Salon-Slug':'test', 'Content-Type':'application/json' };
  await api('GET','/api/tpe/bridge/poll',null,BH);
  r = await api('GET','/api/tpe/bridge-status');
  console.log('apres 1 poll du pont -> online =', r.body.online, '| tpe_online =', r.body.tpe_online);

  // --- Paiement CB : une meme demande est-elle re-livree ? ---
  line('P2  demande de paiement CB : livraison repetee au pont ?');
  sql("INSERT INTO tpe_charge_jobs (id,salon_id,amount_cents) VALUES ('cj1','s1',2000)");
  const a = await api('GET','/api/tpe/bridge/charge-poll',null,BH);
  const b = await api('GET','/api/tpe/bridge/charge-poll',null,BH);
  console.log('1er poll :', a.body.jobs.length, 'job(s) | 2e poll (3 s plus tard, sans ack) :', b.body.jobs.length, 'job(s)  ->', b.body.jobs.length ? 'RE-LIVRE (risque de double debit)' : 'ok');
  console.log('statut en base :', sql("SELECT status FROM tpe_charge_jobs WHERE id='cj1'"));

  // --- Tickets/tiroir anciens ---
  line('P3  tickets et ouverture de tiroir vieux de 2 jours');
  sql("INSERT INTO print_jobs (id,salon_id,text,mode,created_at) VALUES ('pj_old','s1','vieux ticket','escpos', NOW() - INTERVAL 2 DAY), ('pj_drawer','s1','drawer','drawer', NOW() - INTERVAL 2 DAY)");
  r = await api('GET','/api/tpe/bridge/poll',null,BH);
  console.log('livres au pont :', r.body.jobs.map(j => j.mode + ' (' + j.id + ')').join(', '));

  // --- Cloture ---
  line('C1  cloture Z : coherence des totaux');
  r = await api('GET','/api/owner/caisse/current-period');
  console.log('periode en cours :', JSON.stringify(r.body).slice(0, 220));
  r = await api('POST','/api/owner/caisse/close',{ starting_cash_cents: 20000, closed_by_barber_id: 'b1' });
  console.log('close ->', r.status, JSON.stringify(r.body).slice(0, 160));
  const cid = sql("SELECT id FROM cash_closings WHERE salon_id='s1' ORDER BY period_end DESC LIMIT 1");
  console.log('Z.total_cents            =', sql(`SELECT total_cents FROM cash_closings WHERE id='${cid}'`));
  console.log('somme des ventes (sales) =', sql("SELECT SUM(total_price_cents) FROM sales WHERE salon_id='s1'"));
  console.log('somme des lignes (items) =', sql("SELECT SUM(i.quantity*i.unit_price_cents) FROM sale_items i JOIN sales s ON s.id=i.sale_id WHERE s.salon_id='s1'"));
  console.log('closed_by                =', sql(`SELECT closed_by FROM cash_closings WHERE id='${cid}'`));

  line('C2  apres cloture : vente refusee ? 2e cloture ?');
  r = await api('POST','/api/sales',{ payment_method:'especes', items:[{item_type:'service',item_id:'sv1',item_name:'Coupe',unit_price_cents:2000,quantity:1}] });
  console.log('vente apres cloture :', r.status, r.body && r.body.error);
  r = await api('POST','/api/owner/caisse/close',{ starting_cash_cents: 20000 });
  console.log('2e cloture :', r.status, r.body && r.body.error);

  // --- Mon code recent : recomptage ---
  line('R1  recomptage (code ecrit ces derniers jours)');
  r = await api('POST','/api/barbers/login',{ pin:'1111', source:'caisse' });
  console.log('login PIN source=caisse -> pending_recount =', JSON.stringify(r.body.pending_recount));
  r = await api('POST','/api/barbers/login',{ pin:'1111', source:'poste' });
  console.log('login PIN source=poste  -> pending_recount =', JSON.stringify(r.body.pending_recount));
  r = await api('GET','/api/owner/caisse/pending-recount');
  console.log('GET pending-recount (apres F5)  ->', r.status, JSON.stringify(r.body));
  const pr = r.body.pending_recount;
  r = await api('POST','/api/owner/caisse/confirm-recount',{ closing_id: pr.closing_id, actual_cents: 20000 });
  console.log('confirm-recount ->', r.status, JSON.stringify(r.body));
  r = await api('POST','/api/owner/caisse/confirm-recount',{ closing_id: pr.closing_id, actual_cents: 20000 });
  console.log('confirm-recount 2e fois (double clic) ->', r.status, JSON.stringify(r.body));
  r = await api('GET','/api/owner/caisse/pending-recount');
  console.log('GET pending-recount apres confirmation ->', JSON.stringify(r.body));
  r = await api('GET','/api/owner/caisse/pending-recount',null,{ 'X-Salon-Slug':'test' });
  console.log('pending-recount SANS authentification ->', r.status);
})().catch(e => { console.error('ERREUR TEST', e); process.exit(1); });
