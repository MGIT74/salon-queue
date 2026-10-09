// Caisse : les prestations / supplements / produits utilisent la MEME carte que la page de RDV en ligne (vitrineCardHtml), un appui = +1 au ticket.
const fs = require('fs'), path = require('path'), vm = require('vm');
const rd = (f) => fs.readFileSync(path.join(__dirname, '../../' + f), 'utf8');
const app = rd('public/app.js'), caisse = rd('public/caisse.html');
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n + (x ? '  [' + x + ']' : '')); };
const fnSrc = (src, name) => { const i = src.indexOf('function ' + name + '('); if (i === -1) throw new Error('introuvable: ' + name); const j = src.indexOf('\n}\n', i); return src.slice(i, j + 2); };

console.log('\n[A] Carte partagee (vraie fonction)');
const ctx = vm.createContext({ esc: (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'), normText: (s) => String(s).toLowerCase(),
  vitrineBaseIcon: () => '✂️', extraIcon: () => '✨', productIcon: () => '🧴', formatMinutes: (m) => m + ' min', eur: (c) => (c / 100).toFixed(2) + ' €',
  VITRINE_PLUS_SVG: '<i class="plus"></i>', VITRINE_CHECK_SVG: '<i class="chk"></i>', VITRINE_CHECK_SM_SVG: '<i class="chk-sm"></i>' });
vm.runInContext(fnSrc(app, 'vitrineCardHtml'), ctx);
const svcRdv = ctx.vitrineCardHtml('services', { id: 's1', name: 'Coupe', price_cents: 1500, duration_min: 25 }, false, "f('{id}')");
const svcCaisse = ctx.vitrineCardHtml('services', { id: 's1', name: 'Coupe', price_cents: 1500, duration_min: 25 }, false, "f('{id}')", { add: true });
const prod = ctx.vitrineCardHtml('products', { id: 'p1', name: 'Cire', price_cents: 1000, stock_enabled: 1, stock_quantity: 12 }, false, "f('{id}')", { add: true, stock: true });
const rupt = ctx.vitrineCardHtml('products', { id: 'p2', name: 'Eau', price_cents: 100, stock_enabled: 1, stock_quantity: 0 }, false, "f('{id}')", { add: true, stock: true });
check('page RDV : une prestation n\'a pas de bouton + (choix unique, coche), comme avant', !/item-add/.test(svcRdv) && /item-check/.test(svcRdv));
check('caisse : une prestation a le bouton + (on peut en ajouter plusieurs)', /item-add/.test(svcCaisse) && !/item-check/.test(svcCaisse));
check('caisse : le stock restant est affiche sur les produits', /12 en stock/.test(prod));
check('caisse : produit en rupture = carte grisee, desactivee, "Épuisé"', /item-card out/.test(rupt) && /disabled/.test(rupt) && /Épuisé/.test(rupt));

console.log('\n[B] Branchement de la caisse');
check('renderItemGrid utilise vitrineRender (plus de tuiles .item-btn maison)', /function renderItemGrid[\s\S]*vitrineRender\(\{/.test(caisse) && !/class="item-btn/.test(caisse));
check('un appui ajoute au ticket via le catalogue (addCatalogItem -> addToTicket)', /function addCatalogItem/.test(caisse) && /addToTicket\(typeSingular, String\(it\.id\)/.test(caisse));
check('les cartes deja au ticket sont surlignees sans reconstruire la grille (syncGridSel dans renderTicket)', /function syncGridSel/.test(caisse) && /syncGridSel\(\);\s*updateGiftVisibility/.test(caisse));

console.log('\n[C] Ordinateur : seule la liste des articles defile');
check('onglet Caisse (>= 861px) : page figee, hauteur de l\'ecran, seule la grille #item-grid a overflow-y: auto', /@media \(min-width: 861px\) \{[\s\S]*body:has\(#panel-caisse\.on #item-grid\)[\s\S]*overflow: hidden/.test(caisse) && /#panel-caisse #item-grid \{[^}]*overflow-y: auto/.test(caisse));
check('ticket, onglets et pastilles restent fixes (ticket non "sticky" : il occupe la hauteur)', /#panel-caisse \.ticket-panel \{ position: static; max-height: none/.test(caisse) && /#panel-caisse \.caisse-grid-col \.cat-tabs \{ flex: none/.test(caisse));
check('mobile / autres onglets : regle limitee a l\'onglet Caisse sur grand ecran (Agenda, Cloture defilent normalement)', /body:has\(#panel-caisse\.on #item-grid\)/.test(caisse));
check('AVANT le code PIN : la mise en page figee ne s\'applique que si l\'ecran Caisse est reellement affiche (display: block pose par le JS), jamais sur le display:none du HTML', /#app-screen\[style\*="display: block"\]/.test(caisse) && !/#app-screen:not\(\[style/.test(caisse));

console.log('\n' + pass + ' OK, ' + fail + ' ECHEC');
process.exit(fail ? 1 : 0);
