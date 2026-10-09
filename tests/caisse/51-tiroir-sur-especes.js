// Clic sur "Especes" : le tiroir-caisse s'ouvre immediatement (pont d'impression), pas pour la carte.
const fs = require('fs'), path = require('path');
const c = fs.readFileSync(path.join(__dirname, '../../public/caisse.html'), 'utf8');
let pass = 0, fail = 0;
const check = (n, ok) => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n); };
const payFn = c.slice(c.indexOf('function pay(method'), c.indexOf('function finalizeSale'));
const iCb = payFn.indexOf("if (method === 'cb')"), iDr = payFn.indexOf('openCashDrawerOnCash();');
check('pay() ouvre le tiroir pour les especes apres la branche carte (la carte ne l\'ouvre pas)', iCb > -1 && iDr > iCb);
check('ouverture silencieuse via le pont : commande ESC p mode drawer', /function openCashDrawerOnCash\(\)[\s\S]*?mode: 'drawer'/.test(c));
check('sans pont : rien de plus (l\'impression du ticket en fin de vente reste le repli)', /function openCashDrawerOnCash\(\) \{\n  if \(!tpeBridgeUrl\) return;/.test(c));
check('un echec du tiroir ne bloque pas la vente (simple message)', /openCashDrawerOnCash[\s\S]*?\.catch\(function \(e\) \{ toast\('Tiroir non ouvert/.test(c));
check('bouton manuel "Ouvrir la caisse" inchange', /function openCashDrawer\(\) \{\n  toast\('Ouverture du tiroir…'\)/.test(c));
console.log('\n' + pass + ' OK, ' + fail + ' ECHEC'); process.exit(fail ? 1 : 0);
