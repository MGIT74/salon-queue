// "Bienvenue, <nom>" du dashboard : doit afficher le nom du PROFIL de l'admin
// (Reglages > Mon profil), JAMAIS le nom de l'enseigne en attendant (ce
// clignotement a chaque rafraichissement se voyait et faisait amateur).
// Le texte reste invisible tant que le bon nom n'est pas connu ; le dernier
// nom connu est garde en memoire de session pour un affichage instantane.
// Le nom de l'enseigne n'est qu'un DERNIER recours. Execute la VRAIE fonction
// extraite du fichier, et enregistre chaque etat visible du texte.
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
const htmlSpan = src.match(/<span id="dash-welcome-name"[^>]*><\/span>/)[0];

// Lance la vraie fonction ; renvoie tout ce qui a ete VISIBLE a l'ecran, dans l'ordre.
async function run(apiImpl, opts) {
  opts = opts || {};
  const dom = new JSDOM('<h2>Bienvenue, ' + htmlSpan + '</h2>', { runScripts: 'outside-only', url: 'http://localhost/' });
  const w = dom.window;
  w.currentSalonName = 'TBO OYONNAX';
  w.SALON_SLUG = 'tbo';
  if (opts.cached) w.sessionStorage.setItem('welcome-name:tbo', opts.cached);
  w.api = apiImpl;
  const el = w.document.getElementById('dash-welcome-name');
  const seen = [];
  const snap = () => { if (el.style.visibility !== 'hidden' && el.textContent) { if (seen[seen.length - 1] !== el.textContent) seen.push(el.textContent); } };
  new w.MutationObserver(snap).observe(el, { childList: true, characterData: true, subtree: true, attributes: true });
  w.eval(fnSrc);
  w.loadWelcomeName();
  const visibleAtStart = el.style.visibility !== 'hidden' ? el.textContent : '(invisible)';
  await sleep(opts.wait || 40);
  snap();
  return { seen, visibleAtStart, final: el.style.visibility === 'hidden' ? '(invisible)' : el.textContent, cache: w.sessionStorage.getItem('welcome-name:tbo') };
}

(async () => {
  console.log('\n[A] Profil avec nom, aucun cache (1er chargement) : jamais le nom de l\'enseigne');
  let r = await run(() => new Promise(res => setTimeout(() => res({ ok: true, name: 'Mounir' }), 15)));
  check('au demarrage : INVISIBLE (aucun nom provisoire)', r.visibleAtStart === '(invisible)', r.visibleAtStart);
  check('affiche ensuite le nom du profil', r.final === 'Mounir', r.final);
  check('le nom de l\'enseigne n\'a JAMAIS ete visible', !r.seen.includes('TBO OYONNAX'), JSON.stringify(r.seen));
  check('nom du profil memorise pour les rafraichissements suivants', r.cache === 'Mounir', r.cache);

  console.log('\n[B] Rafraichissement (nom deja en memoire) : bon nom INSTANTANE, sans clignotement');
  r = await run(() => new Promise(res => setTimeout(() => res({ ok: true, name: 'Mounir' }), 15)), { cached: 'Mounir' });
  check('visible immediatement avec le bon nom', r.visibleAtStart === 'Mounir', r.visibleAtStart);
  check('une seule valeur visible pendant tout le chargement (pas de changement)', JSON.stringify(r.seen) === '["Mounir"]', JSON.stringify(r.seen));

  console.log('\n[C] Le nom du profil a change depuis la derniere visite : mis a jour, sans passer par l\'enseigne');
  r = await run(() => new Promise(res => setTimeout(() => res({ ok: true, name: 'Nouveau Nom' }), 15)), { cached: 'Mounir' });
  check('affiche finalement le nouveau nom', r.final === 'Nouveau Nom', r.final);
  check('sans jamais montrer l\'enseigne', !r.seen.includes('TBO OYONNAX'), JSON.stringify(r.seen));

  console.log('\n[D] Profil SANS nom : repli sur l\'enseigne (dernier recours), jamais vide');
  r = await run(() => Promise.resolve({ ok: true, name: null }));
  check('profil null -> enseigne', r.final === 'TBO OYONNAX', r.final);
  r = await run(() => Promise.resolve({ ok: true, name: '   ' }));
  check('profil en espaces -> enseigne', r.final === 'TBO OYONNAX', r.final);
  r = await run(() => Promise.resolve({ ok: true, name: null }), { cached: 'Ancien' });
  check('profil vide MAINTENANT : l\'ancien nom en memoire est oublie', r.final === 'TBO OYONNAX' && r.cache === null, r.final + ' / cache=' + r.cache);

  console.log('\n[E] Erreur serveur');
  r = await run(() => Promise.reject(new Error('Erreur interne du serveur')));
  check('sans memoire : repli sur l\'enseigne (jamais invisible a jamais)', r.final === 'TBO OYONNAX', r.final);
  r = await run(() => Promise.reject(new Error('Erreur interne du serveur')), { cached: 'Mounir' });
  check('avec memoire : on GARDE le nom deja affiche (pas de saut vers l\'enseigne)', r.final === 'Mounir' && !r.seen.includes('TBO OYONNAX'), JSON.stringify(r.seen));

  console.log('\n[F] Serveur qui ne repond pas : apres 3 s, repli sur l\'enseigne plutot qu\'un accueil vide');
  r = await run(() => new Promise(() => {}), { wait: 3300 });
  check('repli apres delai', r.final === 'TBO OYONNAX', r.final);

  console.log('\n[G] Le nom de l\'enseigne n\'est PAS touche ailleurs');
  check('le menu lateral lit toujours le nom de l\'enseigne', /sidebar-brand/.test(src) && /currentSalonName = name/.test(src));

  console.log(`\nRESULTAT : ${pass} verifications reussies, ${fail} echec(s)`);
  process.exit(fail ? 1 : 0);
})();
