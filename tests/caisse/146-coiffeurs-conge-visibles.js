// Prise de RDV en ligne (et compte client) : tous les coiffeurs restent proposes, meme en conge ; un coiffeur absent le
// jour choisi est signale « indisponible » aux creneaux. A l'etape date, les coiffeurs qui font la prestation choisie
// sont proposes au-dessus des creneaux pour changer de coiffeur sans recommencer la reservation.
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const check = (n, ok) => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n); };
const r = fs.readFileSync(path.join(__dirname, '../../public/rdv.html'), 'utf8');
const c = fs.readFileSync(path.join(__dirname, '../../public/compte.html'), 'utf8');
check('en ligne : coiffeurs en conge toujours dans la liste', r.includes('barbers = r[3].items.filter(function (b) { return b.accepts_appointments && hasBookableSchedule(b); });'));
check('en ligne : coiffeur absent ce jour-la -> « indisponible » aux creneaux', r.includes("' est indisponible ce jour-là' +") && r.includes("(isOnLeaveOn(offB, selDate) ? ' (en congé)' : '')"));
check('en ligne : coiffeurs proposes au-dessus des creneaux (sauf carte cadeau)', r.includes('function dtBarberChoice() { return staffBarberChoice() || (!STAFF_BRIDGE && !activeGift); }'));
check('en ligne : tous ceux qui font la prestation, absents estompes', r.includes('if (staff && offOn(b)) return false;') && r.includes("(off ? ' off' : '')") && r.includes('.dt-barber-pic.off{opacity:.45}'));
check('en ligne : « en congé jusqu\'au … »', r.includes('function dtBarberLeaveNote(list)'));
check('en ligne : changer de coiffeur relit le calendrier et les creneaux', /function pickDtBarber\(id\) \{[\s\S]*?applyBarberOffer\(\);\s*if \(!STAFF_BRIDGE\) renderBarberGrid\(\);[\s\S]*?rdvPickOpenDay[\s\S]*?loadSlots\(\);/.test(r));
check('compte : coiffeurs en conge toujours dans la liste', c.includes('bookBarbers = r[3].items.filter(function (b) { return b.accepts_appointments && hasBookableSchedule(b); });'));
check('compte : coiffeurs au-dessus des creneaux', c.includes('<div class="dt-barbers" id="bk-dt-barbers"') && c.includes('function renderBookDtBarbers()') && /function pickBookDtBarber\(id\) \{[\s\S]*?bkPickOpenDay[\s\S]*?loadBookSlots\(\);/.test(c));
check('compte : coiffeur absent ce jour-la -> « indisponible »', c.includes("(isOnLeaveOn(offB, selBookDate) ? ' (en congé)' : '')"));
console.log(`\n${pass} OK, ${fail} ECHEC`);
process.exit(fail ? 1 : 0);
