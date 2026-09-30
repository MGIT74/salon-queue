// Le kiosque (ecran d'attente en salle) ne doit compter/afficher que les
// clients en attente LIBRE (sans rendez-vous) - un rendez-vous programme n'a
// pas besoin d'apparaitre sur cet ecran, il a deja son heure prevue.
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const BASE = 'http://127.0.0.1:3999';
const sql = (q) => execSync(`mariadb -uroot salonq -e "${q.replace(/"/g,'\\"')}"`, { stdio: 'pipe' });
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n + (x ? '  [' + x + ']' : '')); };

(async () => {
  sql("DELETE FROM queue WHERE salon_id = 's1'");
  sql("INSERT INTO queue (id,salon_id,client_name,service_id,status,checkin_at,is_appointment,total_price_cents) VALUES ('q-libre','s1','Client Libre','sv1','waiting',NOW(),0,2000)");
  sql("INSERT INTO queue (id,salon_id,client_name,barber_id,service_id,status,checkin_at,is_appointment,total_price_cents) VALUES ('q-rdv','s1','Client RDV','b1','sv1','waiting',NOW(),1,2000)");

  console.log('\n[A] L\'API renvoie bien is_appointment pour chaque ligne');
  const r = await (await fetch(BASE + '/api/queue', { headers: { 'X-Salon-Slug': 'test' } })).json();
  const libre = r.queue.find(q => q.id === 'q-libre');
  const rdv = r.queue.find(q => q.id === 'q-rdv');
  check('client libre : is_appointment=0 (ou falsy)', libre && !libre.is_appointment, JSON.stringify(libre && libre.is_appointment));
  check('client RDV : is_appointment=1 (ou truthy)', rdv && Boolean(rdv.is_appointment), JSON.stringify(rdv && rdv.is_appointment));

  console.log('\n[B] Le VRAI filtre du kiosque (extrait du fichier) exclut bien le RDV, garde le client libre');
  const src = fs.readFileSync(path.join(__dirname, '../../public/kiosk.html'), 'utf8');
  const n = (src.match(/queue\.filter\(function \(q\) \{ return q\.status === 'waiting' && !q\.is_appointment; \}\)/g) || []).length;
  check('les 4 filtres du fichier excluent bien is_appointment', n === 4, n + ' occurrence(s)');

  // eslint-disable-next-line no-new-func
  const filterFn = new Function('q', "return q.status === 'waiting' && !q.is_appointment;");
  const waiting = r.queue.filter(filterFn);
  check('le client LIBRE est bien compte "en attente"', waiting.some(q => q.id === 'q-libre'));
  check('le client RDV n\'est PAS compte "en attente"', !waiting.some(q => q.id === 'q-rdv'));
  check('exactement 1 client en attente au total (pas 2)', waiting.length === 1, waiting.length);

  sql("DELETE FROM queue WHERE salon_id = 's1'");
  console.log(`\nRESULTAT : ${pass} verifications reussies, ${fail} echec(s)`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('ERREUR TEST', e); process.exit(2); });
