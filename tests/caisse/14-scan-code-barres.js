// Scanner USB (douchette) sur l'onglet Caisse : detecte une sequence rapide
// de touches + Entree comme un scan (jamais une frappe humaine, bien trop
// lente) ; recherche le produit correspondant dans le catalogue deja charge
// et l'ajoute au ticket - ou toast clair si code inconnu / rupture de stock.
// Inerte sur tout autre onglet (Agenda, Timer, Cloture).
const { JSDOM } = require('jsdom');
const { execSync } = require('child_process');
const BASE = 'http://127.0.0.1:3999';
const sql = (q) => execSync(`mariadb -uroot salonq -e "${q.replace(/"/g,'\\"')}"`, { stdio: 'pipe' });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n + (x ? '  [' + x + ']' : '')); };

// Simule une VRAIE douchette : chaque touche arrive en quelques ms.
async function scanFast(win, code) {
  for (const ch of code) {
    win.document.dispatchEvent(new win.KeyboardEvent('keydown', { key: ch, bubbles: true }));
    await sleep(3); // largement sous le seuil de detection (40 ms)
  }
  win.document.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
}

// Simule une frappe HUMAINE du meme code (bien plus lente qu'un scanner).
async function typeSlow(win, code) {
  for (const ch of code) {
    win.document.dispatchEvent(new win.KeyboardEvent('keydown', { key: ch, bubbles: true }));
    await sleep(90); // bien au-dessus du seuil (40 ms) - frappe humaine normale
  }
  win.document.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
}

(async () => {
  sql("DELETE FROM products WHERE id IN ('coca_cola_33cl','sans_code_a')");
  const H = { 'Content-Type': 'application/json', 'X-Salon-Slug': 'test', 'X-Admin-Password': 'adminpw' };
  await fetch(BASE + '/api/catalog/products', { method: 'POST', headers: H, body: JSON.stringify({ name: 'Coca Cola 33cl', price_cents: 250, barcode: '5449000000996' }) });
  await fetch(BASE + '/api/catalog/products', { method: 'POST', headers: H, body: JSON.stringify({ name: 'Sans code A', price_cents: 100, stock_enabled: true, stock_quantity: 0 }) });

  const dom = await JSDOM.fromURL(BASE + '/caisse.html?salon=test', {
    runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true,
    beforeParse(w) {
      w.sessionStorage.setItem('caisse-session', JSON.stringify({ id: 'b1', pin: '1111', name: 'Alice' }));
      w.fetch = (u, o) => fetch(String(u).startsWith('http') ? u : BASE + u, o);
      w.HTMLElement.prototype.scrollIntoView = () => {};
    }
  });
  const w = dom.window; await sleep(2000);
  const d = w.document;
  const toasts = []; w.toast = (m, err) => toasts.push({ m, err: !!err });

  console.log('\n[A] Un vrai scan (frappes rapides) ajoute le bon produit au ticket');
  d.getElementById('cat-tabs').querySelector('[data-cat="products"]').click(); await sleep(200);
  check('le ticket est vide au depart', w.ticket.length === 0);
  await scanFast(w, '5449000000996'); await sleep(200);
  check('"Coca Cola 33cl" ajoute au ticket', w.ticket.length === 1 && w.ticket[0].item_name === 'Coca Cola 33cl', JSON.stringify(w.ticket));
  check('toast de confirmation', toasts.some(t => /Coca Cola 33cl.*ajouté/.test(t.m) && !t.err));

  console.log('\n[B] Un 2e scan du MEME code incremente la quantite (pas une 2e ligne)');
  toasts.length = 0;
  await scanFast(w, '5449000000996'); await sleep(200);
  check('toujours 1 seule ligne, quantite 2', w.ticket.length === 1 && w.ticket[0].quantity === 2, JSON.stringify(w.ticket));

  console.log('\n[C] Une frappe HUMAINE lente du meme code n\'ajoute RIEN (pas un scan)');
  w.ticket.length = 0; w.renderTicket(); toasts.length = 0;
  await typeSlow(w, '5449000000996'); await sleep(200);
  check('rien ajoute au ticket (frappe trop lente pour etre un scan)', w.ticket.length === 0, JSON.stringify(w.ticket));

  console.log('\n[D] Code scanne INCONNU : toast clair, rien ajoute');
  toasts.length = 0;
  await scanFast(w, '0000000000000'); await sleep(200);
  check('rien ajoute', w.ticket.length === 0);
  check('toast "aucun produit"', toasts.some(t => /Aucun produit/.test(t.m) && t.err));

  console.log('\n[E] Produit scanne mais EN RUPTURE DE STOCK : toast clair, rien ajoute');
  const codeB = 'RUPTURE-TEST';
  await fetch(BASE + '/api/catalog/products/sans_code_a', { method: 'PUT', headers: H, body: JSON.stringify({ barcode: codeB }) });
  w.catalog.products = (await (await fetch(BASE + '/api/catalog/products', { headers: { 'X-Salon-Slug': 'test' } })).json()).items;
  toasts.length = 0;
  await scanFast(w, codeB); await sleep(200);
  check('rien ajoute (rupture de stock)', w.ticket.length === 0);
  check('toast "rupture de stock"', toasts.some(t => /rupture de stock/.test(t.m) && t.err));

  console.log('\n[F] Inerte sur un AUTRE onglet (Agenda) - un scan ne fait rien');
  w.doSwitchCaisseTab('agenda'); await sleep(200);
  toasts.length = 0;
  await scanFast(w, '5449000000996'); await sleep(200);
  check('rien ajoute (onglet Agenda actif, pas Caisse)', w.ticket.length === 0);
  check('aucun toast declenche', toasts.length === 0);
  w.doSwitchCaisseTab('caisse'); await sleep(200);

  console.log(`\nRESULTAT : ${pass} verifications reussies, ${fail} echec(s)`);
  sql("DELETE FROM products WHERE id IN ('coca_cola_33cl','sans_code_a')");
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('ERREUR TEST', e); process.exit(2); });
