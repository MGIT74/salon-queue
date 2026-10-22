// Formulaire de prise de RDV (seul et a plusieurs) : telephone avec indicatif pays, meme selecteur que la creation
// de compte ; le numero est envoye au format international (+32470123456).
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n + (x ? '  [' + String(x).slice(0, 160) + ']' : '')); };
const rd = (f) => fs.readFileSync(path.join(__dirname, '../../public', f), 'utf8');
const rdv = rd('rdv.html'), app = rd('app.js');

for (const pre of ['rdv', 'grp']) {
  check(pre + ' : selecteur d\'indicatif (bouton, liste, valeur cachee)',
    rdv.includes(`togglePhoneCC('${pre}')`) && rdv.includes(`id="${pre}-phone-cc-list"`) && rdv.includes(`id="${pre}-phone-country" value="+33"`));
  check(pre + ' : numero envoye avec l\'indicatif choisi', rdv.includes(`composePhone(document.getElementById('${pre}-phone-country').value, document.getElementById('${pre}-phone').value)`));
}
check('pre-remplissage (cadeau, client du salon) separe indicatif et numero', /fillPhone\('rdv', activeGift\.recipient_phone\)/.test(rdv) && /fillPhone\('grp', c\.phone\)/.test(rdv));
check('nouvelle reservation : indicatif remis a +33', /fillPhone\('rdv', ''\)/.test(rdv));

const ctx = {}; vm.createContext(ctx);
const grab = (name) => { const i = app.indexOf('function ' + name + '('); let d = 0, j = app.indexOf('{', i); for (; j < app.length; j++) { if (app[j] === '{') d++; else if (app[j] === '}' && --d === 0) break; } return app.slice(i, j + 1); };
vm.runInContext(grab('composePhone'), ctx);
check('0470 12 34 56 en Belgique -> +32470123456', ctx.composePhone('+32', '0470 12 34 56') === '+32470123456');
check('numero deja international garde tel quel', ctx.composePhone('+33', '+41 79 123 45 67') === '+41791234567');

console.log(`\n${pass} OK, ${fail} ECHEC`);
process.exit(fail ? 1 : 0);
