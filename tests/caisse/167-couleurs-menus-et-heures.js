// Couleurs des 3 menus (prestation / supplément / produit), réglables par le salon, + heures sans Matin / Après-midi.
// - Réglages color_cat_* (#rrggbb ou vide = défaut), renvoyés par /api/settings/public (cat_colors).
// - Cartes : liseré + mention de la catégorie ; onglets et titres d'étape colorés.
// - Agenda du poste : heure de fin + une étiquette par élément (petit bloc : points) ; frise de la caisse : fin + points.
// - Étiquette produit 🛍 dans le tiroir et dans « À suivre ». Vraie base + vrai serveur (port 3999).
process.env.DB_HOST = process.env.DB_HOST || '127.0.0.1';
process.env.DB_USER = process.env.DB_USER || 'sq';
process.env.DB_PASSWORD = process.env.DB_PASSWORD || 'sqpass';
process.env.DB_NAME = process.env.DB_NAME || 'salonq';
process.env.SETTINGS_ENCRYPTION_KEY = process.env.SETTINGS_ENCRYPTION_KEY || 'testkeytestkeytestkeytestkey123456';
const path = require('path'), fs = require('fs');
const { pool } = require(path.join(__dirname, '../../src/db'));
const BASE = 'http://127.0.0.1:3999';
const ADMIN = { 'Content-Type': 'application/json', 'X-Salon-Slug': 'test', 'X-Admin-Password': 'adminpw' };
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n + (x ? '  [' + String(x).slice(0, 220) + ']' : '')); };
const read = (f) => fs.readFileSync(path.join(__dirname, '../../public/' + f), 'utf8');
const app = read('app.js');
const fn = (n) => app.match(new RegExp('function ' + n + '\\([\\s\\S]*?\\n}\\n'))[0];
const lib = new Function('function esc(s) { return String(s == null ? \'\' : s).replace(/&/g, \'&amp;\').replace(/</g, \'&lt;\').replace(/>/g, \'&gt;\').replace(/"/g, \'&quot;\'); }; var CAT_ICON = { service: "✂", extra: "+", product: "🛍" }; var CAT_LABEL = { service: "Prestation", extra: "Supplément", product: "Produit" };' +
  ['catChipHtml', 'catItemsOf', 'catChipsHtml', 'catDotsHtml', 'productChipsHtml'].map(fn).join('\n') +
  '; return { catItemsOf, catChipsHtml, catDotsHtml, productChipsHtml };')();

// Éléments d'un RDV (a.pricing) et d'un client de la file
const appt = { service_name: 'Coupe', pricing: { service_price_cents: 2000, service_duration_min: 30, extras: [{ name: 'Barbe' }, { name: 'Shampoing' }], products: [{ name: 'Gel', quantity: 2 }] } };
const items = lib.catItemsOf(appt);
check('RDV : prestation, suppléments, produit (avec quantité)', JSON.stringify(items) === JSON.stringify([{ k: 'service', name: 'Coupe' }, { k: 'extra', name: 'Barbe' }, { k: 'extra', name: 'Shampoing' }, { k: 'product', name: 'Gel × 2' }]), JSON.stringify(items));
check('RDV « supplément seul » : pas d\'étiquette prestation', lib.catItemsOf({ service_name: 'Supplément seul', pricing: { service_price_cents: 0, service_duration_min: 0, extras: [{ name: 'Barbe' }], products: [] } }).every((i) => i.k === 'extra'));
check('file : q.service / q.extras / q.products', JSON.stringify(lib.catItemsOf({ service: { name: 'Coupe' }, extras: [{ name: 'Barbe' }], products: [{ name: 'Gel', quantity: 1 }] }).map((i) => i.k)) === '["service","extra","product"]');
check('sans détail (ancien serveur) : juste la prestation', JSON.stringify(lib.catItemsOf({ service_name: 'Coupe' })) === '[{"k":"service","name":"Coupe"}]');
const chips = lib.catChipsHtml(items);
check('étiquettes : une par élément, classe de couleur du menu', (chips.match(/class="cat-chip k-/g) || []).length === 4 && chips.includes('k-product') && chips.includes('🛍'));
check('points de couleur (petit bloc)', (lib.catDotsHtml(items).match(/<i class="k-/g) || []).length === 4);
check('produit seul (tiroir / À suivre)', (lib.productChipsHtml(appt).match(/cat-chip k-product/g) || []).length === 1 && lib.productChipsHtml({ service_name: 'Coupe' }) === '');

(async () => {
  try {
    let pub = await (await fetch(BASE + '/api/settings/public', { headers: { 'X-Salon-Slug': 'test' } })).json();
    check('public : couleurs par défaut', JSON.stringify(pub.cat_colors) === JSON.stringify({ service: '#0a84ff', extra: '#bf5af2', product: '#30d158' }), JSON.stringify(pub.cat_colors));
    let r = await fetch(BASE + '/api/settings', { method: 'PUT', headers: ADMIN, body: JSON.stringify({ color_cat_product: '#FF9F0A' }) });
    pub = await (await fetch(BASE + '/api/settings/public', { headers: { 'X-Salon-Slug': 'test' } })).json();
    check('admin : couleur produit personnalisée', r.status === 200 && pub.cat_colors.product === '#ff9f0a' && pub.cat_colors.service === '#0a84ff', JSON.stringify(pub.cat_colors));
    r = await fetch(BASE + '/api/settings', { method: 'PUT', headers: ADMIN, body: JSON.stringify({ color_cat_extra: 'red;}body{' }) });
    check('couleur invalide refusée (400)', r.status === 400);
    r = await fetch(BASE + '/api/settings', { method: 'PUT', headers: ADMIN, body: JSON.stringify({ color_cat_service: '', color_cat_extra: '', color_cat_product: '' }) });
    pub = await (await fetch(BASE + '/api/settings/public', { headers: { 'X-Salon-Slug': 'test' } })).json();
    check('« Rétablir » : retour aux couleurs d\'origine', r.status === 200 && pub.cat_colors.product === '#30d158');
  } finally {
    await fetch(BASE + '/api/settings', { method: 'PUT', headers: ADMIN, body: JSON.stringify({ color_cat_service: '', color_cat_extra: '', color_cat_product: '' }) });
  }
  const css = read('app.css'), d = read('dashboard.html'), p = read('poste.html'), c = read('caisse.html'), rdv = read('rdv.html'), compte = read('compte.html'), k = read('kiosk.html'), gb = read('group-booking.js');
  check('app.css : variables --cat-* et cartes / étiquettes', /--cat-service: #0a84ff; --cat-extra: #bf5af2; --cat-product: #30d158;/.test(css) && css.includes('.item-card.k-service::before') && css.includes('.cat-chip {') && css.includes('.cat-head::before'));
  check('cartes : classe de couleur + mention de la catégorie', app.includes("class=\"item-card k-' + kk") && app.includes('<span class="item-kind">'));
  check('toutes les pages appliquent les couleurs du salon', ['caisse', 'poste', 'compte'].every((n) => read(n + '.html').includes('applyCatColors(d.cat_colors)')) && rdv.includes('applyCatColors(r[4].cat_colors)') && k.includes('applyCatColors(r[2].cat_colors)') && d.includes('applyCatColors(d.cat_colors)'));
  check('admin : 3 sélecteurs de couleur + Enregistrer / Rétablir', ['cat-color-service', 'cat-color-extra', 'cat-color-product'].every((id) => d.includes('id="' + id + '"')) && /function saveCatColors\(\)/.test(d) && /function resetCatColors\(\)/.test(d));
  check('onglets caisse et titres d\'étape colorés', c.includes('class="on k-service" data-cat="services"') && c.includes('class="k-product" data-cat="products"') && [p, c, d].every((h) => h.includes('aa-step-title cat-head k-extra')) && rdv.includes('eyebrow cat-head k-product') && compte.includes('eyebrow cat-head k-service'));
  check('poste, agenda Jour : heure de fin + étiquettes (petit bloc : points)', p.includes("'<span class=\"t\">' + pdHM(it.start) + ' – ' + pdHM(it.end) + '</span>") && p.includes('(roomy ? catChipsHtml(cats)') && p.includes(': !narrow ? catDotsHtml(cats)'));
  check('caisse, frise : heure de fin + points', c.includes("' – ' + tbHM(it.startMin + it.durMin) + ' ' + catDotsHtml(it.cats)"));
  check('produit 🛍 dans À suivre (poste et caisse) et le tiroir', p.includes("esc(detail) + '</div>' + productChipsHtml(q)") && c.includes("esc(detail) + '</div>' + productChipsHtml(q)") && app.includes('productChipsHtml(a)'));
  check('heures : plus de Matin / Après-midi (rdv, compte, admin, poste, caisse, groupe)',
    [rdv, compte, p, c, d].every((h) => !/s\.time < '12:00'/.test(h) && !h.includes("'le matin'")) && gb.includes('var morning = (q.slots || []).slice(), aft = [];'));
  check('versions rechargées (app.js v=59, app.css v=51, group-booking v=29)', [d, p, c, rdv, compte, k].every((h) => h.includes('app.js?v=59') && h.includes('app.css?v=51')) && rdv.includes('group-booking.js?v=29'));
  await pool.end();
  console.log(`\n${pass} OK, ${fail} ECHEC`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
