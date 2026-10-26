// Encaissement groupe : un seul ticket / un seul paiement pour plusieurs personnes (groupe de RDV, ou client qui paie
// pour un autre, meme client d'un autre coiffeur). Chaque ligne garde sa personne et son coiffeur.
const { execSync } = require('child_process');
const fs = require('fs'), path = require('path');
const BASE = 'http://127.0.0.1:3999';
const sql = (q) => execSync(`mariadb -uroot salonq -N -e "${q.replace(/"/g, '\\"')}"`).toString().trim();
const H = { 'Content-Type': 'application/json', 'X-Salon-Slug': 'test', 'X-Barber-Id': 'b1', 'X-Barber-Pin': '1111' };
async function api(method, p, body, asBarber) {
  const headers = asBarber ? Object.assign({ 'X-Acting-As-Barber-Id': asBarber }, H) : H;
  const r = await fetch(BASE + p, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let j = null; try { j = await r.json(); } catch (e) {}
  return { status: r.status, body: j };
}
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n + (x ? '  [' + JSON.stringify(x).slice(0, 200) + ']' : '')); };
const line = (q, over) => Object.assign({ item_type: 'service', item_id: 'sv1', item_name: 'Coupe', unit_price_cents: 2000, quantity: 1, queue_id: q }, over || {});
const seed = () => {
  sql("DELETE FROM sales WHERE salon_id='s1'; DELETE FROM appointments WHERE id LIKE 'g140%'; DELETE FROM queue WHERE id LIKE 'g140%'");
  sql("INSERT INTO queue (id,salon_id,client_name,service_id,barber_id,status,end_at,total_price_cents) VALUES " +
    "('g140a','s1','Ana','sv1','b1','done',NOW(),2000),('g140b','s1','Ben','sv1','b2','done',NOW(),2000)," +
    "('g140c','s1','Cid','sv1','b2','done',NOW(),2000),('g140w','s1','Wil','sv1','b2','waiting',NULL,2000)");
  sql("INSERT INTO appointments (id,salon_id,barber_id,client_name,service_id,scheduled_at,group_id,promoted_queue_id) VALUES " +
    "('g140x','s1','b1','Ana','sv1',NOW(),'grp140','g140a'),('g140y','s1','b2','Ben','sv1',NOW(),'grp140','g140b')");
};

(async () => {
  seed();
  let r = await api('GET', '/api/queue/pending-payment');
  check('liste du coiffeur : seulement ses clients, avec le groupe', r.body.items.length === 1 && r.body.items[0].group_id === 'grp140', r.body.items.map((x) => x.client_name));
  r = await api('GET', '/api/queue/pending-payment?all=1');
  const names = r.body.items.map((x) => x.client_name + ':' + (x.group_id || '-')).sort().join(',');
  check('all=1 : tout le salon (client d\'un autre coiffeur compris)', names === 'Ana:grp140,Ben:grp140,Cid:-', names);

  r = await api('POST', '/api/sales', { payment_method: 'especes', queue_id: 'g140a', group_queue_ids: ['g140w'], items: [line('g140a'), line('g140w')] });
  check('refus : une personne pas encore terminee', r.status === 409 && sql("SELECT COUNT(*) FROM queue WHERE id='g140a' AND paid_at IS NULL") === '1', r);

  r = await api('POST', '/api/sales', { payment_method: 'especes', queue_id: 'g140a', group_queue_ids: ['g140b', 'g140c'],
    items: [line('g140a', { barber_id: 'b1' }), line('g140b', { barber_id: 'b2' }), line('g140c', { barber_id: 'b2' }), line(null, { item_type: 'product', item_id: 'p1', item_name: 'Gel', unit_price_cents: 500 })] });
  check('vente groupee : un seul ticket', r.status === 200 && sql("SELECT COUNT(*) FROM sales WHERE salon_id='s1'") === '1' && r.body.sale.total_price_cents === 6500, r);
  check('les 3 personnes reglees', sql("SELECT COUNT(*) FROM queue WHERE id IN ('g140a','g140b','g140c') AND paid_at IS NOT NULL") === '3');
  check('chaque ligne garde sa personne et son coiffeur', sql("SELECT GROUP_CONCAT(CONCAT(IFNULL(queue_id,'-'),'/',IFNULL(barber_id,'-')) ORDER BY queue_id SEPARATOR ',') FROM sale_items") === '-/-,g140a/b1,g140b/b2,g140c/b2');
  r = await api('GET', '/api/queue/pending-payment?all=1');
  check('plus personne en attente', r.body.items.length === 0, r.body.items);

  r = await api('POST', '/api/sales', { payment_method: 'especes', queue_id: 'g140b', items: [line('g140b')] }, 'b2');
  check('pas de double encaissement d\'un membre deja regle', r.status === 409, r);
  r = await api('GET', '/api/sales?today=1');
  const it = (r.body.items[0] || { items: [] }).items.map((x) => x.person_name).filter(Boolean).sort().join(',');
  check('historique : le nom de chaque personne sur ses lignes (reimpression)', it === 'Ana,Ben,Cid', it);

  // Un membre deja regle par le ticket groupe est vu comme « encaisse » partout (modification, annulation).
  r = await api('PUT', '/api/queue/g140b', { client_name: 'Ben 2' }, 'b2');
  check('modification d\'un membre regle : refusee comme un passage encaisse', r.status === 409, r);

  // Suppression admin d'une seule fiche d'un ticket groupe : refusee (effacerait la vente des autres).
  const AH = Object.assign({}, H); delete AH['X-Barber-Id']; delete AH['X-Barber-Pin']; AH['X-Admin-Password'] = 'adminpw';
  const del = await fetch(BASE + '/api/queue/g140b', { method: 'DELETE', headers: AH });
  check('suppression d\'une fiche d\'un ticket groupe : refusee', del.status === 409, del.status);

  // Le payeur rejoue sa demande (double clic) : aucune vente en plus.
  seed();
  const req = { payment_method: 'cb', queue_id: 'g140a', group_queue_ids: ['g140b'], items: [line('g140a'), line('g140b')], client_request_id: '11111111-2222-3333-4444-555555555555' };
  const both = await Promise.all([api('POST', '/api/sales', req), api('POST', '/api/sales', req)]);
  check('double clic : une seule vente', sql("SELECT COUNT(*) FROM sales WHERE salon_id='s1'") === '1', both.map((x) => x.status));

  seed();
  r = await api('POST', '/api/sales', { payment_method: 'especes', group_queue_ids: ['g140b'], items: [line('g140b')] });
  check('refus : groupe sans client qui paie', r.status === 400, r);
  r = await api('POST', '/api/sales', { payment_method: 'especes', queue_id: 'g140a', group_queue_ids: ['g140b'], balance: true, items: [line('g140a')] });
  check('refus : groupe + reste a payer', r.status === 400, r);

  const c = fs.readFileSync(path.join(__dirname, '../../public/caisse.html'), 'utf8');
  check('caisse : bouton « Encaisser le groupe » sur la carte', c.includes("usePendingGroupForTicket(\\'' + q.id + '\\')\">Encaisser le groupe ("));
  check('caisse : « + Payer aussi pour un autre client » (tout le salon)', c.includes('id="ticket-group-add"') && c.includes("barberApi('/api/queue/pending-payment?all=1')"));
  check('caisse : la remise fidelite ne porte que sur les lignes du payeur', c.includes("ticket.findIndex(function (l) { return l.item_type === type && !l.person; })"));
  check('caisse : envoi des personnes du ticket', c.includes('group_queue_ids: saleCtx.groupIds && saleCtx.groupIds.length ? saleCtx.groupIds : undefined'));
  check('recu : le nom de la personne sur chaque ligne', c.includes("esc(receiptItemName(l))") && c.includes("' x ' + receiptItemName(l)"));
  sql("DELETE FROM sales WHERE salon_id='s1'; DELETE FROM appointments WHERE id LIKE 'g140%'; DELETE FROM queue WHERE id LIKE 'g140%'");
  console.log(`\n${pass} OK, ${fail} ECHEC`);
  process.exit(fail ? 1 : 0);
})();
