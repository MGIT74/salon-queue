// Borne (file sans RDV) :
// - « Juste moi » / « Plusieurs personnes » en premier ecran ; a plusieurs, chacun choisit son coiffeur et sa prestation,
//   puis le groupe est inscrit en UNE fois (une place par personne, dans l'ordre, email commun facultatif) ;
// - « Premier disponible » seulement s'il y a au moins 2 coiffeurs sans RDV presents ; le client reste sans coiffeur,
//   le premier coiffeur libre le prend (ordre d'arrivee) ;
// - inactivite en pleine inscription : « Vous etes toujours la ? » 5 s, puis remise a zero pour le client suivant ;
// - tout le groupe est verifie avant d'inscrire qui que ce soit ; un groupe compte comme une seule inscription.
const fs = require('fs'), path = require('path');
const { execSync } = require('child_process');
const BASE = 'http://127.0.0.1:3999';
const sql = (q) => execSync(`mariadb -uroot salonq -N -e "${q.replace(/"/g, '\\"')}"`).toString().trim();
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n + (x ? '  [' + (typeof x === 'string' ? x : JSON.stringify(x)).slice(0, 160) + ']' : '')); };
const PUB = { 'Content-Type': 'application/json', 'X-Salon-Slug': 'test' };
const ADMIN = Object.assign({ 'X-Admin-Password': 'adminpw' }, PUB);
const call = async (m, u, h, b) => { const r = await fetch(BASE + u, { method: m, headers: h, body: b ? JSON.stringify(b) : undefined }); let j = null; try { j = await r.json(); } catch (e) {} return { status: r.status, body: j }; };
const clean = () => sql(`DELETE FROM appointments WHERE client_name LIKE 'T118%'; DELETE FROM queue WHERE client_name LIKE 'T118%';`);

(async () => {
  clean();
  console.log('\n[A] Inscription a plusieurs');
  let r = await call('POST', '/api/queue/checkin-group', PUB, { email: 't118@example.com', people: [
    { name: 'T118 Papa', service_id: 'sv1', barber_id: null },
    { name: 'T118 Leo', service_id: 'sv1', barber_id: 'b1', extras: [] },
    { name: 'T118 Sami', service_id: 'sv1', barber_id: '', products: [] }] });
  const ent = (r.body && r.body.entries) || [];
  check('3 places, dans l\'ordre, une par personne', r.status === 200 && ent.map((e) => e.client_name).join(',') === 'T118 Papa,T118 Leo,T118 Sami', r.body);
  check('positions croissantes', ent.length === 3 && ent[0].position < ent[1].position && ent[1].position < ent[2].position, ent.map((e) => e.position));
  check('« Premier disponible » = sans coiffeur ; coiffeur choisi garde', ent.length === 3 && ent[0].barber_id === null && ent[1].barber_id === 'b1' && ent[2].barber_id === null);
  check('email commun pour chacun', sql(`SELECT COUNT(*) FROM queue WHERE client_name LIKE 'T118%' AND email = 't118@example.com'`) === '3');
  check('aussi dans l\'agenda (passage sans RDV)', sql(`SELECT COUNT(*) FROM appointments WHERE client_name LIKE 'T118%' AND source = 'walkin'`) === '3');
  check('heures d\'arrivee distinctes (ordre du groupe garde)', sql(`SELECT COUNT(DISTINCT checkin_at) FROM queue WHERE client_name LIKE 'T118%'`) === '3');

  console.log('\n[B] Groupe refuse en entier si une personne pose probleme');
  r = await call('POST', '/api/queue/checkin-group', PUB, { people: [{ name: 'T118 Ok', service_id: 'sv1' }, { name: 'T118 Ko', service_id: 'nope' }] });
  check('erreur sur la 2e personne, indiquee', r.status === 400 && r.body.person_index === 1 && /T118 Ko/.test(r.body.error), r.body);
  check('personne n\'est inscrit', sql(`SELECT COUNT(*) FROM queue WHERE client_name IN ('T118 Ok','T118 Ko')`) === '0');
  r = await call('POST', '/api/queue/checkin-group', PUB, { people: [{ name: '', service_id: 'sv1' }] });
  check('prenom obligatoire', r.status === 400 && r.body.person_index === 0, r.body);
  r = await call('POST', '/api/queue/checkin-group', PUB, { people: Array.from({ length: 7 }, (x, i) => ({ name: 'T118 ' + i, service_id: 'sv1' })) });
  check('6 personnes maximum', r.status === 400, r.body);
  r = await call('POST', '/api/queue/checkin-group', PUB, { people: [{ name: 'T118 X', service_id: 'sv1', barber_id: 'autre-salon' }] });
  check('coiffeur d\'un autre salon refuse', r.status === 404, r.body);

  console.log('\n[C] « Premier disponible » : pris par le premier coiffeur libre, dans l\'ordre d\'arrivee');
  const papa = ent[0] && ent[0].id, sami = ent[2] && ent[2].id;
  r = await call('POST', `/api/queue/${sami}/start`, ADMIN, { barber_id: 'b2' });
  check('Bob ne peut pas passer Sami avant Papa (arrive avant, sans coiffeur)', r.status === 409 && /T118 Papa/.test(r.body.error), r.body);
  r = await call('POST', `/api/queue/${papa}/start`, ADMIN, { barber_id: 'b2' });
  check('Bob prend Papa', r.status === 200, r.body);
  check('le coiffeur est note sur sa fiche et dans l\'agenda', sql(`SELECT CONCAT(q.barber_id, '|', a.barber_id) FROM queue q JOIN appointments a ON a.promoted_queue_id = q.id WHERE q.id = '${papa}'`) === 'b2|b2');

  console.log('\n[D] Ecran de la borne');
  const k = fs.readFileSync(path.join(__dirname, '../../public/kiosk.html'), 'utf8');
  check('1er ecran : Juste moi / Plusieurs personnes', /id="p-who"/.test(k) && /kioskSolo\(\)/.test(k) && /kioskMulti\(\)/.test(k) && /class="panel on gb-pick" id="p-who"/.test(k));
  check('« Qui vient ? » vide au depart (prenoms tapes)', /function kioskMulti\(\) \{ kNames = \[\];/.test(k));
  check('tuile « Premier disponible » seulement a partir de 2 coiffeurs', /if \(barbers\.length >= 2\) \{/.test(k) && /pickBarberAndGo\(\\'\\'\)/.test(k));
  check('cadeau seulement pour une personne seule', /\(grp \? '' : giftTile\)/.test(k));
  check('par personne : coiffeur > prestation > supplements > produits, puis « Valider pour ... »', /function finalLabel\(\) \{ return grp \? 'Valider pour '/.test(k) && /if \(grp\) return kCartAddCurrent\(\);/.test(k));
  check('pastilles avec croix et panier dans le bandeau', /peoplePillsHtml\(grp\.people, grp\.cart, grp\.current, 'kRemovePerson'\)/.test(k) && /cartButtonHtml\(grp\.cart\.length, 'kShowCart\(\)'\)/.test(k));
  check('durees toujours affichees : chaque personne, total du groupe, ticket', /formatMinutes\(e\.dur\) \+ ' · /.test(k) && /formatMinutes\(totDur\) \+ ' · '/.test(k) && /formatMinutes\(e\.total_duration_min\)/.test(k));
  check('inscription du groupe en une fois', /api\('\/api\/queue\/checkin-group'/.test(k));
  check('« Premier disponible » envoye sans coiffeur (seul ou a plusieurs)', /barber_id: selBarber \|\| null/.test(k) && /barber_id: e\.barber_id \|\| null/.test(k));
  check('inactivite en pleine inscription : avertissement 5 s puis remise a zero', /var IDLE_WARN_SEC = 5/.test(k) && /if \(!inKioskFlow\(\)\) return showIdleScreen\(\);/.test(k) && /if \(left <= 0\) \{ hideIdleWarn\(\); showIdleScreen\(\); \}/.test(k) && /id="idle-warn"/.test(k));
  check('toucher ou taper au clavier = le client est la', /\['click', 'touchstart', 'keydown', 'input'\]/.test(k) && /function stayOnKiosk\(\)/.test(k));
  check('« Client suivant » / veille : retour au 1er ecran', /grp = null; kNames = \[\];[\s\S]{0,400}show\('p-who'\);/.test(k));

  clean();
  console.log(`\n${pass} OK, ${fail} ECHEC`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
