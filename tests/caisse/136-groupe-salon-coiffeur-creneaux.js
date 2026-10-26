// RDV a plusieurs depuis le salon (admin, caisse, Mon poste : rdv.html?staff=1) : chaque personne commence par la
// prestation ; le coiffeur se choisit au-dessus des creneaux (« Premier disponible » par defaut). En ligne : inchange.
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n + (x ? '  [' + String(x).slice(0, 160) + ']' : '')); };
const s = fs.readFileSync(path.join(__dirname, '../../public/rdv.html'), 'utf8');
check('salon : la personne commence par la prestation, « Premier disponible » par defaut', /if \(STAFF_BRIDGE\) \{\s*if \(!entry\) \{ selBarber = ''; applyBarberOffer\(\); \}\s*show\('p-service'\);\s*return;\s*\}\s*show\('p-barber'\);/.test(s));
check('en ligne : etape Coiffeur inchangee', /function serviceBack\(\) \{\s*if \(STAFF_BRIDGE && grp\) return barberBack\(\);\s*show\('p-barber'\);/.test(s));
check('coiffeurs au-dessus des creneaux (seulement ceux qui font la prestation) + Premier disponible', s.includes('id="dt-barbers"') && /function renderDtBarbers\(\)/.test(s) && s.includes("chip('', 'Premier disponible'") && s.includes('function staffBarberChoice() { return !!(STAFF_BRIDGE && grp); }'));
check('changer de coiffeur relit les creneaux', /function pickDtBarber\(id\) \{[\s\S]*?loadSlots\(\);/.test(s));
check('affiche a l\'etape date', /renderDtBarbers\(\);\n  if \(window\.rdvPickOpenDay\)/.test(s));
console.log(`\n${pass} OK, ${fail} ECHEC`);
process.exit(fail ? 1 : 0);
