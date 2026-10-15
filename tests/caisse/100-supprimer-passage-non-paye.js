// Caisse, onglet « À encaisser » : corbeille pour supprimer un passage qui ne sera pas payé (ex : offert).
// Le passage ET sa réservation disparaissent (ni chiffre, ni statistiques), le compte client reste ; l'espace
// client n'affiche comme « dernier passage » que la dernière venue PAYÉE.
const { execSync } = require('child_process');
const fs = require('fs');
const BASE = 'http://127.0.0.1:3999';
const sql = (q) => execSync(`mariadb -uroot salonq -N -e "${q.replace(/"/g, '\\"')}"`).toString().trim();
const H = (id, pin) => ({ 'Content-Type': 'application/json', 'X-Salon-Slug': 'test', 'X-Barber-Id': id, 'X-Barber-Pin': pin });
const ALICE = H('b1', '1111'), BOB = H('b2', '2222');
const PUBLIC = { 'Content-Type': 'application/json', 'X-Salon-Slug': 'test' };
const del = async (id, h) => { const r = await fetch(BASE + '/api/queue/' + id + '/unpaid', { method: 'DELETE', headers: h }); return { status: r.status, body: await r.json().catch(() => null) }; };
let pass = 0, fail = 0;
const check = (n, ok, extra) => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n + (ok || extra === undefined ? '' : '  -> ' + JSON.stringify(extra))); };

(async () => {
  const ids = "'t100a','t100b','t100c','t100d'";
  const clean = `DELETE FROM appointments WHERE id IN ('t100r'); DELETE FROM sales WHERE queue_id IN (${ids}); DELETE FROM queue WHERE id IN (${ids}); DELETE FROM clients WHERE id='t100k'`;
  sql(clean);
  sql("INSERT INTO clients (id,owner_id,salon_id,name,email,password_hash,email_verified) VALUES ('t100k','o1','s1','Adel T100','adel.t100@example.com','x',1)");
  const q = (id, extra) => sql(`INSERT INTO queue (id,salon_id,client_name,email,service_id,barber_id,status,total_price_cents,checkin_at${extra ? ',' + extra[0] : ''}) VALUES ('${id}','s1','Adel T100','adel.t100@example.com','sv1','b1','done',2000,NOW()${extra ? ',' + extra[1] : ''})`);
  q('t100a'); q('t100b', ['prepaid_at', 'NOW()']); q('t100c', ['paid_at', 'NOW() - INTERVAL 10 DAY']);
  sql("UPDATE queue SET checkin_at = NOW() - INTERVAL 10 DAY WHERE id='t100c'");
  sql("INSERT INTO queue_extras (queue_id, extra_id) SELECT 't100a', id FROM extras WHERE salon_id='s1' LIMIT 1");
  sql("INSERT INTO appointments (id,salon_id,barber_id,client_name,email,service_id,scheduled_at,status,cancel_token,promoted_queue_id) VALUES ('t100r','s1','b1','Adel T100','adel.t100@example.com','sv1',NOW(),'confirmed','tok100','t100a')");

  let r = await fetch(BASE + '/api/queue/pending-payment', { headers: ALICE }).then((x) => x.json());
  check('le passage non payé apparaît dans « À encaisser »', r.items.some((x) => x.id === 't100a'));

  r = await del('t100a', PUBLIC);
  check('sans code PIN : refusé', r.status === 401, r.status);
  r = await del('t100a', BOB);
  check('un autre coiffeur ne peut pas supprimer le client d\'Alice', r.status === 403 && sql("SELECT COUNT(*) FROM queue WHERE id='t100a'") === '1', r.body);
  r = await del('t100b', ALICE);
  check('payé d\'avance : refusé (remboursement), rien supprimé', r.status === 409 && /rembours/i.test(r.body.error) && sql("SELECT COUNT(*) FROM queue WHERE id='t100b'") === '1', r.body);
  r = await del('t100c', ALICE);
  check('déjà payé : refusé', r.status === 409 && sql("SELECT COUNT(*) FROM queue WHERE id='t100c'") === '1', r.body);

  r = await del('t100a', ALICE);
  check('passage non payé supprimé par son coiffeur', r.status === 200 && r.body.deleted && sql("SELECT COUNT(*) FROM queue WHERE id='t100a'") === '0', r.body);
  check('...sa réservation d\'origine aussi (comme s\'il n\'avait jamais réservé)', r.body.appointments_deleted === 1 && sql("SELECT COUNT(*) FROM appointments WHERE id='t100r'") === '0');
  check('...ses suppléments aussi, aucune vente créée', sql("SELECT COUNT(*) FROM queue_extras WHERE queue_id='t100a'") === '0' && sql("SELECT COUNT(*) FROM sales WHERE queue_id='t100a'") === '0');
  check('...le compte client est conservé', sql("SELECT COUNT(*) FROM clients WHERE id='t100k'") === '1');
  check('...noté dans le journal du salon', sql("SELECT COUNT(*) FROM activity_log WHERE salon_id='s1' AND action='unpaid_delete' AND description LIKE '%Adel T100%Alice%'") !== '0');
  r = await fetch(BASE + '/api/queue/pending-payment', { headers: ALICE }).then((x) => x.json());
  check('...et il n\'est plus dans « À encaisser »', !r.items.some((x) => x.id === 't100a'));
  r = await del('t100a', ALICE);
  check('deuxième suppression : introuvable', r.status === 404, r.status);

  const auth = fs.readFileSync(__dirname + '/../../src/routes/clientAuth.js', 'utf8');
  check('espace client : « dernier passage » = dernière venue PAYÉE seulement', /q\.status = 'done' AND \(q\.paid_at IS NOT NULL OR q\.prepaid_at IS NOT NULL\)/.test(auth));
  const caisse = fs.readFileSync(__dirname + '/../../public/caisse.html', 'utf8');
  check('caisse : corbeille sur la carte, deux confirmations avant suppression', /pendingDelBtn\(q\)/.test(caisse) && /function deleteUnpaidPassage[\s\S]{0,1600}showConfirm[\s\S]{0,900}showConfirm[\s\S]{0,400}\/unpaid', \{ method: 'DELETE' \}/.test(caisse));
  check('caisse : pas de corbeille sur un client payé d\'avance', /\(q\.prepaid \? '' : pendingDelBtn\(q\)\)/.test(caisse) && !/reste à payer : ' \+ esc\(addedNames\)[\s\S]{0,400}pendingDelBtn/.test(caisse));

  sql(clean);
  console.log('\nRESULTAT : ' + pass + ' verifications reussies, ' + fail + ' echec(s)');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
