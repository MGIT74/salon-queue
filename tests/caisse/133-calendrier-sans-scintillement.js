// Calendriers sans scintillement : prise de RDV / compte client (grille mise a jour sur place, creneaux estompes pendant
// le chargement au lieu de « Chargement… »), admin et Mon poste (survol par couleur de fond, plus de filtre).
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n + (x ? '  [' + String(x).slice(0, 160) + ']' : '')); };
const rd = (f) => fs.readFileSync(path.join(__dirname, '../../public', f), 'utf8');
['rdv.html', 'compte.html'].forEach((f) => {
  const s = rd(f);
  check(f + ' : meme mois -> pas de reconstruction de la grille', s.includes("if(grid.dataset.key!==key || grid.querySelectorAll('button').length!==count){"));
  check(f + ' : un seul rendu par clic', s.includes("button.onclick=function(){if(input.value===value)return;input.value=value;input.dispatchEvent(new Event('change',{bubbles:true}));};"));
  check(f + ' : pas d\'animation sur les jours', !/closure-cal-grid button\{[^}]*transition/.test(s));
  check(f + ' : creneaux estompes pendant le chargement, reponse perimee ignoree', s.includes("slotsEl.classList.add('is-loading')") && s.includes('if (reqId !== slotsEl.__req) return;') && s.includes('.slots-grid.is-loading{opacity:.45;pointer-events:none}'));
});
['dashboard.html', 'poste.html'].forEach((f) => {
  const s = rd(f);
  check(f + ' : survol du calendrier sans filtre', !s.includes('.cal-day:hover { filter') && !/\.cal-day \{[^}]*transition: filter/.test(s) && s.includes('.cal-day:not(.empty):not(.selected):hover { background: var(--fill-2); }'));
});
const ar = rd('autorefresh.js');
check('actualisation discrete : une seule par periode d\'inactivite (plus de rechargement chaque seconde)', ar.includes('if (Date.now() - lastRun < idleMs) return;') && ar.includes('running = true; lastRun = Date.now();'));
['dashboard.html', 'poste.html', 'caisse.html'].forEach((f) => {
  const s = rd(f);
  check(f + ' : panneau du jour sans animation quand il est redessine', s.includes("var expandAgain = window.__calExpandDate === dateStr;") && s.includes('.cal-expand-panel.no-anim { animation: none; }') && s.includes('autorefresh.js?v=3'));
});
console.log(`\n${pass} OK, ${fail} ECHEC`);
process.exit(fail ? 1 : 0);
