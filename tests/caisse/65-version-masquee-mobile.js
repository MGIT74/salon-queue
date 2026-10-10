// La version de l'app (v0.0.1) s'affiche sous "Deconnexion" sur ordinateur, mais est masquee en mobile (barre du bas).
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '../../public/dashboard.html'), 'utf8');
let pass = 0, fail = 0;
const check = (n, ok) => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n); };
const mq = src.indexOf('@media (max-width: 860px) {\n    .app-shell');
check('bloc mobile (<= 860px) trouve', mq > 0);
check('mobile : .sidebar-version masquee', /\.sidebar-version \{ display: none !important; \}/.test(src.slice(mq, mq + 700)));
check('bureau : la version reste affichee sous Deconnexion', /<span class="label">Déconnexion<\/span>[\s\S]{0,120}<div class="sidebar-version"[^>]*>v0\.0\.1<\/div>/.test(src));
console.log('\n' + pass + ' OK, ' + fail + ' ECHEC'); process.exit(fail ? 1 : 0);
