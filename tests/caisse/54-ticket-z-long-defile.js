// Ticket Z / reçu très long : la carte défile, Fermer/Imprimer restent visibles, l'impression garde tout.
const fs = require('fs'), path = require('path');
const rd = (f) => fs.readFileSync(path.join(__dirname, '../../' + f), 'utf8');
let pass = 0, fail = 0;
const check = (n, ok) => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n); };
for (const f of ['public/caisse.html', 'public/dashboard.html']) {
  const c = rd(f);
  check(f + ' : carte Z limitée à la hauteur de l\'écran, contenu défilant', /\.z-box, \.receipt-box \{ max-height: calc\(100vh - 40px\); max-height: calc\(100dvh - 40px\); overflow-y: auto/.test(c));
  check(f + ' : barre Fermer/Imprimer collée en bas (sticky)', /\.z-box \.z-actions, \.receipt-box \.receipt-actions \{\s*position: sticky; bottom: -26px/.test(c));
  check(f + ' : à l\'impression tout est imprimé (pas de coupure)', /@media print \{ \.z-box, \.receipt-box \{ max-height: none !important; overflow: visible !important/.test(c));
}
console.log('\n' + pass + ' OK, ' + fail + ' ECHEC'); process.exit(fail ? 1 : 0);
