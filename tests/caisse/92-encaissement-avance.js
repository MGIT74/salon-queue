// Encaissement A L'AVANCE (base et serveur reels, voir README) : un client de la file paie avant sa coupe,
// garde sa place, apparait "deja paye" ; un supplement ajoute ensuite revient en "reste a payer".
const { execSync } = require('child_process');
const fs = require('fs');
const BASE = 'http://127.0.0.1:3999';
const sql = (q) => execSync(`mariadb -uroot salonq -N -e "${q.replace(/"/g, '\\"')}"`).toString().trim();
const H = { 'Content-Type': 'application/json', 'X-Salon-Slug': 'test', 'X-Barber-Id': 'b1', 'X-Barber-Pin': '1111' };
async function api(method, path, body) {
  const r = await fetch(BASE + path, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  let j = null; try { j = await r.json(); } catch (e) {}
  return { status: r.status, body: j };
}
let pass = 0, fail = 0;
const check = (n, ok, extra) => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n + (ok || extra === undefined ? '' : '  -> ' + JSON.stringify(extra))); };
const svc = { item_type: 'service', item_id: 'sv1', item_name: 'Coupe', unit_price_cents: 2000, quantity: 1 };
const barbe = { item_type: 'extra', item_id: 'ex1', item_name: 'Barbe', unit_price_cents: 800, quantity: 1 };
const sale = (queue_id, items, extra) => api('POST', '/api/sales', Object.assign({ payment_method: 'especes', items, queue_id }, extra || {}));
const pending = async () => (await api('GET', '/api/queue/pending-payment')).body.items || [];

(async () => {
  sql("DELETE FROM sales; DELETE FROM queue; DELETE FROM extras WHERE id='ex1'; DELETE FROM loyalty_accounts");
  sql("INSERT INTO extras (id,salon_id,name,duration_min,price_cents) VALUES ('ex1','s1','Barbe',10,800)");
  const add = (id, name, barber, mins, more) => sql(`INSERT INTO queue (id,salon_id,client_name,email,service_id,barber_id,status,checkin_at${more ? ',' + more[0] : ''}) VALUES ('${id}','s1','${name}','${id}@x.fr','sv1',${barber ? "'" + barber + "'" : 'NULL'},'waiting',UTC_TIMESTAMP() - INTERVAL ${mins} MINUTE${more ? ',' + more[1] : ''})`);
  add('q1', 'Adam', 'b1', 30); add('q2', 'Bruno', 'b1', 20); add('q3', 'Cadeau', 'b1', 10, ['gift_card_id', "'g-x'"]); add('q6', 'Libre', null, 5);

  console.log('\n[A] Paiement d\'avance d\'un client en attente');
  let r = await sale('q1', [svc]);
  check('vente acceptee pour un client encore EN ATTENTE', r.status === 200, r.body);
  check('client marque paye (paid_at + prepaid_at) et TOUJOURS en attente', sql("SELECT CONCAT(status,'|',paid_at IS NOT NULL,'|',prepaid_at IS NOT NULL) FROM queue WHERE id='q1'") === 'waiting|1|1');
  const q = (await api('GET', '/api/queue')).body.queue;
  const q1 = q.find((x) => x.id === 'q1');
  check('la file le renvoie avec paid_at (badge "Deja paye") et il garde sa place (1er)', q1 && q1.paid_at && q.filter((x) => x.status === 'waiting')[0].id === 'q1');
  r = await sale('q1', [svc]);
  check('deuxieme paiement d\'avance refuse (409)', r.status === 409 && /avance/.test(r.body.error), r.body);
  check('pas dans "En attente d\'encaissement" tant qu\'il attend', !(await pending()).some((x) => x.id === 'q1'));

  console.log('\n[B] Refus');
  r = await sale('q3', [svc]);
  check('client venu avec un cadeau : pas de paiement d\'avance (409)', r.status === 409 && /cadeau/.test(r.body.error), r.body);
  sql("UPDATE queue SET status='cancelled' WHERE id='q2'");
  r = await sale('q2', [svc]);
  check('client annule : refuse (409)', r.status === 409, r.body);
  r = await sale('q6', [svc]);
  check('client "premier disponible" (sans coiffeur) : payable d\'avance', r.status === 200, r.body);
  r = await sale('q1', [barbe], { balance: true });
  check('reste a payer refuse tant que la coupe n\'est pas finie', r.status === 409, r.body);

  console.log('\n[C] Supplement ajoute apres paiement -> reste a payer a la fin');
  // Regle existante : pas de supplement pendant une coupe si quelqu'un attend derriere -> on vide la file.
  sql("UPDATE queue SET status='cancelled' WHERE id IN ('q3','q6')");
  r = await api('POST', '/api/queue/q1/start', {});
  check('le client paye demarre normalement (son tour)', r.status === 200, r.body);
  r = await api('PUT', '/api/queue/q1', { extras: ['ex1'] });
  check('supplement ajoute pendant la coupe', r.status === 200, r.body);
  r = await api('POST', '/api/queue/q1/finish', {});
  let p = await pending();
  let row = p.find((x) => x.id === 'q1');
  check('a la fin : reapparait avec UNIQUEMENT le reste a payer (Barbe 8 EUR)', row && row.prepaid && row.balance_due_cents === 800 && row.balance_lines.length === 1 && row.balance_lines[0].item_id === 'ex1', row);
  r = await sale('q1', [barbe], { balance: true });
  check('reste a payer encaisse', r.status === 200, r.body);
  check('...puis disparait de la liste', !(await pending()).some((x) => x.id === 'q1'));
  r = await sale('q1', [barbe], { balance: true });
  check('reste a payer encaisse une seule fois (409)', r.status === 409, r.body);
  check('deux ventes rattachees au passage (avance + reste) = 28 EUR', sql("SELECT CONCAT(COUNT(*),'|',SUM(total_price_cents)) FROM sales WHERE queue_id='q1'") === '2|2800');

  console.log('\n[D] Sans supplement : rien a payer a la fin');
  add('q4', 'Denis', 'b1', 1);
  await sale('q4', [svc]);
  await api('POST', '/api/queue/q4/start', {});
  await api('POST', '/api/queue/q4/finish', {});
  check('pas de ligne "en attente d\'encaissement"', !(await pending()).some((x) => x.id === 'q4'));
  check('passage solde automatiquement (balance_paid_at pose)', sql("SELECT balance_paid_at IS NOT NULL FROM queue WHERE id='q4'") === '1');

  console.log('\n[E] Parcours normal inchange');
  sql("INSERT INTO queue (id,salon_id,client_name,service_id,barber_id,status,checkin_at,end_at) VALUES ('q5','s1','Eva','sv1','b1','done',UTC_TIMESTAMP(),UTC_TIMESTAMP())");
  row = (await pending()).find((x) => x.id === 'q5');
  check('coupe terminee non payee : dans la liste, sans "paye d\'avance"', row && !row.prepaid);
  r = await sale('q5', [svc]);
  check('encaissement normal OK, pas marque "d\'avance"', r.status === 200 && sql("SELECT CONCAT(paid_at IS NOT NULL,'|',prepaid_at IS NULL) FROM queue WHERE id='q5'") === '1|1', r.body);
  r = await sale('q5', [svc]);
  check('double encaissement toujours refuse', r.status === 409);

  console.log('\n[F] Ecrans');
  const caisse = fs.readFileSync(__dirname + '/../../public/caisse.html', 'utf8');
  check('caisse : bouton "Encaisser a l\'avance" + choix du client + mode du ticket', /onclick="openAdvancePicker\(\)"/.test(caisse) && /function useAdvanceForTicket/.test(caisse) && /ticketMode = 'advance'/.test(caisse));
  check('caisse : reste a payer cliquable dans "En attente" et envoye avec balance', /useBalanceForTicket\(/.test(caisse) && /balance: saleCtx\.ticketMode === 'balance'/.test(caisse));
  check('Timer (caisse, poste) + file du dashboard : badge "Deja paye"', /paidBadgeHtml\(q\)/.test(caisse) && /✓ Déjà payé/.test(fs.readFileSync(__dirname + '/../../public/poste.html', 'utf8')) && /✓ Déjà payé/.test(fs.readFileSync(__dirname + '/../../public/dashboard.html', 'utf8')));
  check('marquer absent un client paye : avertissement remboursement', (caisse.match(/remboursement n\\'est pas automatique/g) || []).length === 1);

  sql("DELETE FROM extras WHERE id='ex1'");
  console.log('\nRESULTAT : ' + pass + ' verifications reussies, ' + fail + ' echec(s)');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
