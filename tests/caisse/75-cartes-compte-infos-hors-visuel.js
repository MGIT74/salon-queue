// Compte client : cartes fidelite et cadeau = visuel propre (sans filtre sombre), infos ecrites dessous.
const fs = require('fs'), path = require('path');
const h = fs.readFileSync(path.join(__dirname, '../../public/compte.html'), 'utf8');
let pass = 0, fail = 0;
const check = (n, ok) => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n); };
check('visuel .card-art (ratio 9/4) sans texte dedans', /\.card-art\s*\{[^}]*aspect-ratio:\s*9 \/ 4/.test(h));
check('fidelite : points + logo dans .card-info, sous le visuel', /id="loyalty-card-art"><div class="card-shine"><\/div><\/div>\s*<div class="card-info">[\s\S]*?id="loyalty-points"/.test(h));
check('cadeau : montant, puces, code et bouton dans .card-info apres .card-art', /class="card-art"><div class="card-shine"><\/div><\/div>' \+\s*'<div class="card-info">'[\s\S]*?gift-use-btn/.test(h));
check('aucun filtre noir sur les cartes fidelite / cadeau', !/#loyalty-section \.card\.has-bg::before/.test(h) && !/\.gift-card\.has-bg::before/.test(h));
check('image perso appliquee sur le visuel (fidelite)', /loyaltyArt\.style\.backgroundImage/.test(h));
check('image perso appliquee sur le visuel (cadeau)', /art\.style\.backgroundImage = 'url\("' \+ currentGiftCardImageForCards/.test(h));
check('infos sur un fond (panneau arrondi) sous le visuel, pas flottantes', /\.card-info\s*\{[^}]*background:\s*var\(--fill\)[^}]*border-radius:\s*18px|\.card-info\s*\{[^}]*border-radius:\s*18px[^}]*background:\s*var\(--fill\)/.test(h));
console.log('\n' + pass + ' OK, ' + fail + ' ECHEC'); process.exit(fail ? 1 : 0);
