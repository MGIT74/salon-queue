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
check('en ligne et salon (a plusieurs) : tous ceux qui font la prestation, absents estompes', !r.includes('if (staff && offOn(b)) return false;') && r.includes('var off = b && offOn(b);') && r.includes('.dt-barber-pic.off{opacity:.45}'));
check('en ligne : « en congé jusqu\'au … »', r.includes('function dtBarberLeaveNote(list)'));
check('en ligne : changer de coiffeur relit le calendrier et les creneaux', /function pickDtBarber\(id\) \{[\s\S]*?applyBarberOffer\(\);\s*if \(!STAFF_BRIDGE\) renderBarberGrid\(\);[\s\S]*?rdvPickOpenDay[\s\S]*?loadSlots\(\);/.test(r));
check('compte : coiffeurs en conge toujours dans la liste', c.includes('bookBarbers = r[3].items.filter(function (b) { return b.accepts_appointments && hasBookableSchedule(b); });'));
check('compte : coiffeurs au-dessus des creneaux', c.includes('<div class="dt-barbers" id="bk-dt-barbers"') && c.includes('function renderBookDtBarbers()') && /function pickBookDtBarber\(id\) \{[\s\S]*?bkPickOpenDay[\s\S]*?loadBookSlots\(\);/.test(c));
check('compte : coiffeur absent ce jour-la -> « indisponible »', c.includes("(isOnLeaveOn(offB, selBookDate) ? ' (en congé)' : '')"));
// Partout : admin (Ajouter un RDV / Deplacer), caisse et poste (Ajouter un RDV / Deplacer).
const app = fs.readFileSync(path.join(__dirname, '../../public/app.js'), 'utf8');
const d = fs.readFileSync(path.join(__dirname, '../../public/dashboard.html'), 'utf8');
const ca = fs.readFileSync(path.join(__dirname, '../../public/caisse.html'), 'utf8');
const po = fs.readFileSync(path.join(__dirname, '../../public/poste.html'), 'utf8');
check('outil commun : pastilles des coiffeurs + message « indisponible »', /function barberChipsHtml\(o\)/.test(app) && /function barberOffSlotsHtml\(b, dateStr, canChangeDay\)/.test(app) && /function barberChipAvatarHtml\(b, list\)/.test(app));
const vm = require('vm'); const ctx = {}; vm.createContext(ctx);
vm.runInContext("function esc(x) { return String(x == null ? '' : x).replace(/&/g, '&amp;').replace(/</g, '&lt;'); }\n" + ['isOnLeaveOn', 'isWalkinOn', 'barberBookableOn', 'barberOffOn', 'barberOffSlotsHtml'].map((f) => (app.match(new RegExp('function ' + f + '\\([\\s\\S]*?\\n\\}\\n')) || [''])[0]).join('\n'), ctx);
const bob = { name: 'Bob', leaves: [{ start_date: '2026-10-27', end_date: '2026-10-29' }] };
check('message : « Bob est indisponible ce jour-là (en congé) »', ctx.barberOffOn(bob, '2026-10-28') === true && ctx.barberOffOn(bob, '2026-10-30') === false && /Bob est indisponible ce jour-là \(en congé\)\. Choisissez un autre coiffeur ci-dessus\./.test(ctx.barberOffSlotsHtml(bob, '2026-10-28', false)));
check('admin : coiffeurs absents toujours proposes (« Indisponible ce jour-là »)', d.includes('var rdvBarbers = barbers.filter(function (b) { return isBookableForAdmin(b); });') && d.includes("'Indisponible ce jour-là'"));
check('admin : pastilles au-dessus des creneaux, changer de coiffeur', d.includes('<div class="dt-barbers" id="aa-dt-barbers"></div>') && d.includes("onPick: 'aaPickDtBarber'") && d.includes('if (offB && barberOffOn(offB, dateStr)) { slotsEl.innerHTML = barberOffSlotsHtml(offB, dateStr, false); return; }'));
[['caisse', ca, 'barber'], ['poste', po, 'target']].forEach(([n, src, v]) => {
  check(n + ' : pastilles au-dessus des creneaux, changer de coiffeur', src.includes('<div class="dt-barbers" id="pa-dt-barbers"></div>') && src.includes("onPick: 'paPickDtBarber', any: false") && src.includes('if (' + v + ' && barberOffOn(' + v + ', dateStr)) { slotsEl.innerHTML = barberOffSlotsHtml(' + v + ', dateStr, false); return; }'));
  check(n + ' : Deplacer -> tous les coiffeurs, « indisponible ce jour-là »', src.includes('return b.id === a.barber_id || Boolean(b.accepts_appointments && b.active !== 0 && hasBookableSchedule(b));') && src.includes("' — indisponible ce jour-là'") && src.includes('barberOffSlotsHtml(offB, date, true)'));
});
check('admin : Deplacer -> « indisponible ce jour-là »', d.includes('barberOffSlotsHtml(offB, date, true)'));
// Changer de coiffeur : le calendrier va au premier jour disponible de CE coiffeur (a partir d'aujourd'hui).
check('en ligne : calendrier au premier jour disponible du coiffeur choisi', r.includes('window.rdvPickOpenDay = function(auto, fromToday){') && r.includes("if (autoPick && fromToday) input.value = '';") && r.includes("window.rdvPickOpenDay(!(grp && grp.date), true);") && r.includes('window.rdvPickOpenDay(!(grp && grp.date), barberChanged);'));
check('compte : idem', c.includes('window.bkPickOpenDay = function(auto, fromToday){') && c.includes("window.bkPickOpenDay(!(bkGrp && bkGrp.date), true);") && c.includes('window.bkPickOpenDay(!(bkGrp && bkGrp.date), barberChanged);'));
check('Deplacer (admin, caisse, poste) : autre coiffeur -> son premier jour disponible', /function firstBookableDayFor\(b, fromStr, isClosed\)/.test(app) && [d, ca, po].every((s) => s.includes("overlay.querySelector('#rs-barber').onchange = function () {") && s.includes('firstBookableDayFor(nb, salonToday()')));
// Ajouter un RDV a un coiffeur absent ce jour-la (ligne du planning, ou fenetre avec ce coiffeur) : message, pas de fenetre.
check('outil commun : raison de l\'absence (conge / sans RDV / ne travaille pas)', /function barberOffReason\(b, dateStr\)/.test(app) && app.includes("return 'ne travaille pas ce jour-là';"));
check('admin : coiffeur absent -> ligne avec message, ajout refuse', d.includes("data-off-reason=\"' + esc(b.offReason) + '\"") && d.includes('if (preOff) { toast(preB.name + \' \' + preOff') && d.includes('barberBookableOn(b, dateStr)));'));
check('caisse : ajout refuse pour un coiffeur absent', ca.includes("if (offWhy) { toast(barber.name + ' ' + offWhy") && ca.includes('data-off-reason="\' + esc(barberOffReason(rowBarber, dateStr))'));
check('poste : ajout refuse pour un coiffeur absent', po.includes("if (offWhy) { toast(target.name + ' ' + offWhy") && po.includes(": offWhy ? ' onclick=\"toast("));
console.log(`\n${pass} OK, ${fail} ECHEC`);
process.exit(fail ? 1 : 0);
