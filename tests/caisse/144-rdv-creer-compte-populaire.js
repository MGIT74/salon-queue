// Prise de RDV, 1er ecran : « Creer un compte » mis en avant (badge « Le plus populaire », avantage carte de fidelite).
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const check = (n, ok) => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n); };
const r = fs.readFileSync(path.join(__dirname, '../../public/rdv.html'), 'utf8');
check('badge « Le plus populaire » sur « Créer un compte »', r.includes('class="gb-choice start-popular" id="start-signup" onclick="goSignup(event)"><span class="start-badge">★ Le plus populaire</span>'));
check('texte : Gratuit, en une minute + carte de fidélité', r.includes('<em>Gratuit, en une minute</em><span class="start-perk">Profitez de la carte de fidélité</span>'));
check('mise en avant (bordure, badge au-dessus, version mobile)', r.includes('#p-start .start-popular{position:relative;border-color:var(--blue)') && r.includes('#p-start .start-badge{position:absolute;top:-12px') && r.includes('@media(max-width:759px){#p-start .start-badge{'));
check('deja connecte : la carte reste masquee (inchange)', r.includes("document.getElementById('start-signup').style.display = 'none'"));
console.log(`\n${pass} OK, ${fail} ECHEC`);
process.exit(fail ? 1 : 0);
