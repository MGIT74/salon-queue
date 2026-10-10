// L'historique des clotures est reserve a l'admin : absent de la caisse partagee (caisse.html) et refuse aux coiffeurs (PIN).
const fs = require('fs'), path = require('path');
const rd = (p) => fs.readFileSync(path.join(__dirname, '../..', p), 'utf8');
const caisse = rd('public/caisse.html'), owner = rd('src/routes/owner.js'), dash = rd('public/dashboard.html');
let pass = 0, fail = 0;
const check = (n, ok) => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n); };
check('caisse.html : plus de titre ni de liste « Historique des clôtures »', !/Historique des clôtures/.test(caisse.replace(/\/\/[^\n]*/g, '')) && !/cloture-history-list/.test(caisse));
check('caisse.html : plus d\'appel a la liste des clotures', !/caisse\/closings\?/.test(caisse));
check('caisse.html : le Z qu\'on vient de faire reste imprimable (closings/:id)', /caisse\/closings\/' \+ id/.test(caisse) && /printZTicket\(r2\.id\)/.test(caisse));
check('API liste des clotures : admin seulement', /router\.get\('\/caisse\/closings', requireAdmin,/.test(owner));
check('API detail d\'un Z : toujours accessible au coiffeur connecte', /router\.get\('\/caisse\/closings\/:id', requireAdminOrBarber/.test(owner));
check('dashboard admin : historique des clotures toujours present', /Historique des clôtures/.test(dash) && /api\('\/api\/owner\/caisse\/closings'/.test(dash));
console.log('\n' + pass + ' OK, ' + fail + ' ECHEC'); process.exit(fail ? 1 : 0);
