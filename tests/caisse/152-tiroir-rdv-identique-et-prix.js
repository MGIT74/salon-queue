// Tiroir d'un RDV : MEMES infos dans l'admin, la caisse et le poste (statut, quand, coiffeur, prestation + supplements,
// detail du prix : tarif du coiffeur ou catalogue, chaque supplement, total et duree). Le serveur fournit a.pricing.
const fs = require('fs'), path = require('path'), vm = require('vm');
const rd = (f) => fs.readFileSync(path.join(__dirname, '../../' + f), 'utf8');
const app = rd('public/app.js'), dash = rd('public/dashboard.html'), caisse = rd('public/caisse.html'), poste = rd('public/poste.html'), api = rd('src/routes/appointments.js');
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n + (x ? '  [' + x + ']' : '')); };
const fnSrc = (src, name) => { const i = src.indexOf('function ' + name + '('); if (i === -1) throw new Error('introuvable: ' + name); const j = src.indexOf('\nfunction ', i + 10); const k = src.indexOf('\n/**', i + 10); const ends = [j, k].filter((x) => x > -1); return src.slice(i, ends.length ? Math.min.apply(null, ends) : undefined); };
const ctx = vm.createContext({ CURRENCY: 'EUR' });
ctx.esc = (v) => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;');
vm.runInContext(['eur', 'formatMinutes', 'apptWhenLabel', 'apptBadgeHtml', 'apptPricingHtml', 'apptInfoRowsHtml'].map((n) => fnSrc(app, n)).join('\n'), ctx);
const txt = (h) => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

console.log('\n[A] Detail du prix');
const a = { client_name: 'Mohamed', scheduled_at: '2026-10-28 10:50:00', barber_name: 'Mounir', service_name: 'Coupe + barber + shampoing', email: 'm@x.fr', phone: '+33699119411', status: 'confirmed', display_status: 'confirmed',
  pricing: { service_price_cents: 2200, service_duration_min: 30, service_catalog_price_cents: 2200, service_catalog_duration_min: 30, custom: false,
    extras: [{ name: 'Barbe', price_cents: 500, duration_min: 5, custom: false }], total_cents: 2700, total_duration_min: 35, charged_cents: 2700 } };
let h = txt(ctx.apptInfoRowsHtml(a));
check('prestation + supplement dans la ligne Prestation', /Prestation Coupe \+ barber \+ shampoing \+ Barbe/.test(h), h);
check('prix total et duree : 35 min · 27,00 €', /Prix 35 min · 27,00 €/.test(h));
check('chaque ligne : prestation 22 € 30 min, + Barbe 5 € 5 min', /Coupe \+ barber \+ shampoing 30 min · 22,00 €/.test(h) && /\+ Barbe 5 min · 5,00 €/.test(h));
check('pas de mention de tarif personnalise quand c\'est le catalogue', !/tarif de/.test(h));
check('Quand / Coiffeur / Email / Telephone', /Quand Mercredi 28 octobre à 10:50/i.test(h) && /Coiffeur Mounir/.test(h) && /Email m@x\.fr/.test(h) && /Téléphone \+33699119411/.test(h));
const b = JSON.parse(JSON.stringify(a)); b.pricing = { service_price_cents: 2700, service_duration_min: 35, service_catalog_price_cents: 2200, service_catalog_duration_min: 30, custom: true, extras: [], total_cents: 2700, total_duration_min: 35, charged_cents: 2500 };
h = txt(ctx.apptInfoRowsHtml(b));
check('tarif personnalise du coiffeur signale, avec le tarif du catalogue', /tarif de Mounir — catalogue : 22,00 € · 30 min/.test(h), h);
check('montant en caisse different : affiche', /Prestation actuellement en caisse : 25,00 €/.test(h));
check('sans detail (ancien serveur) : pas de ligne Prix, pas d\'erreur', !/Prix/.test(txt(ctx.apptInfoRowsHtml(Object.assign({}, a, { pricing: null })))));
check('statut : Confirmé / Terminé / Annulé', /Confirmé/.test(ctx.apptBadgeHtml(a)) && /Terminé/.test(ctx.apptBadgeHtml({ display_status: 'completed' })) && /Annulé/.test(ctx.apptBadgeHtml({ status: 'cancelled' })));

const c = JSON.parse(JSON.stringify(a));
c.pricing.products = [{ name: 'Coca', unit_price_cents: 250, quantity: 2 }];
c.pricing.services_total_cents = 2700; c.pricing.products_total_cents = 500; c.pricing.total_cents = 3200;
h = txt(ctx.apptInfoRowsHtml(c));
check('produit choisi d\'avance : nom × quantite et prix (sans duree)', /\+ Coca × 2 produit 5,00 €/.test(h), h);
check('total avec le produit, duree inchangee : 40 min · 32,00 €', /Prix 35 min · 32,00 €/.test(h));
check('produit : pas de « en caisse » a tort (la file ne compte que prestation + supplements)', !/actuellement en caisse/.test(h));
check('serveur : produits du RDV (ou de la ligne de file), total avec produits', /FROM appointment_products ap/.test(api) && /JOIN queue_products qp ON qp\.queue_id = a\.promoted_queue_id/.test(api) && /p\.total_cents = p\.services_total_cents \+ p\.products_total_cents/.test(api));

console.log('\n[B] Branchement : meme tiroir partout');
check('caisse : tiroir RDV = apptInfoRowsHtml', /document\.getElementById\('ad-info'\)\.innerHTML = apptInfoRowsHtml\(a\);/.test(caisse) && /apptBadgeHtml\(a\)/.test(caisse));
check('poste : idem', /document\.getElementById\('ad-info'\)\.innerHTML = apptInfoRowsHtml\(a\);/.test(poste) && /apptBadgeHtml\(a\)/.test(poste));
check('admin : un RDV utilise les memes lignes + l\'etiquette de statut', /source === 'appointment' \? apptInfoRowsHtml\(c\)/.test(dash) && /id="drawer-badge"/.test(dash) && /source === 'appointment' \? apptBadgeHtml\(c\)/.test(dash) && /\.ad-badge \{/.test(dash));
check('serveur : chaque RDV renvoie pricing (tarif coiffeur sinon catalogue, supplements, montant en caisse)', /pricing: pricing\[r\.id\] \|\| null/.test(api) && /LEFT JOIN barber_service_prices bsp ON bsp\.barber_id = a\.barber_id AND bsp\.service_id = a\.service_id\s+LEFT JOIN queue q/.test(api) && /LEFT JOIN barber_extra_prices bep/.test(api) && /charged_cents: num\(r\.charged_cents\)/.test(api));

console.log('\n' + pass + ' OK, ' + fail + ' ECHEC');
process.exit(fail ? 1 : 0);
