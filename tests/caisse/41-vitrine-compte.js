// Page "Mon compte" (compte.html), reservation du client connecte - SUPPLEMENTS et PRODUITS (meme rendu que rdv.html, test 40) : "c'est la vitrine du salon". Avant : une masse de puces de largeurs
// inegales (noms longs deformes, 25 produits sans repere, bouton "Suivant" tout en bas). Maintenant : cartes regulieres (photo ou
// icone), prix en evidence, bouton + qui devient une coche, recherche des qu'il y a plus de 8 articles, produits regroupes par
// categorie, "Epuise" / "Plus que N", et une barre du bas qui resume le choix (nombre, duree, prix) avec "Suivant" toujours visible.
// Execute les VRAIES fonctions de la page.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const rdv = fs.readFileSync(path.join(__dirname, '../../public/compte.html'), 'utf8');
const app = fs.readFileSync(path.join(__dirname, '../../public/app.js'), 'utf8');
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n + (x ? '  [' + x + ']' : '')); };
// Une fonction va de "function nom(" a sa PROPRE accolade fermante (ligne "}") : jamais jusqu'a la suivante.
const fnSrc = (src, name) => { const i = src.indexOf('function ' + name + '('); if (i === -1) throw new Error('introuvable: ' + name); const j = src.indexOf('\n}\n', i); return src.slice(i, j + 3); };
const IMG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

function page(extras, products, opts) {
  opts = opts || {};
  const dom = new JSDOM('<button id="bk-service-next-btn"></button><div id="bk-svc-grid"></div>' +
    ['extras', 'products'].map(k => '<div id="bk-' + k + '-search" style="display:none"><input id="bk-' + k + '-q"></div><div id="bk-' + k + '-grid"></div><div id="bk-' + k + '-empty"></div><div id="bk-' + k + '-summary"></div>').join(''),
    { runScripts: 'outside-only', url: 'http://localhost/' });
  const w = dom.window;
  w.eval(fnSrc(app, 'esc'));
  w.formatMinutes = (m) => { m = Number(m); return m >= 60 ? Math.floor(m / 60) + 'h' + (m % 60 ? String(m % 60).padStart(2, '0') : '') : m + ' min'; };
  w.eur = (c) => (c / 100).toFixed(2).replace('.', ',') + ' €';
  w.bookServices = opts.services || []; w.bookExtras = extras; w.bookProducts = products;
  const vars = rdv.match(/^var PLUS_SVG = .*;$/m)[0] + '\n' + rdv.match(/^var CHECK_SVG = .*;$/m)[0] + '\n' + rdv.match(/^var CHECK_SM_SVG = .*;$/m)[0] + '\n';
  w.eval('var selBookService = null, selBookExtras = ' + JSON.stringify(opts.selExtras || []) + ', selBookProducts = ' + JSON.stringify(opts.selProducts || []) + ';\n' + vars +
    ['iconForItem', 'renderBookServiceGrid', 'bookServiceCardHtml', 'normText', 'extraIcon', 'productIcon', 'groupItems', 'bookItemCardHtml', 'renderBookItemList', 'updateBookItemsSummary', 'filterBookItems', 'toggleBookExtra', 'toggleBookProduct'].map(n => fnSrc(rdv, n)).join('\n'));
  w.renderBookServiceGrid();
  return w;
}
const $$ = (w, sel) => [...w.document.querySelectorAll(sel)];
const E = (id, name, min, cents, extra) => Object.assign({ id, name, duration_min: min, price_cents: cents }, extra || {});
const P = (id, name, cents, extra) => Object.assign({ id, name, price_cents: cents }, extra || {});

(async () => {
  console.log('\n[A] Supplements : une carte reguliere par article (photo ou icone), prix et duree en evidence');
  const EXTRAS = [E('e1', 'Bougie oreilles', 10, 500), E('e2', 'Coloration barbe', 15, 1000), E('e3', 'Épilation cire ( oreilles, pommettes, nez)', 10, 500),
    E('e4', 'Défrisage', 15, 1000), E('e5', 'Mèches blondes long', 80, 5000, { image_url: IMG }), E('e6', 'Soin visage (serviette chaude)', 15, 1000), E('e7', 'Sion cheveux', 0, 400),
    E('e8', 'Mèches blanches long', 150, 13000), E('e9', 'Mèches marron', 30, 3000)];
  let w = page(EXTRAS, []);
  let cards = $$(w, '#bk-extras-grid .item-card');
  check('9 supplements -> 9 cartes, dans l\'ordre du catalogue', cards.length === 9 && cards.map(c => c.dataset.id).join() === 'e1,e2,e3,e4,e5,e6,e7,e8,e9');
  check('chaque carte : nom, prix precede de "+", duree ("+10 min", "+2h30")', cards[0].querySelector('.item-name').textContent === 'Bougie oreilles' && cards[0].querySelector('.item-price').textContent === '+5,00 €' && cards[0].querySelector('.item-meta').textContent === '+10 min' && cards[7].querySelector('.item-meta').textContent === '+2h30');
  check('duree absente (0 min) : pas de ligne de duree vide', !cards[6].querySelector('.item-meta'));
  check('supplement AVEC photo : photo en vignette (carte "has-photo"), pas d\'icone', cards[4].classList.contains('has-photo') && cards[4].querySelector('.item-media').getAttribute('style').includes(IMG) && cards[4].querySelector('.item-media').textContent === '');
  check('supplement SANS photo : icone choisie d\'apres le nom', cards[0].querySelector('.item-media').textContent === '🕯️' && cards[1].querySelector('.item-media').textContent === '🎨' && cards[2].querySelector('.item-media').textContent === '✨' && cards[3].querySelector('.item-media').textContent === '💇');
  check('chaque carte porte le bouton + ET la coche (la coche n\'apparait qu\'une fois choisi, par le style)', cards.every(c => c.querySelector('.item-add .ic-plus') && c.querySelector('.item-add .ic-check')));
  check('nom complet en infobulle (le nom affiche est limite a 3 lignes)', cards[2].getAttribute('title') === 'Épilation cire ( oreilles, pommettes, nez)');
  check('ce sont de vrais boutons (clavier / lecteur d\'ecran), non pressés au depart', cards.every(c => c.tagName === 'BUTTON' && c.getAttribute('aria-pressed') === 'false'));

  console.log('\n[B] Choisir / retirer : etat, accessibilite et resume en bas');
  const sum = () => w.document.getElementById('bk-extras-summary');
  check('rien de choisi : "Aucun supplement choisi" + "Facultatif" (on peut passer l\'etape)', /Aucun supplément choisi/.test(sum().textContent) && /Facultatif/.test(sum().textContent) && !sum().classList.contains('has'));
  w.toggleBookExtra(cards[1], 'e2');
  check('1 choisi : carte "sel", aria-pressed=true, resume "1 supplement · +15 min · +10,00 €"', cards[1].classList.contains('sel') && cards[1].getAttribute('aria-pressed') === 'true' && /1 supplément(?!s)/.test(sum().textContent) && /\+15 min · \+10,00 €/.test(sum().textContent), sum().textContent);
  w.toggleBookExtra(cards[7], 'e8'); w.toggleBookExtra(cards[4], 'e5');
  check('3 choisis : "3 supplements", durees ET prix additionnes (+15 + 150 + 80 = +4h05 ; 10 + 130 + 50 = 190 €)', /3 suppléments/.test(sum().textContent) && /\+4h05 · \+190,00 €/.test(sum().textContent), sum().textContent);
  w.toggleBookExtra(cards[7], 'e8');
  check('un retire : carte desélectionnée, resume recalcule (2 suppléments, +1h35 · +60,00 €)', !cards[7].classList.contains('sel') && cards[7].getAttribute('aria-pressed') === 'false' && /2 suppléments/.test(sum().textContent) && /\+1h35 · \+60,00 €/.test(sum().textContent), sum().textContent);
  check('la liste des choix de la reservation suit (e2, e5)', w.eval('selBookExtras').join() === 'e2,e5');
  w.toggleBookExtra(cards[1], 'e2'); w.toggleBookExtra(cards[4], 'e5');
  check('tout retire : retour a "Aucun supplement choisi"', /Aucun supplément choisi/.test(sum().textContent));
  w = page(EXTRAS, [], { selExtras: ['e2', 'e4'] });
  check('on revient sur l\'etape / on reaffiche la liste : les choix deja faits restent marques et comptes', $$(w, '#bk-extras-grid .item-card.sel').map(c => c.dataset.id).join() === 'e2,e4' && /2 suppléments/.test(w.document.getElementById('bk-extras-summary').textContent));

  console.log('\n[C] Recherche (des que la liste depasse 8 articles)');
  w = page(EXTRAS, []);
  check('9 supplements : le champ de recherche est affiche', w.document.getElementById('bk-extras-search').style.display === '');
  w = page(EXTRAS.slice(0, 8), []);
  check('8 supplements ou moins : pas de champ de recherche (inutile)', w.document.getElementById('bk-extras-search').style.display === 'none');
  w = page(EXTRAS, []);
  const search = (q) => { w.document.getElementById('bk-extras-q').value = q; w.filterBookItems('extras'); return $$(w, '#bk-extras-grid .item-card').filter(c => !c.hidden).map(c => c.dataset.id).join(); };
  check('"meches" (sans accent) retrouve les 3 "Mèches"', search('meches') === 'e5,e8,e9', search('meches'));
  check('"MÈCHES BL" (majuscules, accents) : 2 resultats', search('MÈCHES BL') === 'e5,e8');
  check('"epilation" retrouve "Épilation cire (...)"', search('epilation') === 'e3');
  check('aucun resultat : message "Aucun resultat pour « zzz »" affiche', search('zzz') === '' && w.document.getElementById('bk-extras-empty').style.display === 'block' && /Aucun résultat pour « zzz »/.test(w.document.getElementById('bk-extras-empty').textContent));
  check('champ vide : tout reapparait, message masque', search('') === 'e1,e2,e3,e4,e5,e6,e7,e8,e9' && w.document.getElementById('bk-extras-empty').style.display === 'none');
  w.document.getElementById('bk-extras-q').value = 'meches'; w.filterBookItems('extras'); w.toggleBookExtra($$(w, '#bk-extras-grid .item-card')[4], 'e5');
  check('un choix fait pendant une recherche est bien pris en compte', w.eval('selBookExtras').join() === 'e5' && /1 supplément/.test(w.document.getElementById('bk-extras-summary').textContent));

  console.log('\n[D] Produits : icones, categories, stock');
  const PRODUCTS = [P('p1', 'Canette RedBull Myrtille', 250), P('p2', 'Eau', 100, { stock_enabled: 1, stock_quantity: 0 }), P('p3', 'Pago', 150, { stock_enabled: 1, stock_quantity: 2 }),
    P('p4', 'Cire nishman', 1000), P('p5', 'Shampoing argan', 1000), P('p6', 'Fibre capillaire', 1500, { image_url: IMG }), P('p7', 'Poudre coiffante', 1000), P('p8', 'Beaute du jour', 900),
    P('p9', 'Huile à barbe', 1200), P('p10', 'Truc', 500)];
  w = page([], PRODUCTS);
  cards = $$(w, '#bk-products-grid .item-card');
  const ic = (id) => cards.find(c => c.dataset.id === id).querySelector('.item-media').textContent;
  check('icones par produit : boisson 🥤, shampoing 🚿, cire 🧴, poudre ✨, huile 💧, inconnu 🛍️', ic('p1') === '🥤' && ic('p5') === '🚿' && ic('p4') === '🧴' && ic('p7') === '✨' && ic('p9') === '💧' && ic('p10') === '🛍️');
  check('"Beaute du jour" n\'est PAS pris pour de l\'eau (mot entier seulement)', ic('p8') === '🛍️');
  check('produit avec photo : vignette ; prix sans "+" (c\'est un achat, pas un supplement)', cards.find(c => c.dataset.id === 'p6').classList.contains('has-photo') && cards[0].querySelector('.item-price').textContent === '2,50 €');
  const out = cards.find(c => c.dataset.id === 'p2'), low = cards.find(c => c.dataset.id === 'p3');
  check('produit EN RUPTURE (stock suivi, 0) : carte desactivee "Épuisé", pas de bouton +, non cliquable', out.disabled && out.classList.contains('out') && /Épuisé/.test(out.textContent) && !out.querySelector('.item-add') && !out.getAttribute('onclick'));
  check('produit presque epuise (2) : "Plus que 2", toujours achetable', /Plus que 2/.test(low.textContent) && !low.disabled);
  check('stock NON suivi : jamais "Epuise" (comportement inchange)', !cards.find(c => c.dataset.id === 'p4').disabled);
  check('aucune categorie renseignee : liste simple, sans titre', $$(w, '#bk-products-grid .item-group').length === 0);
  w.toggleBookProduct(cards[0], 'p1'); w.toggleBookProduct(low, 'p3');
  check('resume des produits : "2 produits · 4,00 €" (pas de duree)', /2 produits/.test(w.document.getElementById('bk-products-summary').textContent) && /4,00 €/.test(w.document.getElementById('bk-products-summary').textContent) && !/min/.test(w.document.getElementById('bk-products-summary').textContent), w.document.getElementById('bk-products-summary').textContent);
  w = page([], [P('a', 'Cire 1', 1000, { category: 'Cires' }), P('b', 'Gel 1', 1000, { category: 'Gels' }), P('c', 'Cire 2', 1000, { category: 'Cires' }), P('d', 'Sans categorie', 500), P('e', 'Cire 3', 1000, { category: ' Cires ' })]);
  const kids = [...w.document.getElementById('bk-products-grid').children].map(n => n.classList.contains('item-group') ? '#' + n.textContent : n.dataset.id);
  check('categories renseignees : un titre par categorie (ordre d\'apparition), articles regroupes, "Autres" en dernier', kids.join(' ') === '#Cires a c e #Gels b #Autres d', kids.join(' '));
  w.document.getElementById('bk-products-q').value = 'gel'; w.filterBookItems('products');
  check('recherche "gel" : seuls le titre et l\'article concernes restent visibles', [...w.document.getElementById('bk-products-grid').children].filter(n => !n.hidden).map(n => n.classList.contains('item-group') ? '#' + n.textContent : n.dataset.id).join(' ') === '#Gels b');
  w = page([], [P('x', 'constructor', 100, { category: 'constructor' }), P('y', 'toString', 100, { category: 'toString' })]);
  check('une categorie nommee "constructor" / "toString" ne casse rien', [...w.document.getElementById('bk-products-grid').children].length === 4);

  console.log('\n[E] Listes vides et securite');
  w = page([], []);
  check('aucun supplement / produit : message clair (au lieu d\'un blanc), l\'etape reste franchissable', /Aucun supplément disponible/.test(w.document.getElementById('bk-extras-empty').textContent) && w.document.getElementById('bk-extras-empty').style.display === 'block' && /Aucun produit disponible/.test(w.document.getElementById('bk-products-empty').textContent));
  w = page([E('x1', '"><img src=x onerror=alert(1)>', 5, 100, { image_url: 'https://x.example/a.png"onerror="alert(1)' })], [P('x2', '<script>alert(1)</script>', 100, { category: '"><svg onload=alert(1)>' })]);
  check('noms, categories et adresses d\'image piegees : aucune balise ni attribut injecte', !w.document.querySelector('#bk-extras-grid img, #bk-products-grid img, #bk-products-grid svg[onload], script') && !w.document.querySelector('[onerror], [onload]') && w.document.querySelector('#bk-extras-grid .item-name').textContent === '"><img src=x onerror=alert(1)>' && w.document.querySelector('#bk-products-grid .item-group').textContent === '"><svg onload=alert(1)>');
  const evilCard = w.document.querySelector('#bk-extras-grid .item-card');
  check('la carte piegee ne porte QUE les attributs prevus (aucun attribut injecte) ; le texte de recherche reste du simple texte', [...evilCard.attributes].map(a => a.name).sort().join() === 'aria-pressed,class,data-id,data-name,onclick,title,type' && evilCard.getAttribute('data-name') === '"><img src=x onerror=alert(1)>');

  console.log('\n[F] Style (vitrine)');
  const must = [['grille reguliere', /\.item-grid \{ display: grid; grid-template-columns: repeat\(auto-fill, minmax\(150px, 1fr\)\)/], ['nom limite a 3 lignes', /\.item-name \{[^}]*-webkit-line-clamp: 3/], ['carte choisie : anneau + fond teinte aux couleurs du salon (--accent)', /\.item-card\.sel \{ background: rgba\(var\(--accent-rgb\), \.13\)/],
    ['anneau de selection pose par-dessus (::after)', /\.item-card\.sel::after \{[^}]*box-shadow: inset 0 0 0 2\.5px var\(--accent\)/], ['coche a la place du + quand choisi', /\.item-card\.sel \.ic-check \{ display: block; \}/],
    ['barre du bas collee (sticky)', /\.step-bar \{ position: sticky; bottom: 0;/], ['html "visible" pour que le sticky fonctionne malgre app.css', /html \{ overflow-x: visible; \}/], ['champ de recherche a 16 px (pas de zoom sur telephone)', /\.items-search input \{[^}]*font-size: 16px/],
    ['produit epuise grise', /\.item-card\.out \.item-media, \.item-card\.out \.item-name, \.item-card\.out \.item-price \{ opacity: \.45; \}/], ['les anciennes puces ont disparu', /^(?![\s\S]*xchip)/]];
  for (const [n, re] of must) check(n, re.test(rdv));
  check('chaque etape a sa barre (resume + Suivant) et son champ de recherche', ['extras', 'products'].every(k => new RegExp('id="bk-' + k + '-summary"').test(rdv) && new RegExp('id="bk-' + k + '-search"').test(rdv)) && (rdv.match(/class="step-bar"/g) || []).length === 2);

  console.log('\n[G] "Mon compte" : prestations a photo + remise a zero d\'une nouvelle reservation');
  w = page([], [], { services: [{ id: 's1', name: 'Barbe premium', duration_min: 20, price_cents: 1300, image_url: IMG }, { id: 's2', name: 'Coupe homme', duration_min: 25, price_cents: 1500, image_url: null }] });
  const sv = $$(w, '#bk-svc-grid .item-card');
  check('prestation AVEC photo : photo EN HAUT, nom / duree / prix EN DESSOUS (jamais sur le dessin) ; SANS photo : icone par defaut', sv[0].classList.contains('has-photo') && sv[0].querySelector('.item-media').getAttribute('style').includes(IMG) && !sv[0].querySelector('.item-media .item-name') && sv[0].querySelector('.item-body .item-name').textContent === 'Barbe premium' && sv[0].querySelector('.item-meta').textContent === '20 min' && /13,00 €/.test(sv[0].querySelector('.item-price').textContent) && !sv[1].classList.contains('has-photo') && sv[1].querySelector('.item-media').textContent.length > 0);
  check('carte choisie : anneau ::after + coche ronde affichee seulement sur la carte choisie', /\.item-card\.sel::after \{[^}]*z-index: 2/.test(rdv) && /\.item-card\.sel \.item-check \{ display: flex; \}/.test(rdv) && !/\.svc-card\.has-photo/.test(rdv));
  w = page(EXTRAS, [], { selExtras: ['e2', 'e4'], services: [{ id: 's1', name: 'Coupe', duration_min: 10, price_cents: 1000 }] });
  check('une reservation en cours : suppléments e2 et e4 marques, resume "2 suppléments"', $$(w, '#bk-extras-grid .item-card.sel').length === 2 && /2 suppléments/.test(w.document.getElementById('bk-extras-summary').textContent));
  w.eval('selBookExtras = []; selBookProducts = []; selBookService = null;'); w.renderBookServiceGrid();
  check('NOUVELLE reservation (choix remis a zero puis liste reaffichee) : plus aucune carte surlignee, resume "Aucun supplément choisi"', $$(w, '#bk-extras-grid .item-card.sel').length === 0 && /Aucun supplément choisi/.test(w.document.getElementById('bk-extras-summary').textContent));
  check('...et le code de compte.html reaffiche bien les listes aux deux endroits ou la reservation est remise a zero', (rdv.match(/renderBookServiceGrid\(\);\s*\/\/ (les cartes|une nouvelle reservation)/g) || []).length === 2);
  check('le bouton "Suivant" des prestations suit la selection (desactive tant qu\'aucune prestation n\'est choisie)', w.document.getElementById('bk-service-next-btn').disabled === true);

  const cRule = (() => { const i = rdv.indexOf('.item-card.has-photo .item-media {'); return i === -1 ? '' : rdv.slice(i, rdv.indexOf('}', i)); })();
  check('"Mon compte" : vignette d\'image en "contain" sur fond blanc (image entiere, jamais recadree), pas "cover"', /background-size: contain/.test(cRule) && /background-repeat: no-repeat/.test(cRule) && /background-color: #fff/.test(cRule) && !/cover/.test(cRule), cRule.replace(/\s+/g, ' ').slice(0, 160));

  console.log(`\nRESULTAT : ${pass} verifications reussies, ${fail} echec(s)`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('ERREUR TEST', e); process.exit(2); });
