// Guide "Connecter le TPE et l'imprimante" (partage caisse + dashboard, dans
// app.js) : contenu, lancement du lien tpebridge://start, memorisation de
// "Ne plus afficher", annulation. Utilise le VRAI app.js charge par une page.
const { JSDOM } = require('jsdom');
const BASE = 'http://127.0.0.1:3999';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n + (x ? '  [' + x + ']' : '')); };
const open = async () => {
  const dom = await JSDOM.fromURL(BASE + '/kiosk.html?salon=test', { runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true, beforeParse(win) { win.fetch = () => new Promise(() => {}); } });
  await sleep(1000); return dom.window;
};

(async () => {
  const w = await open();
  const clicked = [];
  w.document.addEventListener('click', (e) => { const el = e.target; if (el && el.tagName === 'A') { clicked.push(el.getAttribute('href')); e.preventDefault(); } }, true);
  const toasts = []; w.toast = (m, err) => toasts.push({ m, err: !!err });

  console.log('\n[1] Premier clic : le guide s\'affiche AVANT la demande du navigateur');
  w.startBridgeFlow(); await sleep(250);
  const box = w.document.querySelector('.modal-box');
  check('la fenetre du guide apparait', !!box && /Connecter le TPE et l'imprimante/.test(box.textContent));
  check('elle explique ce qu\'il faut COCHER', /Cochez/.test(box.textContent) && /Toujours autoriser/.test(box.textContent));
  check('elle nomme le bouton que Chrome affichera', /Ouvrir Microsoft Windows Based Script Host/.test(box.textContent));
  check('2 etapes numerotees', box.querySelectorAll('.bridge-guide-steps li').length === 2);
  check('le mot "pont" n\'apparait pas cote utilisateur', !/\bpont\b/i.test(box.textContent), box.textContent.match(/\bpont\b/i));
  check('le lien n\'est PAS encore lance (on attend "Continuer")', clicked.length === 0);

  console.log('\n[2] Annuler');
  w.document.getElementById('bridge-guide-cancel').click(); await sleep(350);
  check('la fenetre se ferme', !w.document.querySelector('.modal-box'));
  check('aucun lien lance', clicked.length === 0);

  console.log('\n[3] Continuer (sans cocher "Ne plus afficher")');
  w.startBridgeFlow(); await sleep(250);
  w.document.getElementById('bridge-guide-go').click(); await sleep(350);
  check('le lien tpebridge://start est clique une fois', clicked.length === 1 && clicked[0] === 'tpebridge://start', JSON.stringify(clicked));
  check('message "Connexion demandee"', toasts.some(t => /Connexion demandée/.test(t.m) && !/pont/i.test(t.m)));
  check('rien n\'est memorise', w.localStorage.getItem('bridge-start-guide-hidden') === null);
  check('le lien temporaire est retire de la page', !w.document.querySelector('a[href="tpebridge://start"]'));
  w.startBridgeFlow(); await sleep(250);
  check('au clic suivant le guide REAPPARAIT', !!w.document.querySelector('.modal-box'));
  w.document.getElementById('bridge-guide-cancel').click(); await sleep(350);

  console.log('\n[4] Continuer AVEC "Ne plus afficher ce guide"');
  clicked.length = 0;
  w.startBridgeFlow(); await sleep(250);
  w.document.getElementById('bridge-guide-never').checked = true;
  w.document.getElementById('bridge-guide-go').click(); await sleep(350);
  check('le lien est lance', clicked.length === 1);
  check('le choix est memorise', w.localStorage.getItem('bridge-start-guide-hidden') === '1');
  clicked.length = 0;
  w.startBridgeFlow(); await sleep(250);
  check('ensuite : PAS de guide, lancement direct', !w.document.querySelector('.modal-box') && clicked.length === 1 && clicked[0] === 'tpebridge://start');

  console.log('\n[5] Stockage du navigateur indisponible (mode prive strict) : ne doit pas planter');
  const w2 = await open();
  const c2 = []; w2.document.addEventListener('click', (e) => { if (e.target.tagName === 'A') { c2.push(e.target.getAttribute('href')); e.preventDefault(); } }, true);
  w2.toast = () => {};
  Object.defineProperty(w2, 'localStorage', { get() { throw new Error('SecurityError'); } });
  let threw = false; try { w2.startBridgeFlow(); await sleep(250); w2.document.getElementById('bridge-guide-never').checked = true; w2.document.getElementById('bridge-guide-go').click(); await sleep(300); } catch (e) { threw = true; }
  check('aucune exception, le lien est quand meme lance', !threw && c2.length === 1);

  console.log(`\nRESULTAT : ${pass} verifications reussies, ${fail} echec(s)`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('ERREUR TEST', e); process.exit(2); });
