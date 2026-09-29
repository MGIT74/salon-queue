// Filet de securite "timer" : demarrage automatique d'un RDV programme non
// commence, arret automatique d'une prestation en cours dont la duree prevue
// est depassee. Appelle directement autoManageTimersForSalon (le job cron),
// contre la vraie base - pas de detour par HTTP, on verifie l'etat SQL brut.
process.env.DB_HOST = process.env.DB_HOST || '127.0.0.1';
process.env.DB_USER = process.env.DB_USER || 'sq';
process.env.DB_PASSWORD = process.env.DB_PASSWORD || 'sqpass';
process.env.DB_NAME = process.env.DB_NAME || 'salonq';
process.env.SETTINGS_ENCRYPTION_KEY = process.env.SETTINGS_ENCRYPTION_KEY || 'testkeytestkeytestkeytestkey123456';
const path = require('path');
const { pool } = require(path.join(__dirname, '../../src/db'));
const { autoManageTimersForSalon } = require(path.join(__dirname, '../../src/cron/autoTimer'));
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n + (x ? '  [' + x + ']' : '')); };
const row = async (id) => { const [[r]] = await pool.query('SELECT status, start_at, end_at, barber_id FROM queue WHERE id = ?', [id]); return r; };
const minAgo = (m) => new Date(Date.now() - m * 60000);

(async () => {
  await pool.query("DELETE FROM queue WHERE salon_id = 's1'");
  await pool.query("INSERT INTO barbers (id,salon_id,name,pin_code) VALUES ('b2','s1','Bob','2222') ON DUPLICATE KEY UPDATE name=name");

  console.log('\n[A] Demarrage automatique - RDV programme, heure passee, jamais commence');
  await pool.query(
    "INSERT INTO queue (id,salon_id,client_name,barber_id,service_id,status,checkin_at,is_appointment,total_duration_min,total_price_cents) VALUES ('q1','s1','Client RDV','b1','sv1','waiting',?,1,30,2000)",
    [minAgo(10)]
  );
  await autoManageTimersForSalon('s1');
  let r = await row('q1');
  check('passe en_cours', r.status === 'in_progress', r.status);
  check('demarre a l\'heure PREVUE du RDV (il y a 10 min), pas a "maintenant"', Math.abs(new Date(r.start_at).getTime() - minAgo(10).getTime()) < 2000, r.start_at);

  console.log('\n[B] Client en attente LIBRE (pas de RDV) : jamais demarre tout seul, meme "en retard"');
  await pool.query(
    "INSERT INTO queue (id,salon_id,client_name,barber_id,service_id,status,checkin_at,is_appointment,total_duration_min,total_price_cents) VALUES ('q2','s1','Client Libre','b2','sv1','waiting',?,0,30,2000)",
    [minAgo(60)]
  );
  await autoManageTimersForSalon('s1');
  r = await row('q2');
  check('reste en attente (pas de RDV = pas d\'heure prevue = rien a demarrer tout seul)', r.status === 'waiting', r.status);

  console.log('\n[C] RDV programme mais SANS coiffeur assigne ("premier libre") : pas demarre (personne a qui l\'attribuer)');
  await pool.query(
    "INSERT INTO queue (id,salon_id,client_name,barber_id,service_id,status,checkin_at,is_appointment,total_duration_min,total_price_cents) VALUES ('q3','s1','Client Sans Coiffeur',NULL,'sv1','waiting',?,1,30,2000)",
    [minAgo(10)]
  );
  await autoManageTimersForSalon('s1');
  r = await row('q3');
  check('reste en attente', r.status === 'waiting', r.status);

  console.log('\n[D] Coiffeur DEJA occupe : le RDV du dessous ne demarre pas par-dessus (conflit)');
  await pool.query("UPDATE queue SET status='in_progress', start_at=NOW() WHERE id='q1'"); // b1 est "occupe" par q1
  await pool.query(
    "INSERT INTO queue (id,salon_id,client_name,barber_id,service_id,status,checkin_at,is_appointment,total_duration_min,total_price_cents) VALUES ('q4','s1','Client En Conflit','b1','sv1','waiting',?,1,30,2000)",
    [minAgo(5)]
  );
  await autoManageTimersForSalon('s1');
  r = await row('q4');
  check('reste en attente (b1 deja en cours avec q1)', r.status === 'waiting', r.status);
  await pool.query("UPDATE queue SET status='waiting' WHERE id='q1'"); // on remet q1 comme avant pour la suite

  console.log('\n[E] Arret automatique - prestation en cours, duree prevue depassee, jamais terminee');
  // sv1 dure 30 min (verifie en base) : loadQueue() recalcule TOUJOURS la
  // duree reelle depuis la fiche du service au moment du controle - un
  // total_duration_min insere ici a la main serait ignore, a raison (une
  // prestation dont la duree a change depuis doit utiliser la duree A JOUR).
  await pool.query(
    "INSERT INTO queue (id,salon_id,client_name,barber_id,service_id,status,checkin_at,start_at,is_appointment,total_price_cents) VALUES ('q5','s1','Client En Retard','b2','sv1','in_progress',?,?,0,2000)",
    [minAgo(50), minAgo(50)]
  );
  await autoManageTimersForSalon('s1');
  r = await row('q5');
  check('passe termine (30 min PREVUES pour "Coupe", 50 ecoulees)', r.status === 'done', r.status);
  check('heure de fin = heure de debut + duree REELLE du service (30 min, pas "maintenant")', Math.abs(new Date(r.end_at).getTime() - (minAgo(50).getTime() + 30 * 60000)) < 3000, r.end_at);

  console.log('\n[F] Prestation en cours mais PAS ENCORE arrivee a echeance : ne touche a rien');
  await pool.query(
    "INSERT INTO queue (id,salon_id,client_name,barber_id,service_id,status,checkin_at,start_at,is_appointment,total_duration_min,total_price_cents) VALUES ('q6','s1','Client A Temps','b2','sv1','in_progress',?,?,0,30,2000)",
    [minAgo(5), minAgo(5)]
  );
  await autoManageTimersForSalon('s1');
  r = await row('q6');
  check('reste en cours (30 min prevues, seulement 5 ecoulees)', r.status === 'in_progress', r.status);

  console.log('\n[G] Client marque Absent : jamais touche, meme avec une heure de RDV largement depassee');
  await pool.query(
    "INSERT INTO queue (id,salon_id,client_name,barber_id,service_id,status,checkin_at,is_appointment,total_duration_min,total_price_cents) VALUES ('q7','s1','Client Absent','b2','sv1','cancelled',?,1,30,2000)",
    [minAgo(120)]
  );
  await autoManageTimersForSalon('s1');
  r = await row('q7');
  check('reste annule (jamais reanime)', r.status === 'cancelled', r.status);

  console.log('\n[H] Deuxieme passage (comme le prochain tick, 1 min plus tard) : deja traites, rien ne change / rien ne casse');
  await autoManageTimersForSalon('s1');
  check('q1 (rendu waiting plus haut) redemarre proprement au repassage', (await row('q1')).status === 'in_progress');
  check('q5 (deja termine) reste termine, pas d\'erreur au repassage', (await row('q5')).status === 'done');

  await pool.query("DELETE FROM queue WHERE salon_id = 's1'");
  console.log(`\nRESULTAT : ${pass} verifications reussies, ${fail} echec(s)`);
  await pool.end();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('ERREUR TEST', e); process.exit(2); });
