// Un client SANS rendez-vous, une fois demarre par le coiffeur (vrai
// start_at, vraie duree), doit apparaitre sur la frise horaire de
// l'Agenda comme un vrai RDV - pendant qu'il est en cours ET une fois
// termine (tout l'historique du jour). Jamais s'il est encore en
// attente (pas encore demarre, pas de vrai horaire a lui donner).
const { JSDOM } = require('jsdom');
const { execSync } = require('child_process');
const BASE = 'http://127.0.0.1:3999';
const sql = (q) => execSync(`mariadb -uroot salonq -e "${q.replace(/"/g,'\\"')}"`, { stdio: 'pipe' });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n + (x ? '  [' + x + ']' : '')); };

(async () => {
  sql("DELETE FROM queue WHERE salon_id='s1'");

  // Un client en cours (demarre il y a 5 min), un termine (demarre il y a
  // 40 min, fini il y a 10 min), et un encore en ATTENTE (jamais demarre -
  // ne doit jamais apparaitre sur la frise, il n'a pas de vrai horaire).
  sql("INSERT INTO queue (id,salon_id,client_name,barber_id,service_id,status,checkin_at,start_at,is_appointment,total_price_cents) VALUES ('q-encours','s1','Client En Cours','b1','sv1','in_progress',NOW(),DATE_SUB(NOW(), INTERVAL 5 MINUTE),0,2000)");
  sql("INSERT INTO queue (id,salon_id,client_name,barber_id,service_id,status,checkin_at,start_at,end_at,is_appointment,total_price_cents) VALUES ('q-termine','s1','Client Termine','b1','sv1','done',NOW(),DATE_SUB(NOW(), INTERVAL 40 MINUTE),DATE_SUB(NOW(), INTERVAL 10 MINUTE),0,2000)");
  sql("INSERT INTO queue (id,salon_id,client_name,barber_id,service_id,status,checkin_at,is_appointment,total_price_cents) VALUES ('q-attente','s1','Client En Attente','b1','sv1','waiting',NOW(),0,2000)");

  const dom = await JSDOM.fromURL(BASE + '/caisse.html?salon=test', {
    runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true,
    beforeParse(w) {
      w.sessionStorage.setItem('caisse-session', JSON.stringify({ id: 'b1', pin: '1111', name: 'Alice' }));
      w.fetch = (u, o) => fetch(String(u).startsWith('http') ? u : BASE + u, o);
      w.HTMLElement.prototype.scrollIntoView = () => {};
    }
  });
  const w = dom.window, d = w.document;
  await sleep(1500);
  w.doSwitchCaisseTab('agenda'); await sleep(300);

  const today = new Date().toISOString().slice(0, 10);
  w.calAnchor = new Date(today + 'T00:00:00');
  w.calViewMode = 'day';
  w.activeBarberId = null; // "Tous" - voir tout le monde
  await w.loadAgendaPeriod ? new Promise(r => { const check = () => { if (Object.keys(w.calQueueById).length || true) r(); }; w.loadAgendaPeriod(); setTimeout(check, 900); }) : null;
  await sleep(200);

  const view = d.getElementById('cal-day-view');

  console.log('\n[A] Le client EN COURS apparait sur la frise');
  check('"Client En Cours" present sur la frise', /Client En Cours/.test(view.innerHTML));

  console.log('\n[B] Le client deja TERMINE apparait AUSSI (tout l\'historique du jour)');
  check('"Client Termine" present sur la frise', /Client Termine/.test(view.innerHTML));

  console.log('\n[C] Le client encore EN ATTENTE (jamais demarre) N\'apparait PAS');
  check('"Client En Attente" absent de la frise', !/Client En Attente/.test(view.innerHTML));

  console.log('\n[D] Cliquer le bloc "Client En Cours" ouvre une fiche simple avec les bonnes infos');
  var block = Array.from(view.querySelectorAll('.timeline-block')).find(function (el) { return el.textContent.indexOf('Client En Cours') !== -1; });
  check('le bloc existe et est cliquable', Boolean(block));
  if (block) {
    block.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    await sleep(100);
    var modal = d.querySelector('.modal-overlay .modal-title');
    check('la fiche affiche bien le nom du client', modal && modal.textContent === 'Client En Cours', modal && modal.textContent);
    check('la fiche precise "sans rendez-vous"', /sans rendez-vous/.test(d.body.textContent));
    check('la fiche indique le statut "En cours"', /En cours/.test(d.body.textContent));
  }

  sql("DELETE FROM queue WHERE salon_id='s1'");
  console.log(`\nRESULTAT : ${pass} verifications reussies, ${fail} echec(s)`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('ERREUR TEST', e); process.exit(2); });
