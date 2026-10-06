// "Bienvenue, <nom>" du dashboard : doit afficher le nom du PROFIL de l'admin
// (Reglages > Mon profil), pas celui de l'enseigne - qui reste affiche partout
// ailleurs. Repli sur le nom de l'enseigne si le profil n'a pas de nom ou si
// la lecture echoue. Execute la VRAIE fonction extraite du fichier.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '../../public/dashboard.html'), 'utf8');
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n + (x ? '  [' + x + ']' : '')); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const fnStart = src.indexOf('function loadWelcomeName()');
const fnEnd = src.indexOf('\nfunction ', fnStart + 10);
const fnSrc = src.slice(fnStart, fnEnd);

async function run(apiImpl) {
  const dom = new JSDOM('<h2>Bienvenue, <span id="dash-welcome-name">—</span></h2>', { runScripts: 'outside-only' });
  const w = dom.window;
  w.currentSalonName = 'TBO OYONNAX';
  w.api = apiImpl;
  w.eval(fnSrc);
  w.loadWelcomeName();
  const initial = w.document.getElementById('dash-welcome-name').textContent;
  await sleep(30);
  return { initial, final: w.document.getElementById('dash-welcome-name').textContent };
}

(async () => {
  console.log('\n[A] Le profil a un nom -> "Bienvenue, Mounir" (pas le nom de l\'enseigne)');
  let r = await run(() => Promise.resolve({ ok: true, name: 'Mounir', email: 'x@y.z' }));
  check('affiche le nom du profil', r.final === 'Mounir', r.final);
  check('en attendant la reponse, jamais vide : nom de l\'enseigne', r.initial === 'TBO OYONNAX', r.initial);

  console.log('\n[B] Profil sans nom (null / vide / espaces) -> repli sur le nom de l\'enseigne');
  r = await run(() => Promise.resolve({ ok: true, name: null }));
  check('nom null -> enseigne', r.final === 'TBO OYONNAX', r.final);
  r = await run(() => Promise.resolve({ ok: true, name: '   ' }));
  check('nom en espaces -> enseigne', r.final === 'TBO OYONNAX', r.final);

  console.log('\n[C] Lecture du profil en echec -> repli sur l\'enseigne, aucune erreur');
  r = await run(() => Promise.reject(new Error('Erreur interne du serveur')));
  check('erreur API -> enseigne', r.final === 'TBO OYONNAX', r.final);

  console.log('\n[D] Le nom de l\'enseigne n\'est PAS touche ailleurs (menu lateral inchange)');
  check('le menu lateral lit toujours currentSalonName / le selecteur d\'enseigne', /sidebar-brand/.test(src) && /currentSalonName = name/.test(src));

  console.log(`\nRESULTAT : ${pass} verifications reussies, ${fail} echec(s)`);
  process.exit(fail ? 1 : 0);
})();
