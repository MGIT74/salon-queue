// Onglet Timer, section "A suivre" : ne doit plus masquer TOUTE la liste
// quand une prestation est deja en cours - elle doit rester visible (le
// coiffeur veut voir qui arrive), avec seulement le bouton "Commencer" du
// premier verrouille (impossible de commencer une nouvelle coupe avant que
// celle en cours soit terminee).
const { JSDOM } = require('jsdom');
const { execSync } = require('child_process');
const BASE = 'http://127.0.0.1:3999';
const sql = (q) => execSync(`mariadb -uroot salonq -e "${q.replace(/"/g,'\\"')}"`, { stdio: 'pipe' });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n + (x ? '  [' + x + ']' : '')); };

(async () => {
  sql("DELETE FROM queue WHERE salon_id = 's1'");
  sql("INSERT INTO queue (id,salon_id,client_name,barber_id,service_id,status,checkin_at,start_at,is_appointment,total_price_cents) VALUES ('q-encours','s1','Client En Cours','b1','sv1','in_progress',NOW(),NOW(),0,2000)");
  sql("INSERT INTO queue (id,salon_id,client_name,barber_id,service_id,status,checkin_at,is_appointment,total_price_cents) VALUES ('q-suivant1','s1','Client Suivant 1','b1','sv1','waiting',NOW(),0,2000)");
  sql("INSERT INTO queue (id,salon_id,client_name,barber_id,service_id,status,checkin_at,is_appointment,total_price_cents) VALUES ('q-suivant2','s1','Client Suivant 2','b1','sv1','waiting',DATE_ADD(NOW(), INTERVAL 1 MINUTE),0,2000)");

  const dom = await JSDOM.fromURL(BASE + '/caisse.html?salon=test', {
    runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true,
    beforeParse(w) {
      w.sessionStorage.setItem('caisse-session', JSON.stringify({ id: 'b1', pin: '1111', name: 'Alice' }));
      w.fetch = (u, o) => fetch(String(u).startsWith('http') ? u : BASE + u, o);
      w.HTMLElement.prototype.scrollIntoView = () => {};
    }
  });
  const w = dom.window; await sleep(2000);
  const d = w.document;
  w.doSwitchCaisseTab('timer'); await sleep(500);

  console.log('\n[A] Une prestation est en cours : la liste "A suivre" reste VISIBLE (plus de message qui la masque)');
  const zone = d.getElementById('next-zone');
  check('le message "Terminez la coupe..." n\'est PLUS affiche seul', !/Terminez la coupe en cours pour passer/.test(zone.textContent) || zone.querySelectorAll('.next-item').length > 0);
  check('les 2 clients suivants sont bien listes', zone.querySelectorAll('.next-item').length === 2, zone.querySelectorAll('.next-item').length);
  check('"Client Suivant 1" apparait en premier (ordre par heure d\'arrivee)', zone.querySelector('.next-item .name').textContent === 'Client Suivant 1');

  console.log('\n[B] Meme le PREMIER de la liste est verrouille (impossible de commencer avant la fin de la coupe en cours)');
  const firstCard = zone.querySelector('.next-item .next-card');
  check('la carte du premier est bien marquee "locked"', firstCard.classList.contains('locked'));
  check('aucun bouton "Commencer" nulle part dans la liste', !Array.from(zone.querySelectorAll('button')).some(function (b) { return /Commencer|Je prends/.test(b.textContent); }));
  check('le bouton "Absent" reste disponible (pas bloque par la coupe en cours)', zone.querySelectorAll('.next-item').length === Array.from(zone.querySelectorAll('button')).filter(function (b) { return b.textContent === 'Absent'; }).length);

  console.log('\n[C] Une fois la coupe en cours terminee, le PREMIER redevient cliquable, le second reste verrouille');
  sql("UPDATE queue SET status='done', end_at=NOW() WHERE id='q-encours'");
  w.queue = (await (await fetch(BASE + '/api/queue', { headers: { 'X-Salon-Slug': 'test', 'X-Barber-Id': 'b1', 'X-Barber-Pin': '1111' } })).json()).queue;
  w.renderNext(); await sleep(100);
  const cards = d.getElementById('next-zone').querySelectorAll('.next-card');
  check('le 1er n\'est plus verrouille', !cards[0].classList.contains('locked'));
  check('le 1er a bien un bouton "Commencer"', /Commencer/.test(cards[0].textContent));
  check('le 2e reste verrouille (un seul a la fois)', cards[1].classList.contains('locked'));

  sql("DELETE FROM queue WHERE salon_id = 's1'");
  console.log(`\nRESULTAT : ${pass} verifications reussies, ${fail} echec(s)`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('ERREUR TEST', e); process.exit(2); });
