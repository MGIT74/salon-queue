// Scanner USB (douchette) sur l'onglet Caisse. Repose sur un champ invisible
// toujours pret a recevoir (le meme mecanisme, deja fiable, que le champ
// "Code-barres" du formulaire produit du dashboard) plutot que sur une
// detection de vitesse de frappe - certaines douchettes, une fois
// configurees (frequent en France), envoient chaque caractere via "Alt +
// pave numerique" : Windows compose bien le texte final dans un champ, mais
// une ecoute touche par touche ne voit jamais les vrais caracteres passer.
const { JSDOM } = require('jsdom');
const { execSync } = require('child_process');
const BASE = 'http://127.0.0.1:3999';
const sql = (q) => execSync(`mariadb -uroot salonq -e "${q.replace(/"/g,'\\"')}"`, { stdio: 'pipe' });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n + (x ? '  [' + x + ']' : '')); };

// Simule un scan : quelle que soit la methode d'emission reelle de la
// douchette (touches normales ou "Alt+pave numerique"), le champ finit par
// contenir le bon texte au moment ou Entree/Tab arrive - c'est exactement
// ce que le mecanisme observe et exploite, sans rien supposer de plus.
function scan(win, code, terminator) {
  var el = win.document.getElementById('scan-catcher');
  el.focus();
  el.value = code;
  el.dispatchEvent(new win.KeyboardEvent('keydown', { key: terminator || 'Enter', bubbles: true, cancelable: true }));
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

  console.log('\n[A] A la connexion, le champ scanner recoit deja le focus (onglet Caisse actif par defaut)');
  check('scan-catcher a le focus', d.activeElement === d.getElementById('scan-catcher'), d.activeElement && d.activeElement.id);

  console.log('\n[B] Un scan (Entree) ajoute le bon produit au ticket');
  check('le ticket est vide au depart', w.ticket.length === 0);
  scan(w, '5449000000996'); await sleep(150);
  check('"Coca Cola 33cl" ajoute au ticket', w.ticket.length === 1 && w.ticket[0].item_name === 'Coca Cola 33cl', JSON.stringify(w.ticket));
  check('toast de confirmation', toasts.some(t => /Coca Cola 33cl.*ajouté/.test(t.m) && !t.err));
  check('le champ est vide, pret pour le prochain scan', d.getElementById('scan-catcher').value === '');

  console.log('\n[C] Un 2e scan du MEME code incremente la quantite (pas une 2e ligne)');
  toasts.length = 0;
  scan(w, '5449000000996'); await sleep(150);
  check('toujours 1 seule ligne, quantite 2', w.ticket.length === 1 && w.ticket[0].quantity === 2, JSON.stringify(w.ticket));

  console.log('\n[D] Douchette reglee pour envoyer Tab plutot que Entree en fin de scan');
  w.ticket.length = 0; w.renderTicket(); toasts.length = 0;
  scan(w, '5449000000996', 'Tab'); await sleep(150);
  check('ajoute quand meme (Tab accepte comme fin de scan)', w.ticket.length === 1, JSON.stringify(w.ticket));

  console.log('\n[E] Code scanne INCONNU : toast clair, rien ajoute');
  w.ticket.length = 0; w.renderTicket(); toasts.length = 0;
  scan(w, '0000000000000'); await sleep(150);
  check('rien ajoute', w.ticket.length === 0);
  check('toast "aucun produit"', toasts.some(t => /Aucun produit/.test(t.m) && t.err));

  console.log('\n[F] Produit scanne mais EN RUPTURE DE STOCK : toast clair, rien ajoute');
  await fetch(BASE + '/api/catalog/products/sans_code_a', { method: 'PUT', headers: H, body: JSON.stringify({ barcode: 'RUPTURE-TEST' }) });
  w.catalog.products = (await (await fetch(BASE + '/api/catalog/products', { headers: { 'X-Salon-Slug': 'test' } })).json()).items;
  toasts.length = 0;
  scan(w, 'RUPTURE-TEST'); await sleep(150);
  check('rien ajoute (rupture de stock)', w.ticket.length === 0);
  check('toast "rupture de stock"', toasts.some(t => /rupture de stock/.test(t.m) && t.err));

  console.log('\n[G] Cliquer une tuile produit (pas un champ de saisie) redonne le focus au scanner');
  d.getElementById('scan-catcher').blur();
  check('le focus est bien parti ailleurs', d.activeElement !== d.getElementById('scan-catcher'));
  var tile = d.querySelector('.item-btn, [onclick*="addToTicket"]');
  if (tile) tile.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  await sleep(50);
  check('le focus revient sur le scanner apres un clic sur le fond/une tuile', d.activeElement === d.getElementById('scan-catcher'), d.activeElement && d.activeElement.id);

  console.log('\n[H] Inerte sur un AUTRE onglet (Agenda) - un scan ne fait rien');
  w.doSwitchCaisseTab('agenda'); await sleep(200);
  w.ticket.length = 0; w.renderTicket(); toasts.length = 0;
  scan(w, '5449000000996'); await sleep(150);
  check('rien ajoute (onglet Agenda actif, pas Caisse)', w.ticket.length === 0);
  w.doSwitchCaisseTab('caisse'); await sleep(200);
  check('le focus revient sur le scanner en revenant sur Caisse', d.activeElement === d.getElementById('scan-catcher'), d.activeElement && d.activeElement.id);

  console.log(`\nRESULTAT : ${pass} verifications reussies, ${fail} echec(s)`);
  sql("DELETE FROM products WHERE id IN ('coca_cola_33cl','sans_code_a')");
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('ERREUR TEST', e); process.exit(2); });
