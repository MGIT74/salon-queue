// Bouton reglages de la caisse + fenetre "Connexion TPE / imprimante" :
// pastille, contenu selon l'etat, bouton "Connecter", suivi en direct, et
// droits (un coiffeur ne recoit pas le debut de la cle). L'etat du pont est
// simule (reponses de /api/tpe/bridge-status) ; le reste est le vrai serveur.
const { JSDOM } = require('jsdom');
const { execSync } = require('child_process');
const BASE = 'http://127.0.0.1:3999';
const sql = (q) => execSync(`mariadb -uroot salonq -N -e "${q.replace(/"/g,'\\"')}"`).toString().trim();
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n + (x ? '  [' + x + ']' : '')); };
const BARBER = { 'Content-Type':'application/json','X-Salon-Slug':'test','X-Barber-Id':'b1','X-Barber-Pin':'1111' };
const ADMIN = { 'Content-Type':'application/json','X-Salon-Slug':'test','X-Admin-Password':'adminpw' };

(async () => {
  sql("DELETE FROM bridge_keys; DELETE FROM cash_closings;");

  console.log('\n[S] Droits : le debut de la cle n\'est visible que par l\'administrateur');
  await fetch(BASE + '/api/tpe/bridge-key', { method: 'POST', headers: ADMIN, body: '{}' });
  const asBarber = await (await fetch(BASE + '/api/tpe/bridge-status', { headers: BARBER })).json();
  const asAdmin = await (await fetch(BASE + '/api/tpe/bridge-status', { headers: ADMIN })).json();
  check('coiffeur (code PIN) : configured=true mais pas de debut de cle', asBarber.configured === true && asBarber.key_preview === null && asBarber.key_created_at === null, JSON.stringify(asBarber));
  check('administrateur : debut de cle et date presents', /^[0-9a-f]{6}\.\.\.$/.test(asAdmin.key_preview) && !!asAdmin.key_created_at, asAdmin.key_preview);

  console.log('\n[U] Ecran de caisse');
  let status = { ok: true, configured: true, online: false, tpe_online: false, last_seen_at: null };
  let statusCalls = 0;
  const dom = await JSDOM.fromURL(BASE + '/caisse.html?salon=test', {
    runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true,
    beforeParse(w) {
      w.sessionStorage.setItem('caisse-session', JSON.stringify({ id: 'b1', pin: '1111', name: 'Alice' }));
      w.fetch = async (url, opts = {}) => {
        const u = String(url);
        if (u.startsWith('/api/tpe/bridge-status')) { statusCalls++; return new Response(JSON.stringify(status), { status: 200, headers: { 'Content-Type': 'application/json' } }); }
        return fetch(u.startsWith('http') ? u : BASE + u, opts);
      };
      w.HTMLElement.prototype.scrollIntoView = () => {};
    }
  });
  const w = dom.window; await sleep(2000);
  const d = w.document;
  const clicked = []; d.addEventListener('click', (e) => { if (e.target.tagName === 'A') { clicked.push(e.target.getAttribute('href')); e.preventDefault(); } }, true);
  const toasts = []; const origToast = w.toast; w.toast = (m, err) => toasts.push({ m, err: !!err });
  const modalText = () => { const m = d.querySelectorAll('.modal-box'); return m.length ? m[m.length - 1].textContent : ''; };

  const gear = d.getElementById('conn-btn');
  check('l\'icone reglages existe dans l\'ecran connecte', !!gear && gear.closest('#app-screen') !== null);
  check('elle a un libelle accessible sans le mot "pont"', /TPE/.test(gear.getAttribute('aria-label')) && !/pont/i.test(gear.getAttribute('aria-label') + gear.title));
  check('pastille ROUGE sur l\'icone (installe mais hors ligne)', d.getElementById('conn-dot').classList.contains('is-offline'));

  console.log('\n[U1] Hors ligne');
  gear.click(); await sleep(300);
  check('la fenetre s\'ouvre', /Connexion TPE \/ imprimante/.test(modalText()));
  check('"Non connecte"', /Non connecté/.test(modalText()));
  check('"Non connecte" en rouge', d.querySelector('#conn-text span').style.color === 'var(--red)');
  check('les deux lignes Imprimante et Terminal de paiement', /Imprimante/.test(modalText()) && /Terminal de paiement/.test(modalText()));
  check('le bouton "Connecter" est visible', d.getElementById('conn-connect-btn').style.display === 'block' && /^Connecter$/.test(d.getElementById('conn-connect-btn').textContent.trim()));
  check('pastilles rouges dans la fenetre', d.getElementById('conn-dot-printer').classList.contains('is-offline') && d.getElementById('conn-dot-tpe').classList.contains('is-offline'));
  check('aucun "pont" dans la fenetre', !/\bpont\b/i.test(modalText()), (modalText().match(/\bpont\b/i) || [''])[0]);

  console.log('\n[U2] Le suivi se met a jour tout seul pendant que la fenetre est ouverte');
  status = { ok: true, configured: true, online: true, tpe_online: true };
  await sleep(3600);
  check('passe a "Tout est connecte" sans rien cliquer', /Tout est connecté/.test(modalText()));
  check('"Tout est connecte" en vert', d.querySelector('#conn-text span').style.color === 'var(--green)');
  check('le bouton "Connecter" disparait', d.getElementById('conn-connect-btn').style.display === 'none');
  check('pastilles vertes', d.getElementById('conn-dot-printer').classList.contains('is-online') && d.getElementById('conn-dot-tpe').classList.contains('is-online'));
  check('la pastille du bouton passe au vert aussi', d.getElementById('conn-dot').classList.contains('is-online'));

  console.log('\n[U3] Imprimante connectee mais terminal de paiement non configure');
  status = { ok: true, configured: true, online: true, tpe_online: false };
  await sleep(3600);
  check('message precis', /Imprimante connectée/.test(modalText()) && /terminal de paiement/.test(modalText()));
  check('imprimante verte, terminal rouge', d.getElementById('conn-dot-printer').classList.contains('is-online') && d.getElementById('conn-dot-tpe').classList.contains('is-offline'));
  const parts = d.querySelectorAll('#conn-text span');
  check('"Imprimante connectee" est en VERT', parts.length === 2 && /^Imprimante connectée$/.test(parts[0].textContent) && parts[0].style.color === 'var(--green)', parts[0] && parts[0].style.color);
  check('la suite (terminal de paiement) reste en ROUGE', /terminal de paiement pas encore configuré ou éteint/.test(parts[1].textContent) && parts[1].style.color === 'var(--red)', parts[1] && parts[1].style.color);
  check('la phrase se lit d\'un seul tenant', d.getElementById('conn-text').textContent === 'Imprimante connectée — terminal de paiement pas encore configuré ou éteint', d.getElementById('conn-text').textContent);

  console.log('\n[U4] Connexion jamais installee sur cet ordinateur');
  status = { ok: true, configured: false, online: false, tpe_online: false };
  await sleep(3600);
  check('explique quoi faire (voir l\'administrateur)', /administrateur/.test(modalText()));
  check('pas de bouton "Connecter"', d.getElementById('conn-connect-btn').style.display === 'none');
  check('pas de pastille sur l\'icone (rien a signaler)', !d.getElementById('conn-dot').classList.contains('is-online') && !d.getElementById('conn-dot').classList.contains('is-offline'));

  console.log('\n[U5] Bouton "Connecter" -> guide -> lien de lancement');
  status = { ok: true, configured: true, online: false, tpe_online: false };
  await sleep(3600);
  d.getElementById('conn-connect-btn').click(); await sleep(300);
  check('le guide s\'ouvre par-dessus', /Connecter le TPE et l'imprimante/.test(modalText()) && d.querySelectorAll('.modal-box').length === 2);
  d.getElementById('bridge-guide-go').click(); await sleep(400);
  check('le lien tpebridge://start est lance', clicked.length === 1 && clicked[0] === 'tpebridge://start', JSON.stringify(clicked));
  check('la fenetre de connexion reste ouverte (on la voit passer au vert)', d.querySelectorAll('.modal-box').length === 1 && /Connexion TPE/.test(modalText()));

  console.log('\n[U6] Fermeture : le suivi ralentit');
  d.getElementById('conn-close-btn').click(); await sleep(400);
  check('la fenetre se ferme', d.querySelectorAll('.modal-box').length === 0);
  const before = statusCalls; await sleep(4500);
  check('moins d\'une requete en 4,5 s (au lieu d\'une toutes les 3 s)', statusCalls - before <= 1, 'requetes=' + (statusCalls - before));
  gear.click(); await sleep(300);
  check('on peut la rouvrir', /Connexion TPE/.test(modalText()));
  d.getElementById('conn-close-btn').click(); await sleep(400);

  console.log('\n[V] L\'icone n\'apparait que sur l\'onglet Caisse');
  const shown = () => gear.style.display !== 'none';
  check('onglet Caisse (defaut) : visible', shown());
  for (const tab of ['agenda', 'timer', 'cloture']) {
    w.doSwitchCaisseTab(tab); await sleep(200);
    check('onglet ' + tab + ' : masquee', !shown());
  }
  w.doSwitchCaisseTab('caisse'); await sleep(200);
  check('retour sur Caisse : de nouveau visible', shown());
  w.doSwitchCaisseTab('agenda'); await sleep(200);
  w.switchCaisseTab('caisse'); await sleep(200);
  check('via le menu du bas (switchCaisseTab) : visible sur Caisse', shown());
  w.doSwitchCaisseTab('timer'); await sleep(200);
  const meBackup = w.me; w.logout(); await sleep(150);
  w.me = meBackup; w.showApp(); await sleep(300);
  check('un autre coiffeur se connecte alors que l\'onglet Timer est affiche : icone masquee', !shown());
  w.doSwitchCaisseTab('caisse'); await sleep(200);
  check('puis sur Caisse : visible', shown());

  console.log('\n[U7] Deconnexion du coiffeur : plus de suivi');
  w.logout(); await sleep(300);
  const c0 = statusCalls; await sleep(3500);
  check('plus aucune requete de statut apres la deconnexion', statusCalls === c0, 'requetes=' + (statusCalls - c0));
  check('l\'icone n\'est plus visible (ecran de connexion)', d.getElementById('app-screen').style.display === 'none');

  console.log(`\nRESULTAT : ${pass} verifications reussies, ${fail} echec(s)`);
  sql("DELETE FROM bridge_keys;");
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('ERREUR TEST', e); process.exit(2); });
