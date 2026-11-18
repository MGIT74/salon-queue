// Calendrier des congés d'un coiffeur : fermer la bulle (« Fermer » ou clic en dehors) après un changement ne
// redessine plus toute la fiche. Avant : statistiques + historique rechargés -> la page raccourcissait et remontait
// tout en haut, même avec le mois choisi en bas (tablette, petite fenêtre). Maintenant : seules les pastilles.
const fs = require('fs'), path = require('path');
const d = fs.readFileSync(path.join(__dirname, '../../public/dashboard.html'), 'utf8');
let pass = 0, fail = 0;
const check = (n, ok) => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n); };
const fn = (name) => { const i = d.indexOf('function ' + name + '('); const j = d.indexOf('\nfunction ', i + 10); return i === -1 ? '' : d.slice(i, j === -1 ? undefined : j); };
const close = fn('lvClose'), quiet = fn('refreshBarberChipsQuiet');
check('fermer la bulle après un changement : mise à jour discrète, plus loadBarbers()', close.includes('refreshBarberChipsQuiet()') && !close.includes('loadBarbers()'));
check('la mise à jour discrète ne redessine pas la fiche (pas de renderBarbers ni de statistiques)', !!quiet && !/renderBarbers\(|loadBarberStats\(|innerHTML = barberTabBody/.test(quiet));
check('…mais met à jour les pastilles « En congé » (fiche + cartes), le compteur et les bulles de la file', quiet.includes(".bp-chips") && quiet.includes('.bc-chips') && quiet.includes('updateLeaveKpi()') && quiet.includes('renderSeg()'));
console.log('\n' + pass + ' OK, ' + fail + ' ECHEC');
process.exit(fail ? 1 : 0);
