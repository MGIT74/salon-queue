// Mon poste > Agenda : même planning (timeline par coiffeur) que le tableau de bord, RDV de TOUS les coiffeurs,
// et ajout d'un RDV au nom d'un collègue (clic sur sa ligne) depuis son propre poste.
const { execSync } = require('child_process');
const fs = require('fs');
const BASE = 'http://127.0.0.1:3999';
const sql = (q) => execSync(`mariadb -uroot salonq -N -e "${q.replace(/"/g, '\\"')}"`).toString().trim();
const ALICE = { 'Content-Type': 'application/json', 'X-Salon-Slug': 'test', 'X-Barber-Id': 'b1', 'X-Barber-Pin': '1111' };
let pass = 0, fail = 0;
const check = (n, ok, extra) => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n + (ok || extra === undefined ? '' : '  -> ' + JSON.stringify(extra))); };

(async () => {
  const D = new Date(Date.now() + 4 * 86400000).toISOString().slice(0, 10);
  const clean = "DELETE FROM appointments WHERE id LIKE 't106%' OR client_name LIKE 'T106%'";
  sql(clean);
  sql("UPDATE barbers SET accepts_appointments=1, active=1 WHERE id IN ('b1','b2'); DELETE FROM barber_schedules WHERE barber_id IN ('b1','b2')");
  sql("INSERT INTO barber_schedules (id,barber_id,weekday,start_time,end_time,active) SELECT UUID(),b.id,d.n,'09:00','19:00',1 FROM barbers b JOIN (SELECT 0 n UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5 UNION SELECT 6) d WHERE b.id IN ('b1','b2')");
  sql(`INSERT INTO appointments (id,salon_id,barber_id,client_name,service_id,scheduled_at,status,cancel_token) VALUES ('t106a','s1','b2','T106 Marco','sv1','${D} 13:50:00','confirmed','t106a')`);

  const month = D.slice(0, 7);
  let r = await fetch(BASE + '/api/appointments?month=' + month + '&all=1&caisse_view=1', { headers: ALICE }).then((x) => x.json());
  check('Alice (code PIN) voit aussi le RDV de Bob dans l\'agenda', (r.items || []).some((a) => a.id === 't106a' && a.barber_id === 'b2'));

  const av = await fetch(BASE + '/api/appointments/availability?date=' + D + '&service_id=sv1&barber_id=b2', { headers: Object.assign({ 'X-Acting-As-Barber-Id': 'b2' }, ALICE) }).then((x) => x.json());
  const T = (av.slots || []).find((s) => s.time >= '15:00');
  const res = await fetch(BASE + '/api/appointments/admin-create', { method: 'POST', headers: Object.assign({ 'X-Acting-As-Barber-Id': 'b2' }, ALICE),
    body: JSON.stringify({ client_name: 'T106 Client de Bob', service_id: 'sv1', barber_id: 'b2', date: D, time: T && T.time }) });
  check('Alice ajoute un RDV au nom de Bob depuis son poste : enregistré chez Bob', res.status === 200 && sql("SELECT barber_id FROM appointments WHERE client_name='T106 Client de Bob'") === 'b2', await res.json().catch(() => null));

  const poste = fs.readFileSync(__dirname + '/../../public/poste.html', 'utf8');
  check('agenda : RDV de tous les coiffeurs (caisse_view=1)', /\/api\/appointments\?month=' \+ k \+ '&all=1&caisse_view=1'/.test(poste));
  check('jour choisi : planning en timeline par coiffeur (comme le tableau de bord), avec zoom et légende', /function renderAgendaTimeline\(dateStr\)/.test(poste) && /renderCalExpandPanel[\s\S]{0,600}renderAgendaTimeline\(dateStr\)/.test(poste) && /timeline-zoom-ctrl/.test(poste) && /poste-tl-legend/.test(poste) && /\.timeline-block \{/.test(poste));
  check('une ligne par coiffeur qui prend des RDV (moi en premier), clic sur la ligne = RDV pour ce coiffeur', /function posteTimelineBarbers/.test(poste) && /openPosteAddAppointment\(\\'' \+ dateStr \+ '\\',\\'' \+ b\.id \+ '\\'\)/.test(poste));
  check('RDV pour un collègue : son nom dans le titre, créneaux et enregistrement à son nom (en-tête « agit pour »)', /function openPosteAddAppointment\(dateStr, barberId\)/.test(poste) && /X-Acting-As-Barber-Id/.test(poste) && /actingAs: targetId,   \/\/ RDV au nom du coiffeur choisi/.test(poste) && /barber_id: targetId,/.test(poste));
  check('fiche du RDV : nom du coiffeur ; note interne d\'un collègue non modifiable ici', /<span class="detail-label">Coiffeur<\/span>/.test(poste) && /RDV d\\'un collègue : sa note interne se modifie depuis son poste/.test(poste));

  sql(clean);
  console.log('\nRESULTAT : ' + pass + ' verifications reussies, ' + fail + ' echec(s)');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
