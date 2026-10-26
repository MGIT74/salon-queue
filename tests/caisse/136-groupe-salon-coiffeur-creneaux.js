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
const app = fs.readFileSync(path.join(__dirname, '../../public/app.js'), 'utf8');
const c = fs.readFileSync(path.join(__dirname, '../../public/compte.html'), 'utf8'), d = fs.readFileSync(path.join(__dirname, '../../public/dashboard.html'), 'utf8');
check('pastilles photo des coiffeurs (photo, sinon initiale sur sa couleur)', /function barberAvatarHtml\(b, list, size\)/.test(app) && s.includes('barberAvatarHtml(b, barbers, 30)'));
const vm = require('vm'); const ctx = {}; vm.createContext(ctx); vm.runInContext(app.match(/function anyBarberLabel\([\s\S]*?\n\}\n/)[0], ctx);
check('Premier disponible + creneau : le coiffeur retenu est affiche', ctx.anyBarberLabel([{ id: 'b1', name: 'Alice' }], 'b1') === 'Alice (premier disponible)' && ctx.anyBarberLabel([], null) === 'Premier disponible');
check('partout : en ligne, compte client, admin (fenetre et a plusieurs)', s.includes('anyBarberLabel(barbers, selSlot && selSlot.barberId)') && c.includes('anyBarberLabel(bookBarbers, selBookSlot && selBookSlot.barberId)') && (d.match(/anyBarberLabel\(rdvBarbers, state\.slotBarber\)/g) || []).length === 2 && d.includes('state.slotBarber = el.dataset.barber || null;'));
check('a plusieurs : le coiffeur retenu est mis en evidence dans les pastilles', s.includes("var auto = selBarber === '' && selSlot ? String(selSlot.barberId) : '';") && s.includes("<em>retenu</em>"));
console.log(`\n${pass} OK, ${fail} ECHEC`);
process.exit(fail ? 1 : 0);
