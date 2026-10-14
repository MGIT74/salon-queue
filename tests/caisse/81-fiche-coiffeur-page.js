// Onglet Coiffeurs : cartes de coiffeurs, clic = fiche en « page » (retour, resume du jour, onglets, profil), autres coiffeurs en bas.
const fs = require('fs'), path = require('path');
const dash = fs.readFileSync(path.join(__dirname, '../../public/dashboard.html'), 'utf8');
let pass = 0, fail = 0;
const check = (n, ok) => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n); };
check('liste : grille de cartes de coiffeurs (plus d\'accordeon)', /class="bc-grid"/.test(dash) && /function barberCardHtml\(b, current\)/.test(dash) && !/class="barber-head"/.test(dash));
check('clic sur une carte : ouvre la fiche (toggleBarberExpand = ouvrir)', /onclick="toggleBarberExpand\(\\'' \+ b\.id/.test(dash) && /expandedBarberId = id;/.test(dash));
check('bouton Retour vers la liste', /class="bp-back" onclick="closeBarber\(\)"/.test(dash) && /function closeBarber\(\)/.test(dash));
check('titre « Coiffeurs et horaires » + Ajouter masques quand une fiche est ouverte', /id="barbers-head"/.test(dash) && /head\.style\.display = cur \? 'none' : ''/.test(dash));
check('resume du jour : coupes, encaisse, occupation (API stats existante)', /bp-kpi-done-/.test(dash) && /bp-kpi-rev-/.test(dash) && /bp-kpi-occ-/.test(dash) && /function loadBarberKpis\(id\)/.test(dash));
check('onglets existants conserves (Horaires, Prestations, Statistiques, Congés)', ['horaires', 'prestations', 'stats', 'conges'].every((t) => new RegExp("switchBarberTab\\(\\\\'' \\+ b\\.id \\+ '\\\\',\\\\'" + t + "\\\\'\\)").test(dash)));
check('profil a droite : photo avec anneau, puces d\'etat, actions (renommer, photo, code, desactiver)', /class="bp-ring"/.test(dash) && /renameBarber\(/.test(dash) && /setBarberPin\(/.test(dash) && /archiveBarber\(/.test(dash));
check('tout en bas : rangee des cartes de chaque coiffeur pour naviguer (courant surligne)', /class="bp-others"/.test(dash) && /barberCardHtml\(b, b\.id === cur\.id\)/.test(dash) && /\.bc\.cur \{/.test(dash));
check('mobile : une colonne', /@media \(max-width: 980px\) \{\s*\.bp-layout \{ grid-template-columns: minmax\(0, 1fr\); \}/.test(dash));
check('onglet rempli apres CHAQUE rendu (jamais bloque sur « Chargement… » apres un conge enregistre)', /populateBarberTab\(cur\.id\);\n\}/.test(dash) && /if \(barberLeaves\[id\]\) renderLeavesList\(id\); else loadBarberLeaves\(id\)/.test(dash));
console.log('\n' + pass + ' OK, ' + fail + ' ECHEC'); process.exit(fail ? 1 : 0);
