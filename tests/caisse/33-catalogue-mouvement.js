// Deplacement des articles du catalogue : un VRAI mouvement. La ligne tenue SUIT le pointeur (soulevee), les
// autres lignes GLISSENT pour lui faire de la place (technique FLIP), la ligne SE POSE au relachement, et le
// reglage systeme "reduire les animations" est respecte. La fluidite elle-meme (positions image par image) est
// mesuree dans un vrai Chrome - trop lourd pour ce depot ; ici on garde les garde-fous et la logique.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '../../public/dashboard.html'), 'utf8');
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n + (x ? '  [' + x + ']' : '')); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
function fnSrc(name) { const i = src.indexOf('function ' + name + '('); if (i === -1) throw new Error('introuvable: ' + name); const j = src.indexOf('\nfunction ', i + 10); return src.slice(i, j === -1 ? undefined : j); }

console.log('\n[A] Les ingredients du mouvement sont en place');
check('ligne tenue : sans transition (suit le pointeur SANS retard), ombre, au-dessus', /\.item\.dragging \{ transition: none !important;[^}]*box-shadow[^}]*z-index: 5/.test(src));
check('ligne relachee : se pose en douceur (transition sur transform et ombre)', /\.item\.settling \{ transition: transform \.22s cubic-bezier\([^)]*\), box-shadow \.22s/.test(src));
check('"reduire les animations" respecte dans le style ET dans le script', /prefers-reduced-motion: reduce\) \{ \.item, \.item\.settling \{ transition: none !important; \}/.test(src) && /var calm = Boolean\(window\.matchMedia && window\.matchMedia\('\(prefers-reduced-motion: reduce\)'\)\.matches\)/.test(src));
const sortSrc = fnSrc('initCatalogSort');
check('la ligne tenue suit le pointeur (placeDragged) et les autres glissent (animateMove / FLIP)', /function placeDragged\(\)/.test(sortSrc) && /function animateMove\(mutate, except\)/.test(sortSrc) && /translateY\(' \+ d \+ 'px\)/.test(sortSrc));
check('la place est calculee SANS le glissement en cours (shiftOf) : pas de va-et-vient', /function shiftOf\(el\)/.test(sortSrc) && /r\.top - shiftOf\(items\[i\]\)/.test(sortSrc));
check('au relachement : la ligne se pose puis TOUT est nettoye (classe, decalage, ombre)', /classList\.add\('settling'\)/.test(sortSrc) && /classList\.remove\('settling'\); it\.style\.transform = ''; it\.style\.boxShadow = ''/.test(sortSrc));
check('le clavier glisse lui aussi (meme mecanique)', /animateMove\(function \(\) \{ if \(up\)/.test(sortSrc));

(async () => {
console.log('\n[B] Comportement (vraie fonction, mise en page simulee : lignes de 88 px)');
function make(calmMode, withLayout) {
  const dom = new JSDOM('<div id="services-list">' + ['a', 'b', 'c'].map(i => `<div class="item" data-id="${i}"><span class="drag-handle" tabindex="0"></span></div>`).join('') + '</div>', { runScripts: 'outside-only', url: 'http://localhost/' });
  const w = dom.window; w.__calls = [];
  if (calmMode !== undefined) w.matchMedia = () => ({ matches: calmMode });
  w.services = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]; w.extras = []; w.products = [];
  w.api = (p, o) => { w.__calls.push(o && o.body); return Promise.resolve({ ok: true }); }; w.toast = () => {}; w.loadCatalog = () => Promise.resolve();
  const list = w.document.getElementById('services-list');
  if (withLayout) [...list.querySelectorAll('.item')].forEach(el => { el.getBoundingClientRect = () => ({ top: [...list.children].indexOf(el) * 88, height: 80, left: 0, right: 0, bottom: 0, width: 0 }); });
  w.eval(fnSrc('persistCatalogOrder') + fnSrc('initCatalogSort')); w.initCatalogSort('services');
  return { w, list, order: () => [...list.querySelectorAll('.item')].map(e => e.dataset.id).join(''), key: (id, k) => list.querySelector(`[data-id="${id}"] .drag-handle`).dispatchEvent(new w.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true })) };
}
{
  const t = make(false, true);
  t.key('a', 'ArrowDown');
  check('mouvement normal : l\'ordre change (b, a, c)', t.order() === 'bac', t.order());
  const els = [...t.list.querySelectorAll('.item')];
  check('les lignes qui ont BOUGE (a et b) recoivent une transition de glissement', els.filter(e => /transform \.2s/.test(e.style.transition)).map(e => e.dataset.id).sort().join('') === 'ab', els.map(e => e.dataset.id + ':' + (e.style.transition || '-')).join(' '));
  check('la ligne qui n\'a PAS bouge (c) n\'est pas touchee', t.list.querySelector('[data-id="c"]').style.transition === '');
  await sleep(320);
  check('apres le glissement : plus de transition residuelle', [...t.list.querySelectorAll('.item')].every(e => e.style.transition === ''));
}
{
  const t = make(true, true);
  t.key('a', 'ArrowDown');
  check('"reduire les animations" : l\'ordre change quand meme (b, a, c)', t.order() === 'bac');
  check('...sans aucune transition ni decalage pose', [...t.list.querySelectorAll('.item')].every(e => e.style.transition === '' && e.style.transform === ''));
}
{
  const t = make(undefined, false);   // navigateur sans matchMedia (et sans mise en page) : ne doit pas planter
  t.key('c', 'ArrowUp'); t.key('c', 'ArrowUp');
  check('sans matchMedia ni mise en page : aucune erreur, ordre correct (c, a, b)', t.order() === 'cab', t.order());
  await sleep(750);
  check('et UNE sauvegarde de l\'ordre apres la serie de fleches', t.w.__calls.length === 1 && JSON.stringify(t.w.__calls[0].ids) === '["c","a","b"]', JSON.stringify(t.w.__calls));
}

console.log(`\nRESULTAT : ${pass} verifications reussies, ${fail} echec(s)`);
process.exit(fail ? 1 : 0);
})().catch(e => { console.error('ERREUR TEST', e); process.exit(2); });
