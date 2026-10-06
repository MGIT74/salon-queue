// Haut du menu lateral du dashboard : le LOGO de l'enseigne a la place du titre
// (qui doublait le selecteur juste en dessous). Repli sur le nom si l'enseigne
// n'a pas de logo ou si l'image est cassee. Jamais de texte provisoire, jamais
// le logo de l'enseigne precedente. Le nom reste lisible par le code qui
// l'utilise (ticket Z). Execute les VRAIES fonctions + le VRAI bloc HTML.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '../../public/dashboard.html'), 'utf8');
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n + (x ? '  [' + x + ']' : '')); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const block = src.match(/<div class="brand-head">[\s\S]*?<\/div>\s*<\/div>/)[0]; // brand-head + son contenu
const fnStart = src.indexOf('// Bloc du haut du menu lateral');
const fnEnd = src.indexOf('function loadCurrentSalonName()');
const fnSrc = src.slice(fnStart, fnEnd);
const loadStart = src.indexOf('function loadCurrentSalonName()');
const loadEnd = src.indexOf('\nfunction ', loadStart + 10);
const loadSrc = src.slice(loadStart, loadEnd);

const LOGO = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

function page(slug) {
  const dom = new JSDOM('<div class="sidebar-brand">' + block + '</div>', { runScripts: 'outside-only', url: 'http://localhost/' });
  const w = dom.window;
  w.SALON_SLUG = slug || 'oyonnax';
  w.applyAccentColor = () => {};
  w.eval(fnSrc);
  return w;
}
const logoEl = (w) => w.document.getElementById('app-salon-logo');
const nameEl = (w) => w.document.getElementById('app-salon-badge');
const shown = (el) => el.style.display !== 'none';

(async () => {
  console.log('\n[A] Etat initial (avant toute reponse) : rien d\'affiche, pas de texte provisoire');
  let w = page();
  check('logo masque', !shown(logoEl(w)));
  check('nom masque et vide (plus de "Dashboard" provisoire)', !shown(nameEl(w)) && nameEl(w).textContent === '', JSON.stringify(nameEl(w).textContent));

  console.log('\n[B] Enseigne AVEC logo : le logo, et plus le nom');
  w = page(); w.applySidebarBrand('TBO OYONNAX', LOGO);
  check('le logo est visible, avec sa source', shown(logoEl(w)) && logoEl(w).getAttribute('src') === LOGO);
  check('le texte du nom n\'est PAS affiche (redondant avec le selecteur)', !shown(nameEl(w)));
  check('le nom reste lisible par le code qui le lit (ticket Z)', nameEl(w).textContent === 'TBO OYONNAX', nameEl(w).textContent);
  check('texte alternatif = nom de l\'enseigne (accessibilite)', logoEl(w).alt === 'TBO OYONNAX');

  console.log('\n[C] Enseigne SANS logo : repli sur le nom (jamais un bloc vide)');
  w = page(); w.applySidebarBrand('TBO VALLEIRY', '');
  check('le nom est affiche', shown(nameEl(w)) && nameEl(w).textContent === 'TBO VALLEIRY');
  check('aucune image', !shown(logoEl(w)) && !logoEl(w).hasAttribute('src'));

  console.log('\n[D] Logo illisible (lien casse) : repli sur le nom plutot qu\'une image vide');
  w = page(); w.applySidebarBrand('TBO OYONNAX', 'https://exemple.invalid/casse.png');
  logoEl(w).onerror();
  check('image masquee, nom affiche', !shown(logoEl(w)) && shown(nameEl(w)) && nameEl(w).textContent === 'TBO OYONNAX');

  console.log('\n[E] Changement d\'enseigne : jamais le logo de la precedente');
  w = page('oyonnax'); w.applySidebarBrand('TBO OYONNAX', LOGO);
  w.SALON_SLUG = 'valleiry';                       // switchSalon change le slug...
  w.fetch = () => new Promise(() => {});           // ...et la reponse n'est pas encore arrivee
  w.eval(loadSrc); w.loadCurrentSalonName();       // vraie fonction : applique le cache de CETTE enseigne (aucun)
  check('le logo de l\'enseigne precedente a disparu', !shown(logoEl(w)) && !logoEl(w).hasAttribute('src'));
  check('et aucun nom provisoire non plus', !shown(nameEl(w)) && nameEl(w).textContent === '');

  console.log('\n[F] Rafraichissement : dernier logo connu affiche TOUT DE SUITE (memoire de session)');
  w = page('oyonnax');
  w.sessionStorage.setItem('salon-brand:oyonnax', JSON.stringify({ name: 'TBO OYONNAX', logo: LOGO }));
  w.fetch = () => new Promise(() => {});
  w.eval(loadSrc); w.loadCurrentSalonName();
  check('logo visible immediatement, avant la reponse du serveur', shown(logoEl(w)) && logoEl(w).getAttribute('src') === LOGO);

  console.log('\n[G] Reponse du serveur : affichage + memorisation (vraie fonction de chargement)');
  w = page('oyonnax');
  w.fetch = () => Promise.resolve({ json: () => Promise.resolve({ salon_name: 'TBO OYONNAX', logo_url: LOGO }) });
  w.eval(loadSrc); w.loadCurrentSalonName(); await sleep(40);
  check('logo affiche apres la reponse', shown(logoEl(w)) && logoEl(w).getAttribute('src') === LOGO);
  check('memorise pour les rafraichissements suivants', JSON.parse(w.sessionStorage.getItem('salon-brand:oyonnax')).logo === LOGO);
  w = page('oyonnax');
  w.fetch = () => Promise.resolve({ json: () => Promise.resolve({ salon_name: 'TBO OYONNAX', logo_url: null }) });
  w.sessionStorage.setItem('salon-brand:oyonnax', JSON.stringify({ name: 'TBO OYONNAX', logo: LOGO }));
  w.eval(loadSrc); w.loadCurrentSalonName(); await sleep(40);
  check('logo SUPPRIME cote serveur : on retombe sur le nom (le cache est mis a jour)', !shown(logoEl(w)) && shown(nameEl(w)) && JSON.parse(w.sessionStorage.getItem('salon-brand:oyonnax')).logo === '');

  console.log('\n[H] Le reste de la page est intact');
  check('le selecteur d\'enseigne est toujours dans le bloc', /<select id="salon-switcher"/.test(src));
  check('printZTicket lit toujours le nom dans #app-salon-badge', /getElementById\('app-salon-badge'\)\.textContent/.test(src));

  console.log(`\nRESULTAT : ${pass} verifications reussies, ${fail} echec(s)`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('ERREUR TEST', e); process.exit(2); });
