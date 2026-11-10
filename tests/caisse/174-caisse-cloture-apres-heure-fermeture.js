// Caisse : clôture commencée avant l'heure de fermeture automatique et validée juste après (Valleiry).
// Avant : le contrôle « caisse fermée » (toutes les 30 s) fermait la session pendant les confirmations,
// la clôture partait sans code PIN (« Authentification requise ») et le ticket Z n'était jamais proposé.
const fs = require('fs'), path = require('path');
const c = fs.readFileSync(path.join(__dirname, '../../public/caisse.html'), 'utf8');
let pass = 0, fail = 0;
const check = (n, ok) => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n); };
check('pas de déconnexion tant que l\'onglet Clôture est ouvert avec le code PIN',
  c.includes("var closingOpen = !!clotureVerifiedBarber && document.getElementById('panel-cloture').classList.contains('on');") &&
  c.includes("if (me && !paymentInFlight && !zOpen && !closingOpen) { logout(); showLoginOrLocked(); }"));
check('la clôture et le Z gardent la session du coiffeur jusqu\'au bout',
  /function startCaisseClosing\(\) \{\s*if \(me\) zSessionMe = me;/.test(c) &&
  c.includes("zApi('/api/owner/caisse/close', { method: 'POST'") && c.includes("zApi('/api/owner/caisse/closings/' + id)"));
check('après déconnexion, plus d\'interrogation des encaissements en attente (401 en boucle)',
  /function logout\(\) \{[\s\S]{0,400}clearInterval\(pendingPaymentsInterval\); pendingPaymentsInterval = null;/.test(c));
console.log('\n' + pass + ' OK, ' + fail + ' ECHEC');
process.exit(fail ? 1 : 0);
