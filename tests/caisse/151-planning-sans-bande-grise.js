// Planning du jour (caisse, poste, admin) : plus de bande grise sur la ligne d'un coiffeur au survol (comme l'admin).
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const check = (n, ok) => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n); };
['caisse.html', 'poste.html', 'dashboard.html'].forEach((f) => {
  const s = fs.readFileSync(path.join(__dirname, '../../public/' + f), 'utf8');
  check(f + ' : aucun fond gris au survol d\'une ligne de coiffeur', !/\.timeline-row-track:hover\s*\{[^}]*background/.test(s));
});
console.log('\n' + pass + ' OK, ' + fail + ' ECHEC');
process.exit(fail ? 1 : 0);
