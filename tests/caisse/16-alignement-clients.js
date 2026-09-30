// Le bouton "Terminer"/"Forcer la cloture" n'apparait que pour un client
// encore en attente/en cours, jamais pour un client deja "termine" - sans
// largeur reservee pour .item-actions, ces deux types de lignes desalignent
// leurs colonnes differemment (constate sur capture d'ecran, meme cause que
// le correctif deja applique a Fidelite/Cadeaux vendus). Verifie que la
// VRAIE fonction renderClients() produit bien la structure attendue (1 vs 2
// boutons), et que la regle CSS de reservation existe bien dans le fichier
// (jsdom ne peut pas evaluer les regles @container elles-memes - moteur CSS
// trop limite - donc verifie ici par lecture du code, pas par un rendu).
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '../../public/dashboard.html'), 'utf8');
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n + (x ? '  [' + x + ']' : '')); };

console.log('\n[A] La regle de reservation de largeur existe, pour l\'en-tete ET les lignes');
check('regle presente, meme valeur min-width pour clients-list-head et clients-list',
  /#clients-list-head \.item-actions, ?#clients-list \.item-actions \{ min-width: (\d+)px/.test(src));

console.log('\n[B] La vraie fonction renderClients() produit la bonne structure (1 ou 2 boutons selon le statut)');
const styleStart = src.indexOf('<style>'), styleEnd = src.indexOf('</style>') + 8;
const fnStart = src.indexOf('function renderClients()');
const fnEnd = src.indexOf('\nfunction ', fnStart + 10);
const dom = new JSDOM(
  '<!doctype html><html><head>' + src.slice(styleStart, styleEnd) + '</head><body>' +
  '<input id="client-search" value=""><div id="clients-list"></div></body></html>',
  { runScripts: 'outside-only', pretendToBeVisual: true }
);
const w = dom.window, d = w.document;
w.esc = (s) => String(s);
w.durationBadge = () => '';
w.STATUS_COLOR = { waiting: 'orange', done: 'green' };
w.STATUS_LABEL = { waiting: 'En attente', done: 'Terminé' };
w.forceCloseClient = () => {};
w.deleteClient = () => {};
w.selectedClientIds = {};
w.clientHistory = [
  { id: 'c1', client_name: 'Eric', status: 'waiting', checkin_at: new Date().toISOString(), start_at: new Date().toISOString(), service_name: 'Coupe', extra_names: [] },
  { id: 'c2', client_name: 'Eric', status: 'done', checkin_at: new Date().toISOString(), start_at: new Date().toISOString(), service_name: 'Coupe et barbe', extra_names: [] }
];
w.eval(src.slice(fnStart, fnEnd));
w.renderClients();

const rows = d.querySelectorAll('#clients-list .item');
check('2 lignes generees', rows.length === 2, rows.length);
const btns1 = rows[0].querySelector('.item-actions').querySelectorAll('button');
const btns2 = rows[1].querySelector('.item-actions').querySelectorAll('button');
check('client "en attente" : 2 boutons (Terminer + Supprimer)', btns1.length === 2 && btns1[0].textContent === 'Terminer', Array.from(btns1).map(b=>b.textContent).join(','));
check('client "termine" : 1 seul bouton (Supprimer)', btns2.length === 1 && btns2[0].textContent === 'Supprimer', Array.from(btns2).map(b=>b.textContent).join(','));

console.log(`\nRESULTAT : ${pass} verifications reussies, ${fail} echec(s)`);
process.exit(fail ? 1 : 0);
