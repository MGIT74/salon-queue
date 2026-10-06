// "Mon poste" (poste.html) : le catalogue etait garde A VIE apres le 1er chargement, donc un ordre (ou prix,
// stock) change dans l'administration n'apparaissait qu'apres rechargement de la page. Il est desormais relu
// au plus toutes les 15 s (refresh() tourne toutes les 4 s). Execute la VRAIE fonction refresh().
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '../../public/poste.html'), 'utf8');
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n + (x ? '  [' + x + ']' : '')); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
function fnSrc(name) { const i = src.indexOf('function ' + name + '('); if (i === -1) throw new Error('introuvable: ' + name); const j = src.indexOf('\nfunction ', i + 10); return src.slice(i, j === -1 ? undefined : j); }
const refreshSrc = 'var catalogLoadedAt = 0;\n' + src.slice(src.indexOf('function refresh()'), src.indexOf('\n/**', src.indexOf('function refresh()')));

function make() {
  const dom = new JSDOM('<div></div>', { runScripts: 'outside-only', url: 'http://localhost/' });
  const w = dom.window; w.__calls = []; w.__toasts = []; w.__now = 1000000; w.__catalog = ['B', 'C', 'A'];
  w.Date = Object.assign(function () { return new Date(w.__now); }, { now: () => w.__now });
  w.me = { id: 'b1' }; w.renderActive = () => {}; w.renderNext = () => {}; w.toast = (m, e) => w.__toasts.push({ m, e: !!e });
  w.barberApi = (p) => {
    w.__calls.push(p);
    if (w.__fail && /catalog/.test(p)) return Promise.reject(new Error('Erreur interne du serveur'));
    if (p === '/api/queue') return Promise.resolve({ queue: [] });
    if (p === '/api/barbers') return Promise.resolve({ items: [] });
    return Promise.resolve({ items: w.__catalog.map(id => ({ id })) });
  };
  w.eval('var extras = [], services = [], products = [], queue = [], barbers = [];\n' + refreshSrc);
  return w;
}
const catalogCalls = (w) => w.__calls.filter(c => /catalog/.test(c)).length;
const ids = (w) => w.eval('extras.map(function (x) { return x.id; }).join("")');

(async () => {
  console.log('\n[A] Cadence de relecture du catalogue');
  const w = make();
  await w.refresh();
  check('1er passage : les 3 listes du catalogue sont lues', catalogCalls(w) === 3 && ids(w) === 'BCA', catalogCalls(w) + ' requetes');
  w.__now += 4000; await w.refresh();
  check('4 s plus tard : PAS de relecture inutile (file et coiffeurs seulement)', catalogCalls(w) === 3);
  w.__now += 4000; await w.refresh(); w.__now += 4000; await w.refresh();
  check('12 s apres : toujours pas', catalogCalls(w) === 3);

  console.log('\n[B] L\'ordre change dans l\'admin : "Mon poste" le reprend, sans recharger la page');
  w.__catalog = ['A', 'B', 'C']; w.__now += 4000; await w.refresh();   // 16 s apres la lecture
  check('au-dela de 15 s : le catalogue est relu (3 nouvelles requetes)', catalogCalls(w) === 6, String(catalogCalls(w)));
  check('et la liste suit le nouvel ordre A, B, C', ids(w) === 'ABC', ids(w));
  w.__catalog = ['C', 'A', 'B']; w.__now += 4000; await w.refresh();
  check('4 s apres cette relecture : pas de nouvelle requete, ancien ordre encore en memoire', catalogCalls(w) === 6 && ids(w) === 'ABC');

  console.log('\n[C] Echec de lecture : on ne perd rien et on reessaie');
  w.__now += 20000; w.__fail = true; w.__toasts.length = 0; await w.refresh();
  check('echec serveur : message d\'erreur', w.__toasts.length === 1 && w.__toasts[0].e);
  check('...les listes deja affichees sont CONSERVEES (pas videes)', ids(w) === 'ABC', ids(w));
  const n = catalogCalls(w); w.__fail = false; w.__now += 4000; await w.refresh();
  check('...et au tour suivant (4 s) on reessaie tout de suite, sans attendre 15 s de plus', catalogCalls(w) === n + 3 && ids(w) === 'CAB', catalogCalls(w) - n + ' requetes, ordre ' + ids(w));

  console.log('\n[D] REGRESSION evitee : le catalogue est lu DES l\'ouverture de la page (connexion automatique)');
  // La connexion automatique appelle boot() -> refresh() pendant le chargement du script. Si la variable de
  // suivi n'etait declaree qu'APRES cet appel, elle valait "indefinie" : la comparaison etait fausse et la 1re
  // lecture du catalogue etait SAUTEE (listes vides ~4 s a chaque ouverture) - c'est ce que le test 21 a revele.
  const iDecl = src.indexOf('var catalogLoadedAt'), iBoot = src.indexOf('boot();');   // 1er appel reel (la definition s'ecrit "function boot() {")
  check('la variable de suivi est declaree AVANT la connexion automatique (boot())', iDecl !== -1 && iBoot !== -1 && iDecl < iBoot, 'declaration ' + iDecl + ' < boot ' + iBoot);
  const wu = make(); wu.eval('catalogLoadedAt = undefined;');           // pire cas : variable pas encore initialisee
  await wu.refresh();
  check('meme si la variable est indefinie : le catalogue est lu tout de suite (3 requetes)', catalogCalls(wu) === 3 && wu.eval('extras.length') === 3, catalogCalls(wu) + ' requetes');
  const live = await JSDOM.fromURL('http://127.0.0.1:3999/poste.html?salon=test', {
    runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true,
    beforeParse(w) { w.sessionStorage.setItem('poste-session', JSON.stringify({ id: 'b1', pin: '1111', name: 'Alice' })); w.fetch = (u, o) => fetch(String(u).startsWith('http') ? u : 'http://127.0.0.1:3999' + u, o); w.HTMLElement.prototype.scrollIntoView = () => {}; }
  });
  await sleep(1300);   // bien AVANT le 2e tour de refresh() (4 s)
  const lw = live.window;
  // Ce que renvoie reellement le serveur (la base de test peut n'avoir aucun supplement) : la page doit avoir EXACTEMENT ca.
  const expected = {};
  for (const k of ['services', 'extras', 'products']) expected[k] = (await (await fetch('http://127.0.0.1:3999/api/catalog/' + k, { headers: { 'X-Salon-Slug': 'test' } })).json()).items.length;
  const got = lw.eval('({ services: services.length, extras: extras.length, products: products.length })');
  check('vraie page, vrai serveur : 1,3 s apres l\'ouverture, les 3 listes sont DEJA chargees (= ce que renvoie le serveur)', expected.services > 0 && JSON.stringify(got) === JSON.stringify(expected), 'page ' + JSON.stringify(got) + ' / serveur ' + JSON.stringify(expected));
  live.window.close();

  console.log('\n[E] Le reste de la page est intact');
  check('refresh() tourne toujours toutes les 4 s', /setInterval\(refresh, 4000\)/.test(src));
  check('plus aucun "garde a vie" du catalogue dans la page', !/extras\.length \? Promise\.resolve/.test(src) && !/services\.length \? Promise\.resolve/.test(src) && !/products\.length \? Promise\.resolve/.test(src));

  console.log(`\nRESULTAT : ${pass} verifications reussies, ${fail} echec(s)`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('ERREUR TEST', e); process.exit(2); });
