// Carte cadeau vendue : son code est imprimé à la suite du vrai ticket (bon détachable). Thermique : coupe du papier
// entre le ticket et le bon, code en double taille. Vente normale : ticket inchangé, aucun bon.
const fs = require('fs');
const path = require('path');
const { asciiTicket } = require(path.join(__dirname, '../../src/lib/ticketText'));
const src = fs.readFileSync(path.join(__dirname, '../../public/caisse.html'), 'utf8');
function fnSrc(name) { const i = src.indexOf('function ' + name + '('); if (i === -1) throw new Error('introuvable: ' + name); const j = src.indexOf('\nfunction ', i + 10); return src.slice(i, j === -1 ? undefined : j); }
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n + (x ? '  [' + x + ']' : '')); };

const ctx = {};
// eslint-disable-next-line no-new-func
new Function('ctx', 'var CURRENCY = "EUR"; var legalInfo = { siret: "12345678900011" }; var PAYMENT_LABELS = { cb: "Carte bancaire", especes: "Especes" };\n' +
  ['paymentRowsFor', 'vatRateFor', 'receiptItemName', 'giftCouponItemsLabel', 'buildReceiptText'].map(fnSrc).join('\n') +
  '\nctx.build = buildReceiptText; ctx.label = giftCouponItemsLabel;')(ctx);

const lines = [{ quantity: 1, item_name: 'Coupe + barbe', unit_price_cents: 2800, item_type: 'service' }];
const base = { whenDate: new Date('2026-11-28T15:20:00'), ticketNumber: '001284', barberName: 'Emin', salonName: 'THE BARBER ONE' };
const gift = { code: 'K7M4QR2P', recipient_name: 'Sarah', items: lines, amount_cents: 2800 };

console.log('\n[A] Vente normale : ticket inchangé');
const plain = ctx.build(lines, 2800, 'cb', Object.assign({}, base, { escpos: true }));
check('pas de bon cadeau', !/CARTE CADEAU/.test(plain));
check('pas de coupe en plein ticket', plain.indexOf('\x1D\x56') === -1);

console.log('\n[B] Thermique (ESC/POS)');
const t = ctx.build(lines, 2800, 'cb', Object.assign({}, base, { gift, escpos: true }));
const iMerci = t.indexOf('Merci de votre visite'), iCut = t.indexOf('\x1D\x56\x42\x00'), iBon = t.indexOf('*** CARTE CADEAU ***');
check('ticket complet, PUIS coupe, PUIS bon', iMerci > 0 && iCut > iMerci && iBon > iCut, [iMerci, iCut, iBon].join(','));
check('code en double taille, centré, gras', t.indexOf('\x1B\x61\x01\x1D\x21\x11\x1B\x45\x01K7M4QR2P\x1B\x45\x00\x1D\x21\x00\x1B\x61\x00') > iBon);
check('Pour Sarah', /Pour\s+Sarah/.test(t));
check('Offert : la prestation', /Offert\s+Coupe \+ barbe/.test(t));
check('Valeur 28,00 EUR', /Valeur\s+28,00 EUR/.test(t));
check('date d\'achat', /Achet. le\s+28\/11\/2026/.test(t));
check('mode d\'emploi du code', /avec ce code/.test(t) && /Utilisable une seule fois/.test(t));
const sent = asciiTicket(t);
check('après le nettoyage serveur : commandes ESC/POS intactes', sent.indexOf('\x1D\x56\x42\x00') > 0 && sent.indexOf('\x1D\x21\x11') > 0);
check('après le nettoyage serveur : sans accents', /^[\x00-\x7F]*$/.test(sent) && /Achete le/.test(sent) && /Reservez/.test(sent));
const textLines = t.slice(iBon).split('\n').filter((l) => !/[\x1B\x1D]/.test(l));
check('bon : aucune ligne de texte > 32 colonnes', textLines.every((l) => l.length <= 32), textLines.filter((l) => l.length > 32).join('|'));

console.log('\n[C] Imprimante classique (mode texte) : aucune commande brute');
const tx = ctx.build(lines, 2800, 'cb', Object.assign({}, base, { gift, escpos: false }));
check('aucun octet de commande', !/[\x1B\x1D]/.test(tx));
check('ligne pointillée de découpe puis bon', tx.indexOf('- - - -') > tx.indexOf('Merci de votre visite') && tx.indexOf('CARTE CADEAU') > tx.indexOf('- - - -'));
check('code lisible espacé', tx.indexOf('K 7 M 4 Q R 2 P') > 0);

console.log('\n[D] Bon sans nom / prestations longues');
const many = [{ quantity: 1, item_name: 'Coupe homme dégradé américain', unit_price_cents: 2500 }, { quantity: 2, item_name: 'Soin visage complet', unit_price_cents: 1500 }];
const t2 = ctx.build(many, 5500, 'especes', Object.assign({}, base, { gift: { code: 'ABCD2345', recipient_name: '', items: many, amount_cents: 5500 }, escpos: true }));
check('pas de ligne « Pour » vide', !/\nPour\s*\n/.test(t2) && !/Pour /.test(t2));
check('prestations longues : repliées sans dépasser', t2.slice(t2.indexOf('CARTE CADEAU')).split('\n').filter((l) => !/[\x1B\x1D]/.test(l)).every((l) => l.length <= 32) && /2 x Soin visage/.test(t2));

console.log('\n[E] Branchements dans la caisse');
check('vente -> le code du serveur est transmis au reçu', /r\.gift && r\.gift\.code/.test(src) && /gift: giftCoupon/.test(src));
check('bouton Imprimer -> bon + mode ESC/POS transmis', /gift: ctx\.gift, escpos: cfg\.tpe_print_mode !== 'text'/.test(src));
check('aperçu à l\'écran : bon affiché', /opts\.gift \? giftCouponHtml\(/.test(src));

console.log('\n' + pass + ' OK, ' + fail + ' ECHEC');
process.exit(fail ? 1 : 0);
