// Paiement carte de bout en bout : la caisse appelle /api/tpe/charge (attente
// longue) pendant qu'un FAUX PONT joue les scenarios reels du terminal.
// Le serveur doit etre lance avec TPE_CHARGE_WAIT_MS=4000 (attente courte).
const { execSync } = require('child_process');
const BASE = 'http://127.0.0.1:3999';
const sql = (q) => execSync(`mariadb -uroot salonq -N -e "${q.replace(/"/g,'\\"')}"`).toString().trim();
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const H = { 'Content-Type':'application/json','X-Salon-Slug':'test','X-Barber-Id':'b1','X-Barber-Pin':'1111' };
async function api(method, path, body, headers = H) {
  const r = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let j = null; try { j = await r.json(); } catch (e) {}
  return { status: r.status, body: j };
}
let pass = 0, fail = 0;
const check = (n, ok, x='') => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n + (x ? '  [' + x + ']' : '')); };
const jobStatus = (id) => sql(`SELECT status FROM tpe_charge_jobs WHERE id='${id}'`);
const lastJob = () => sql("SELECT id FROM tpe_charge_jobs WHERE salon_id='s1' ORDER BY created_at DESC, updated_at DESC LIMIT 1");

(async () => {
  sql("DELETE FROM tpe_charge_jobs; DELETE FROM bridge_keys;");

  console.log('\n[H] Aucun pont configure');
  let r = await api('POST','/api/tpe/charge',{ amount_cents: 2000 });
  check('refus immediat et clair', r.status === 400 && /pont/i.test(r.body.error), r.status + ' ' + r.body.error);

  const key = (await api('POST','/api/tpe/bridge-key',{})).body.key;
  const BH = { 'X-Bridge-Key': key, 'X-Salon-Slug':'test', 'Content-Type':'application/json' };
  const claim = async () => (await api('GET','/api/tpe/bridge/charge-poll',null,BH)).body.jobs;
  const ack = (id, result, error) => api('POST','/api/tpe/bridge/charge-ack',{ job_id:id, result, error },BH);

  console.log('\n[G] Securite de la route du pont');
  r = await api('GET','/api/tpe/bridge/charge-poll',null,{ 'X-Salon-Slug':'test' });
  check('sans cle du pont : 401', r.status === 401);
  r = await api('GET','/api/tpe/bridge/charge-poll',null,{ 'X-Salon-Slug':'test','X-Bridge-Key':'faussecle' });
  check('fausse cle : 401', r.status === 401);
  r = await api('POST','/api/tpe/charge',{ amount_cents: 2000 },{ 'Content-Type':'application/json','X-Salon-Slug':'test' });
  check('/charge sans authentification : 401', r.status === 401);
  r = await api('POST','/api/tpe/charge',{ amount_cents: -5 });
  check('montant negatif refuse : 400', r.status === 400);
  r = await api('POST','/api/tpe/charge',{ amount_cents: 12.5 });
  check('montant non entier refuse : 400', r.status === 400);

  console.log('\n[C] Cas nominal : le pont recupere la demande et le terminal ACCEPTE');
  let t0 = Date.now();
  let p = api('POST','/api/tpe/charge',{ amount_cents: 2000 });
  await sleep(1800);
  let jobs = await claim();
  check('le pont recoit exactement 1 demande de 20,00 EUR', jobs.length === 1 && jobs[0].amount_cents === 2000, JSON.stringify(jobs.map(j=>j.amount_cents)));
  check('un 2e poll ne la re-livre PAS', (await claim()).length === 0);
  await ack(jobs[0].id, { success:true, authNumber:'AB1234' });
  r = await p;
  check('la caisse recoit success:true + numero d\'autorisation', r.status === 200 && r.body.success === true && r.body.auth_number === 'AB1234', JSON.stringify(r.body));
  check('reponse rapide (moins de 6 s)', Date.now() - t0 < 6000, (Date.now() - t0) + ' ms');

  console.log('\n[D] Le terminal REFUSE la carte');
  p = api('POST','/api/tpe/charge',{ amount_cents: 1500 }); await sleep(1800);
  jobs = await claim(); await ack(jobs[0].id, { success:false, failureReason:'Carte refusee' });
  r = await p;
  check('success:false + motif transmis', r.status === 200 && r.body.success === false && r.body.failure_reason === 'Carte refusee', JSON.stringify(r.body));

  console.log('\n[E] Le pont n\'arrive pas a joindre le terminal (erreur reseau)');
  p = api('POST','/api/tpe/charge',{ amount_cents: 1500 }); await sleep(1800);
  jobs = await claim(); await ack(jobs[0].id, null, 'connect ECONNREFUSED 192.168.1.125:8888');
  r = await p;
  check('erreur 502 avec le detail, pas un faux succes', r.status === 502 && /ECONNREFUSED/.test(r.body.error), r.status + ' ' + r.body.error);

  console.log('\n[A] PERSONNE ne recupere la demande (pont hors ligne) : expiration');
  t0 = Date.now();
  r = await api('POST','/api/tpe/charge',{ amount_cents: 2500 });
  check('504 apres l\'attente courte', r.status === 504 && Date.now() - t0 >= 3500, r.status + ' apres ' + (Date.now() - t0) + ' ms');
  check('pas marque "incertain" (personne n\'a envoye le montant au terminal)', !r.body.uncertain);
  const jA = lastJob();
  check('la demande est EXPIREE en base', jobStatus(jA) === 'expired', jobStatus(jA));
  check('le pont qui revient PLUS TARD ne recoit pas ce paiement fantome', (await claim()).length === 0);
  await ack(jA, { success:true, authNumber:'TARDIF' });
  check('un acquittement tardif ne ressuscite pas la demande', jobStatus(jA) === 'expired', jobStatus(jA));

  console.log('\n[B] Le pont PREND la demande mais ne repond jamais (client peut-etre en train de payer)');
  p = api('POST','/api/tpe/charge',{ amount_cents: 3000 }); await sleep(1800);
  jobs = await claim();
  check('le pont a bien recu la demande', jobs.length === 1);
  r = await p;
  check('504 marque "uncertain" avec l\'ordre de verifier le terminal', r.status === 504 && r.body.uncertain === true && /V[ÉE]RIFIEZ/i.test(r.body.error), r.status + ' uncertain=' + r.body.uncertain);
  const jB = jobs[0].id;
  check('la demande reste "processing" (pas expiree : on ne sait pas)', jobStatus(jB) === 'processing', jobStatus(jB));
  await ack(jB, { success:true, authNumber:'OK-APRES' });
  check('si le pont repond finalement, le resultat est bien enregistre', jobStatus(jB) === 'done', jobStatus(jB));

  console.log('\n[M] Deux paiements simultanes (2 tablettes) : chacun recoit SA demande');
  const pa = api('POST','/api/tpe/charge',{ amount_cents: 1111 });
  const pb = api('POST','/api/tpe/charge',{ amount_cents: 2222 });
  await sleep(1800);
  jobs = await claim();
  check('le pont recoit les 2 demandes, une seule fois chacune', jobs.length === 2 && new Set(jobs.map(j=>j.id)).size === 2, jobs.map(j=>j.amount_cents).join(','));
  for (const j of jobs) await ack(j.id, { success:true, authNumber:'N' + j.amount_cents });
  const [ra, rb] = await Promise.all([pa, pb]);
  check('chaque caisse recoit le resultat de SON montant', ra.body.auth_number === 'N1111' && rb.body.auth_number === 'N2222', ra.body.auth_number + ' / ' + rb.body.auth_number);

  console.log(`\nRESULTAT : ${pass} verifications reussies, ${fail} echec(s)`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('ERREUR TEST', e); process.exit(2); });
