// Caisse : 4e onglet « À encaisser » (a cote de Prestations / Supplements / Produits) avec la liste de tous
// les encaissements en attente et une pastille du nombre de clients a encaisser.
const fs = require('fs');
let pass = 0, fail = 0;
const check = (n, ok) => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n); };
const h = fs.readFileSync(__dirname + '/../../public/caisse.html', 'utf8');
const tabs = h.slice(h.indexOf('id="cat-tabs"'), h.indexOf('</div>', h.indexOf('id="cat-tabs"')));
check('4 onglets : Prestations, Supplements, Produits, A encaisser', /data-cat="services"/.test(tabs) && /data-cat="extras"/.test(tabs) && /data-cat="products"/.test(tabs) && /data-cat="pending"[^>]*>À encaisser/.test(tabs));
const col = h.slice(h.indexOf('<div class="caisse-grid-col'), h.indexOf('<div class="ticket-panel">'));
check('la liste « en attente » (et « encaisser a l\'avance ») est dans la colonne des onglets', /id="pending-section"/.test(col) && /id="pending-list"/.test(col) && /id="advance-btn"/.test(col));
check('l\'onglet remplace la grille d\'articles par la liste', /function applyCatView\(\)/.test(h) && /document\.getElementById\('item-grid'\)\.style\.display = pending \? 'none' : ''/.test(h) && /if \(currentCat === 'pending'\) return;/.test(h));
check('pastille : nombre de clients en attente (hors mis de cote)', /id="pending-tab-count"/.test(h) && /waitingCount = pendingPayments\.filter\(function \(q\) \{ return !q\.deferred; \}\)\.length/.test(h));
check('liste vide : message « Aucun encaissement en attente »', /Aucun encaissement en attente/.test(h));
console.log('\n' + pass + ' OK, ' + fail + ' ECHEC');
process.exit(fail ? 1 : 0);
