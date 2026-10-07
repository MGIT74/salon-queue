// Les assistants "Ajouter un RDV" du TABLEAU DE BORD (menu RDV, depuis le calendrier) et de "MON POSTE", ainsi que la BORNE, affichaient
// encore les anciennes puces / cartes de texte. Ils utilisent maintenant les memes cartes de vitrine que la reservation en ligne (code
// dans app.js, style dans app.css) : photo ou icone en haut, texte dessous, recherche, resume, "Epuise". Vraies fonctions des pages.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const R = (f) => fs.readFileSync(path.join(__dirname, '../../public', f), 'utf8');
const dash = R('dashboard.html'), poste = R('poste.html'), caisse = R('caisse.html'), kiosk = R('kiosk.html'), app = R('app.js'), css = R('app.css');
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n + (x ? '  [' + x + ']' : '')); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const fnSrc = (src, name) => { const i = src.indexOf('function ' + name + '('); if (i === -1) throw new Error('introuvable: ' + name); const j = src.indexOf('\n}\n', i); return src.slice(i, j + 3); };
const IMG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const SHARED = ['esc', 'normText', 'vitrineIcon', 'vitrineBaseIcon', 'extraIcon', 'productIcon', 'groupItems', 'vitrineCardHtml', 'vitrineRender', 'vitrineSummary', 'vitrineFilter', 'vitrineSelectOne', 'vitrineToggle', 'vitrineSearchHtml', 'formatMinutes', '_lockBodyScroll', '_unlockBodyScroll', '_buildModal', '_closeModal'];
const VARS = ['VITRINE_PLUS_SVG', 'VITRINE_CHECK_SVG', 'VITRINE_CHECK_SM_SVG'].map(n => app.match(new RegExp('^var ' + n + ' = .*;$', 'm'))[0]).join('\n');

function world(html) {
  const dom = new JSDOM(html || '<body></body>', { runScripts: 'outside-only', url: 'http://localhost/', pretendToBeVisual: true });
  const w = dom.window;
  w.eval("var _modalLockCount = 0, _modalScrollY = 0, CURRENCY = 'EUR'; function eur(c) { return (c / 100).toFixed(2).replace('.', ',') + ' €'; }\n" + VARS + '\n' + SHARED.map(n => fnSrc(app, n)).join('\n'));
  w.scrollTo = () => {};
  return w;
}
const CATALOG = {
  services: [{ id: 'sv1', name: 'Barbe premium', duration_min: 20, price_cents: 1300, image_url: IMG }, { id: 'sv2', name: 'Coupe homme', duration_min: 25, price_cents: 1500, image_url: null }],
  extras: ['Bougie oreilles', 'Coloration barbe', 'Épilation cire', 'Défrisage', 'Mèches blondes long', 'Soin visage', 'Sion cheveux', 'Mèches blanches', 'Mèches marron'].map((n, i) => ({ id: 'e' + (i + 1), name: n, duration_min: 10 + i, price_cents: 500 + i * 100, image_url: i === 4 ? IMG : null })),
  products: [{ id: 'p1', name: 'Cire nishman', price_cents: 1000, category: 'Cires' }, { id: 'p2', name: 'Eau', price_cents: 100, stock_enabled: 1, stock_quantity: 0, category: 'Boissons' }, { id: 'p3', name: 'Gel keratin', price_cents: 1000, category: 'Gels' }]
};
function setup(w, extraGlobals) {
  w.services = CATALOG.services; w.extras = CATALOG.extras; w.products = CATALOG.products;
  w.calls = [];
  w.api = (u) => { w.calls.push(u); return Promise.resolve({ slots: [] }); }; w.barberApi = w.api;
  w.attachClientAutocomplete = () => {}; w.toast = () => {};
  Object.assign(w, extraGlobals || {});
}
const visible = (w, id) => w.document.getElementById(id).style.display !== 'none';

(async () => {
  console.log('\n[A] Tableau de bord - menu RDV : assistant "Ajouter un RDV" (depuis le calendrier)');
  let w = world();
  setup(w, { barbers: [{ id: 'b1', name: 'Alice' }, { id: 'b2', name: 'Bob' }], isBookableForAdmin: () => true });
  w.eval(fnSrc(dash, 'openAdminAddAppointment') + '\nvar aaBarbersPreselected = null;');
  w.openAdminAddAppointment('2026-10-08', 'b1');
  let d = w.document;
  check('coiffeur deja connu (clic sur sa ligne) : on saute a l\'etape Prestation', visible(w, 'aa-step-service') && !visible(w, 'aa-step-barber'));
  check('etape Coiffeur INCHANGEE (cartes de texte .aa-card)', d.querySelectorAll('#aa-step-barber .aa-card').length === 2);
  let sv = [...d.querySelectorAll('#aa-service-grid .item-card')];
  check('prestations : cartes de vitrine (compactes), dans l\'ordre du catalogue', sv.length === 2 && sv[0].dataset.id === 'sv1' && d.getElementById('aa-service-grid').classList.contains('compact'));
  check('prestation AVEC photo : image EN HAUT, nom / duree / prix EN DESSOUS (jamais sur le dessin)', sv[0].classList.contains('has-photo') && sv[0].children[0].classList.contains('item-media') && sv[0].children[1].classList.contains('item-body') && sv[0].querySelector('.item-body .item-name').textContent === 'Barbe premium' && sv[0].querySelector('.item-meta').textContent === '20 min' && sv[0].querySelector('.item-price').textContent === '13,00 €');
  check('prestation SANS photo : icone par defaut (le tableau de bord n\'a pas sa propre fonction : celle du code partage)', !sv[1].classList.contains('has-photo') && sv[1].querySelector('.item-media').textContent.length > 0 && !sv[1].querySelector('.item-media').getAttribute('style'));
  check('le clic appelle bien aaSelectService(this)', sv[0].getAttribute('onclick') === 'aaSelectService(this)');
  w.aaSelectService(sv[0]);
  check('choisir une prestation : carte marquee (aria-pressed), coche, et on passe aux supplements', sv[0].classList.contains('sel') && sv[0].getAttribute('aria-pressed') === 'true' && visible(w, 'aa-step-extras') && !visible(w, 'aa-step-service'));
  let ex = [...d.querySelectorAll('#aa-extras-grid .item-card')];
  check('9 supplements en cartes ; recherche affichee (plus de 8) ; prix precede de "+" et duree', ex.length === 9 && d.getElementById('aa-extras-search').style.display === '' && ex[0].querySelector('.item-price').textContent === '+5,00 €' && ex[0].querySelector('.item-meta').textContent === '+10 min');
  check('supplement avec photo : vignette ; sans photo : icone d\'apres le nom (bougie)', ex[4].classList.contains('has-photo') && ex[0].querySelector('.item-media').textContent === '🕯️');
  check('barre du bas (resume + Suivant) dans l\'etape, resume vide : "Aucun supplement choisi"', !!d.querySelector('#aa-step-extras .step-bar button') && /Aucun supplément choisi/.test(d.getElementById('aa-extras-summary').textContent));
  w.aaToggleExtra(ex[1]); w.aaToggleExtra(ex[3]);
  check('2 supplements touches : resume "2 supplements +24 min · +14,00 €" (11 + 13 min ; 6 + 8 EUR), cartes marquees', /2 suppléments/.test(d.getElementById('aa-extras-summary').textContent) && /\+24 min · \+14,00 €/.test(d.getElementById('aa-extras-summary').textContent) && ex[1].classList.contains('sel') && ex[3].getAttribute('aria-pressed') === 'true', d.getElementById('aa-extras-summary').textContent);
  d.getElementById('aa-extras-q').value = 'meches'; w.aaFilter('extras');
  check('recherche "meches" (sans accent) : 3 resultats', [...d.querySelectorAll('#aa-extras-grid .item-card')].filter(c => !c.hidden).length === 3);
  d.getElementById('aa-extras-q').value = ''; w.aaFilter('extras');
  w.aaGoStep('products');
  const pr = [...d.querySelectorAll('#aa-products-grid .item-card')];
  check('produits : regroupes par categorie (Cires, Boissons, Gels), "Epuise" non cliquable', [...d.querySelectorAll('#aa-products-grid .item-group')].map(g => g.textContent).join() === 'Cires,Boissons,Gels' && pr.find(c => c.dataset.id === 'p2').disabled && /Épuisé/.test(pr.find(c => c.dataset.id === 'p2').textContent));
  w.aaToggleProduct(pr.find(c => c.dataset.id === 'p3'));
  check('produit touche : resume "1 produit 10,00 €"', /1 produit/.test(d.getElementById('aa-products-summary').textContent) && /10,00 €/.test(d.getElementById('aa-products-summary').textContent));
  w.aaGoStep('datetime');
  const url = w.calls.find(u => /availability/.test(u)) || '';
  check('les choix partent bien au serveur : prestation sv1, coiffeur b1, supplements e2 et e4', /service_id=sv1/.test(url) && /barber_id=b1/.test(url) && /extras=e2,e4/.test(url), url);
  check('plus aucune ancienne puce (.aa-chip) dans la fenetre', !d.querySelector('.aa-chip, .aa-chips'));

  console.log('\n[B] Mon poste : assistant "Ajouter un RDV" (le coiffeur, pour lui-meme)');
  w = world(); setup(w, { me: { id: 'b1', name: 'Alice' } });   // "me" : le coiffeur connecte a Mon poste
  w.eval(fnSrc(poste, 'openPosteAddAppointment'));
  w.openPosteAddAppointment('2026-10-08'); d = w.document;
  sv = [...d.querySelectorAll('#pa-service-grid .item-card')];
  check('prestations en cartes de vitrine : image en haut, texte dessous ; etape Prestation affichee d\'emblee', sv.length === 2 && visible(w, 'pa-step-service') && sv[0].children[0].classList.contains('item-media') && sv[0].querySelector('.item-body .item-name').textContent === 'Barbe premium');
  w.paSelectService(sv[1]);
  check('choisir : carte marquee et etape Supplements', sv[1].classList.contains('sel') && visible(w, 'pa-step-extras'));
  ex = [...d.querySelectorAll('#pa-extras-grid .item-card')];
  w.paToggleExtra(ex[2]); w.paToggleExtra(ex[2]); w.paToggleExtra(ex[5]);
  check('supplements : bascule (touche deux fois = retire), resume exact : 1 supplement ' + '+15 min · +10,00 €', /1 supplément/.test(d.getElementById('pa-extras-summary').textContent) && /\+15 min · \+10,00 €/.test(d.getElementById('pa-extras-summary').textContent), d.getElementById('pa-extras-summary').textContent);
  d.getElementById('pa-extras-q').value = 'zzz'; w.paFilter('extras');
  check('recherche sans resultat : message "Aucun resultat pour « zzz »"', /Aucun résultat pour « zzz »/.test(d.getElementById('pa-extras-empty').textContent) && d.getElementById('pa-extras-empty').style.display === 'block');
  w.paGoStep('datetime');
  const purl = w.calls.find(u => /availability/.test(u)) || '';
  check('les choix partent bien au serveur : prestation sv2 et supplement e6', /service_id=sv2/.test(purl) && /extras=e6/.test(purl), purl);
  check('plus aucune ancienne puce ni carte de texte pour la prestation', !d.querySelector('.aa-chip, .aa-chips, #pa-step-service .aa-card'));

  console.log('\n[B2] Caisse : assistant "Ajouter un RDV" depuis l\'Agenda (meme assistant que Mon poste)');
  w = world(); setup(w, { me: { id: 'b1', name: 'Alice' }, allBarbers: [{ id: 'b1', name: 'Alice' }], catalog: CATALOG });
  w.eval(fnSrc(caisse, 'openCaisseAddAppointment'));
  w.openCaisseAddAppointment('2026-10-08', 'b1'); d = w.document;
  sv = [...d.querySelectorAll('#pa-service-grid .item-card')];
  check('caisse : prestations en cartes de vitrine, image en haut et texte dessous, etape Prestation affichee', sv.length === 2 && visible(w, 'pa-step-service') && sv[0].children[0].classList.contains('item-media') && sv[0].querySelector('.item-body .item-name').textContent === 'Barbe premium');
  w.paSelectService(sv[0]);
  ex = [...d.querySelectorAll('#pa-extras-grid .item-card')];
  w.paToggleExtra(ex[0]); w.paToggleExtra(ex[1]);
  check('caisse : supplements en cartes, resume "2 supplements +21 min · +11,00 €" (10 + 11 min ; 5 + 6 EUR)', ex.length === 9 && /2 suppléments/.test(d.getElementById('pa-extras-summary').textContent) && /\+21 min · \+11,00 €/.test(d.getElementById('pa-extras-summary').textContent), d.getElementById('pa-extras-summary').textContent);
  w.paGoStep('products'); w.paToggleProduct([...d.querySelectorAll('#pa-products-grid .item-card')].find(c => c.dataset.id === 'p3')); w.paGoStep('datetime');
  const curl = w.calls.find(u => /availability/.test(u)) || '';
  check('caisse : les choix partent bien au serveur (prestation sv1, supplements e1 et e2)', /service_id=sv1/.test(curl) && /extras=e1,e2/.test(curl), curl);
  check('caisse : plus aucune ancienne puce ni carte de texte', !d.querySelector('.aa-chip, .aa-chips, #pa-step-service .aa-card'));

  console.log('\n[C] Borne : prestations et supplements en cartes de vitrine');
  const kHtml = '<body><input id="f-name" value="Adel"><button id="step1-next-btn" disabled></button><div class="item-grid" id="svc-grid"></div><div class="item-grid" id="extras-grid"></div><span id="tot-dur"></span><span id="tot-price"></span></body>';
  w = world(kHtml);
  w.services = CATALOG.services; w.extras = CATALOG.extras.slice(0, 4); w.barbers = [{ id: 'b1', name: 'Alice', disabled_service_ids: [], disabled_extra_ids: ['e2'] }];
  w.eval('var selBarber = null, selService = null, selExtras = [];\n' + ['iconForItem', 'renderFormOptions', 'selectService', 'updateStep1NextState', 'toggleExtra', 'renderTotals'].map(n => fnSrc(kiosk, n)).join('\n') +
    '\nfunction svcById(id) { return services.find(function (s) { return s.id === id; }); } function extById(id) { return extras.find(function (e) { return e.id === id; }); }');
  w.eval("selBarber = 'b1';"); w.renderFormOptions(); d = w.document;
  sv = [...d.querySelectorAll('#svc-grid .item-card')];
  check('prestations en cartes de vitrine : image entiere EN HAUT, texte DESSOUS ; plus d\'ancien rendu texte-sur-photo', sv.length === 2 && sv[0].classList.contains('has-photo') && sv[0].children[0].classList.contains('item-media') && !d.querySelector('#svc-grid .photo-bg, #svc-grid .overlay'));
  check('l\'icone propre a la borne reste utilisee pour une prestation sans photo', sv[1].querySelector('.item-media').textContent === w.iconForItem('Coupe homme'));
  ex = [...d.querySelectorAll('#extras-grid .item-card')];
  check('supplements en cartes ; celui desactive pour ce coiffeur (e2) n\'est pas propose : 3 sur 4', ex.length === 3 && !ex.some(c => c.dataset.id === 'e2'));
  check('onclick de la borne : selectService(\'sv1\') / toggleExtra(\'e1\') (identifiants, pas "this")', sv[0].getAttribute('onclick') === "selectService('sv1')" && ex[0].getAttribute('onclick') === "toggleExtra('e1')");
  w.selectService('sv1');
  check('toucher une prestation : carte marquee (une seule), "Suivant" active, totaux a jour (20 min, 13,00 €)', sv[0].classList.contains('sel') && sv[0].getAttribute('aria-pressed') === 'true' && !sv[1].classList.contains('sel') && d.getElementById('step1-next-btn').disabled === false && d.getElementById('tot-dur').textContent === '20' && d.getElementById('tot-price').textContent === '13,00 €');
  w.selectService('sv2');
  check('en toucher une autre : l\'ancienne est desélectionnée', !sv[0].classList.contains('sel') && sv[1].classList.contains('sel') && d.querySelectorAll('#svc-grid .item-card.sel').length === 1);
  w.toggleExtra('e1'); w.toggleExtra('e3');
  const exNow = [...d.querySelectorAll('#extras-grid .item-card')];
  check('supplements : 2 touches -> cartes marquees, totaux 25 + 10 + 12 = 47 min ; 15,00 + 5,00 + 7,00 = 27,00 €', exNow.filter(c => c.classList.contains('sel')).map(c => c.dataset.id).join() === 'e1,e3' && d.getElementById('tot-dur').textContent === '47' && d.getElementById('tot-price').textContent === '27,00 €', d.getElementById('tot-dur').textContent + ' / ' + d.getElementById('tot-price').textContent);
  w.renderFormOptions();
  check('la liste reaffichee (changement de coiffeur) garde la prestation et les supplements choisis', d.querySelector('#svc-grid .item-card.sel').dataset.id === 'sv2' && [...d.querySelectorAll('#extras-grid .item-card.sel')].map(c => c.dataset.id).join() === 'e1,e3');
  w.eval("barbers[0].disabled_service_ids = ['sv2'];"); w.renderFormOptions();
  check('prestation choisie devenue indisponible avec ce coiffeur : desélectionnée (pas de choix invalide envoye)', w.eval('selService') === null && d.querySelectorAll('#svc-grid .item-card.sel').length === 0);
  w.eval("barbers[0].disabled_service_ids = ['sv1','sv2'];"); w.renderFormOptions();
  check('aucune prestation disponible : message clair', /Aucune prestation disponible/.test(d.getElementById('svc-grid').textContent));
  check('remise a zero apres un envoi : le code vide aussi les cartes (.item-card), plus les anciennes puces', /querySelectorAll\('#svc-grid \.item-card, #extras-grid \.item-card'\)\.forEach\(function \(c\) \{ c\.classList\.remove\('sel'\)/.test(kiosk) && !/xchip/.test(kiosk));

  console.log('\n[D] Fichiers partages et coherence');
  check('le style des cartes (.item-card, .item-grid.compact) et celui de la barre dans une fenetre sont dans app.css', /\.item-grid\.compact \{/.test(css) && /\.modal-box \.step-bar \{ position: sticky; bottom: -26px/.test(css) && /\.item-card\.has-photo \.item-media \{[^}]*background-size: contain/.test(css));
  const pages = fs.readdirSync(path.join(__dirname, '../../public')).filter(f => f.endsWith('.html'));
  const stale = pages.filter(f => { const s = R(f); return (/app\.css\?v=(\d+)/.test(s) && !/app\.css\?v=6/.test(s)) || (/app\.js\?v=(\d+)/.test(s) && !/app\.js\?v=8/.test(s)); });
  check('TOUTES les pages demandent la nouvelle version des fichiers partages (app.css v6, app.js v8) : aucun navigateur ne garde l\'ancien', stale.length === 0, stale.join(','));
  const users = ['rdv.html', 'compte.html', 'kiosk.html', 'dashboard.html', 'poste.html', 'caisse.html'];
  check('les 6 pages concernees utilisent le meme code (vitrineRender) et plus aucune copie locale', users.every(f => /vitrineRender\(/.test(R(f))) && !/function (normText|extraIcon|productIcon|groupItems|vitrineCardHtml)\(/.test(users.map(R).join('')));

  console.log(`\nRESULTAT : ${pass} verifications reussies, ${fail} echec(s)`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('ERREUR TEST', e); process.exit(2); });
