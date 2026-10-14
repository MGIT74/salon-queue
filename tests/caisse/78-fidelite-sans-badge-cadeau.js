// Compte client : plus de badge « cadeau disponible » dans la carte fidelite (les cadeaux ont leur propre section).
const fs = require('fs'), path = require('path');
const h = fs.readFileSync(path.join(__dirname, '../../public/compte.html'), 'utf8');
let pass = 0, fail = 0;
const check = (n, ok) => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n); };
check('plus de badge cadeau dans la fidelite', !/loyalty-gift/.test(h) && !/gift-badge/.test(h) && !/cadeau disponible/.test(h));
check('les points restent affiches', /id="loyalty-points"/.test(h) && /getElementById\('loyalty-points'\)\.textContent = d\.loyalty\.points/.test(h));
check('section « Mes cadeaux » conservee', /id="gift-cards-section"/.test(h));
console.log('\n' + pass + ' OK, ' + fail + ' ECHEC'); process.exit(fail ? 1 : 0);
