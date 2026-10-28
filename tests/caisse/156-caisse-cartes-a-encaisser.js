// Caisse > À encaisser : carte sur deux lignes (infos + montant / boutons qui passent a la ligne) ; la colonne de
// gauche ne peut plus pousser le ticket hors de l'ecran (ecran du salon a 100 %).
const fs = require('fs'), path = require('path');
const c = fs.readFileSync(path.join(__dirname, '../../public/caisse.html'), 'utf8');
let pass = 0, fail = 0;
const check = (n, ok) => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n); };
check('colonne de gauche bornee : minmax(0, 1fr) + min-width 0', /grid-template-columns: minmax\(0, 1fr\) 340px;/.test(c) && /\.caisse-grid-col \{ grid-area: grid; min-width: 0; \}/.test(c));
check('boutons sur une 2e ligne qui passe a la ligne', /\.pending-actions \{ display: flex; flex-wrap: wrap;/.test(c) && /\.pending-actions:empty \{ display: none; \}/.test(c));
check('les 3 cartes (normale, payee d\'avance, mise de cote) : infos + montant en haut', (c.match(/'<div class="pc-top"><div class="pc-info"><div class="name">'/g) || []).length === 3 && (c.match(/'<span class="amount">' \+ [^\n]+ \+ '<\/span><\/div>' \+\n\s*'<div class="pending-actions">'/g) || []).length === 3);
check('ordre : Encaisser le groupe, Absent, carte fidelite, Mettre de cote, corbeille a droite', /Encaisser le groupe \(' \+ \(mates\.length \+ earlyN \+ 1\) \+ '\)<\/button>'\n\s*: ''\) \+\n\s*unstartedAbsentBtn\(q\) \+\n\s*\(isActive && !q\.loyalty_member/.test(c) && /\.pending-del \{ margin-left: auto;/.test(c));
check('boutons assez grands pour le doigt (40 px)', /\.pending-actions \.btn \{ min-height: 40px;/.test(c));
console.log('\n' + pass + ' OK, ' + fail + ' ECHEC');
process.exit(fail ? 1 : 0);
