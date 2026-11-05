// Réservation en ligne à plusieurs : à l'étape de l'heure de la 2e personne (et suivantes), raccourcis
// « À la suite de X » (même coiffeur, juste après, 45 min d'attente au plus) et « En même temps que X » (autre coiffeur, même heure).
const fs = require('fs'), path = require('path');
const rdv = fs.readFileSync(path.join(__dirname, '../../public/rdv.html'), 'utf8');
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n + (x ? '  [' + x + ']' : '')); };
const fnSrc = (name) => { const i = rdv.indexOf('function ' + name + '('); if (i === -1) return ''; const j = rdv.indexOf('\nfunction ', i + 10); return rdv.slice(i, j > -1 ? j : undefined); };
check('bloc « Pour venir ensemble » au-dessus des créneaux', /<div class="gt-box" id="grp-together" style="display:none"><\/div>\s*<div class="eyebrow"[^>]*>Créneaux disponibles<\/div>/.test(rdv));
check('se rapporte à la dernière personne du panier (pas celle qu\'on modifie)', /i !== grp\.editIndex && e\.person !== grp\.current/.test(fnSrc('gtRef')));
const rt = fnSrc('renderTogether');
check('« à la suite » : même coiffeur, premier créneau à partir de sa fin, 45 min d\'attente au plus', rdv.includes('var GT_MAX_WAIT = 45;') && /'&barber_id=' \+ encodeURIComponent\(ref\.barber_id\)/.test(rt) && /m >= refEnd && m - refEnd <= GT_MAX_WAIT/.test(rt) && /min d\\'attente/.test(rt));
check('« en même temps » : même heure de début, autre coiffeur', /x\.time === ref\.time && String\(x\.barber_id\) !== String\(ref\.barber_id\)/.test(rt));
check('même coiffeur choisi -> seulement « à la suite » ; autre coiffeur -> seulement « en même temps »', /var wantAfter = selBarber === '' \|\| String\(selBarber\) === String\(ref\.barber_id\);/.test(rt) && /var wantSame = String\(selBarber\) !== String\(ref\.barber_id\);/.test(rt));
check('option impossible : grisée avec la raison', /gt-opt off/.test(fnSrc('gtOptHtml')) && /n\\'a pas de place juste après/.test(rt) && /Aucun autre coiffeur libre à /.test(rt));
check('autre jour : lien « Le même jour que X »', /Le même jour que /.test(rt) && /function gtSameDay\(\)/.test(rdv));
check('choisir une option garde ce coiffeur (même avec « Premier disponible »)', /keepBarber: true/.test(fnSrc('gtPick')) && rdv.includes("any: selBarber === '' && !selSlot.keepBarber"));
check('relu à chaque chargement des créneaux', /renderTogether\(null\);/.test(fnSrc('loadSlots')) && /renderTogether\(r\.slots\);/.test(fnSrc('loadSlots')));
check('option = vrai bouton : « Choisir » (devient « ✓ Choisi »)', /<span class="gt-cta"><span class="off">Choisir<\/span><span class="on">✓ Choisi<\/span><\/span>/.test(rdv) && /\.gt-cta\{/.test(rdv));
check('raccourcis calculés sur toutes les heures (?all=1) : la grille, elle, suit le pas de la prestation / du supplément', /availability\?all=1&date=/.test(rt) && !/!held\.length/.test(fs.readFileSync(path.join(__dirname, '../../src/routes/appointments.js'), 'utf8').match(/const packed = [^\n]*/)[0]));
check('pas de bordure colorée à gauche (style « IA »)', !/\.gt-[a-z]+\{[^}]*border-left/.test(rdv));
console.log('\n' + pass + ' OK, ' + fail + ' ECHEC');
process.exit(fail ? 1 : 0);
