// Reglages > Fermetures exceptionnelles : meme calendrier annuel que les conges des coiffeurs (clic / glisse sur les jours),
// a la place du bouton « + Ajouter une fermeture ».
// - cocher « Salon ferme » ouvre la fenetre habituelle deja remplie (motif, rendez-vous concernes, email aux clients) ;
// - decocher sur des jours fermes les rouvre, le reste de la fermeture est conserve (decoupe cote serveur, sans email) ;
// - jours passes non modifiables.
const fs = require('fs'), path = require('path');
const { execSync } = require('child_process');
const BASE = 'http://127.0.0.1:3999';
const sql = (q) => execSync(`mariadb -uroot salonq -N -e "${q.replace(/"/g, '\\"')}"`).toString().trim();
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n + (x ? '  [' + (typeof x === 'string' ? x : JSON.stringify(x)).slice(0, 160) + ']' : '')); };
const ADMIN = { 'Content-Type': 'application/json', 'X-Salon-Slug': 'test', 'X-Admin-Password': 'adminpw' };

(async () => {
  const d = fs.readFileSync(path.join(__dirname, '../../public/dashboard.html'), 'utf8');
  console.log('\n[A] Ecran');
  check('calendrier annuel des fermetures (meme composant que les conges), plus de bouton « + Ajouter une fermeture »', /class="lv-year lv-salon" id="leaves-list-salon"/.test(d) && !/>\+ Ajouter une fermeture</.test(d));
  check('jours fermes = fermetures du salon ; jours passes non selectionnables', /if \(id === 'salon'\) \{\s*\(salonClosuresItems/.test(d) && /id === 'salon' && iso < todayIso \? ' past'/.test(d) && /cell\.classList\.contains\('past'\)/.test(d));
  check('bulle « Salon fermé ces N jours » ; cocher ouvre la fenetre habituelle pre-remplie', /'Salon fermé ces ' \+ n \+ ' jours'/.test(d) && /openAddSalonClosure\(open\[0\], open\[open\.length - 1\]\)/.test(d) && /value="' \+ \(presetFrom \|\| nextOpen\)/.test(d));
  check('la fenetre garde motif, rendez-vous concernes et email aux clients', /id="asc-reason"/.test(d) && /closures\/preview/.test(d) && /Prévenir les clients par email/.test(d));
  check('decocher rouvre les jours (le reste de la fermeture est conserve)', /function salonReopenDays\(days\)/.test(d) && /send_email: false, confirm_existing_appointments: true/.test(d));

  console.log('\n[B] Rouvrir un jour au milieu d\'une fermeture (memes appels que la page)');
  const y = new Date().getFullYear() + 1;
  sql(`DELETE FROM salon_closures WHERE salon_id = 's1' AND start_date >= '${y}-01-01'`);
  let r = await fetch(BASE + '/api/salon-calendar/closures', { method: 'POST', headers: ADMIN, body: JSON.stringify({ start_date: `${y}-12-24`, end_date: `${y}-12-26`, reason: 'Noel', confirm_existing_appointments: true }) });
  const j = await r.json();
  check('fermeture du 24 au 26 creee', r.status === 200 && j.id, j);
  await fetch(BASE + '/api/salon-calendar/closures/' + j.id, { method: 'DELETE', headers: ADMIN });
  for (const day of ['24', '26']) await fetch(BASE + '/api/salon-calendar/closures', { method: 'POST', headers: ADMIN, body: JSON.stringify({ start_date: `${y}-12-${day}`, end_date: `${y}-12-${day}`, reason: 'Noel', send_email: false, confirm_existing_appointments: true }) });
  const rows = sql(`SELECT GROUP_CONCAT(CONCAT(DATE_FORMAT(start_date,'%d'),'-',DATE_FORMAT(end_date,'%d'),':',reason) ORDER BY start_date) FROM salon_closures WHERE salon_id = 's1' AND start_date >= '${y}-12-01'`);
  check('le 25 est rouvert, 24 et 26 restent fermes avec le motif', rows === '24-24:Noel,26-26:Noel', rows);
  sql(`DELETE FROM salon_closures WHERE salon_id = 's1' AND start_date >= '${y}-01-01'`);

  console.log('\n[C] Conges d\'un coiffeur : meme controle des rendez-vous');
  const D = `${y}-11-12`;
  sql(`DELETE FROM appointments WHERE client_name IN ('T112a','T112b');
       INSERT INTO appointments (id, salon_id, barber_id, client_name, phone, service_id, scheduled_at, status, cancel_token) VALUES
       (UUID(),'s1','b1','T112a','0600000000','sv1','${D} 10:30:00','confirmed','t112a'),(UUID(),'s1','b2','T112b','','sv1','${D} 11:00:00','confirmed','t112b');`);
  r = await fetch(BASE + '/api/barbers/b1/leaves/preview', { method: 'POST', headers: ADMIN, body: JSON.stringify({ dates: [D] }) });
  let pj = await r.json();
  check('rendez-vous de CE coiffeur sur les jours choisis (pas ceux des autres)', r.status === 200 && pj.count === 1 && pj.items[0].client_name === 'T112a' && pj.items[0].scheduled_at === D + ' 10:30', pj);
  r = await fetch(BASE + '/api/barbers/b1/leaves/preview', { method: 'POST', headers: ADMIN, body: JSON.stringify({ dates: [`${y}-11-13`] }) });
  pj = await r.json();
  check('jour sans rendez-vous : rien a signaler', pj.count === 0);
  r = await fetch(BASE + '/api/barbers/b1/leaves/preview', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Salon-Slug': 'test' }, body: JSON.stringify({ dates: [D] }) });
  check('reserve a l\'admin', r.status === 401 || r.status === 403, r.status);
  sql(`DELETE FROM appointments WHERE client_name IN ('T112a','T112b');`);
  check('ecran : « En congé » verifie d\'abord, fenetre « Rendez-vous pendant le congé » (Retour / Confirmer le congé)', /leaves\/preview/.test(d) && /Rendez-vous pendant le congé/.test(d) && /lv-review-confirm/.test(d) && /if \(ok\) return lvSaveDays\(id, days, on, rep\)/.test(d));

  console.log(`\n${pass} OK, ${fail} ECHEC`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
