// Menu lateral du dashboard (BUREAU uniquement) : en-tete fixe (logo, selecteur,
// Reduire) / navigation qui defile / pied fixe (Deconnexion, Theme). Garde-fou :
// ces regles doivent rester dans le bloc @media (min-width: 861px) - la version
// mobile (<= 860px) ne doit jamais les recevoir. (La disposition reelle a ete
// verifiee dans un vrai navigateur ; ici on empeche seulement qu'elle derive.)
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '../../public/dashboard.html'), 'utf8');
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n + (x ? '  [' + x + ']' : '')); };

// Renvoie le texte complet d'un bloc @media (accolades equilibrees) a partir de sa position.
function blockAt(txt, start) {
  let depth = 0, i = txt.indexOf('{', start);
  const from = start;
  for (; i < txt.length; i++) {
    if (txt[i] === '{') depth++;
    else if (txt[i] === '}') { depth--; if (depth === 0) return txt.slice(from, i + 1); }
  }
  return null;
}
const mobile = blockAt(src, src.indexOf('@media (max-width: 860px) {'));
// le bloc bureau qui porte les regles des 3 zones (il y en a un autre, plus haut, pour le menu replie)
const marker = src.indexOf('Menu lateral en 3 zones');
const desktop = blockAt(src, src.indexOf('@media (min-width: 861px) {', marker));

console.log('\n[A] Les regles des 3 zones sont dans le bloc BUREAU (>= 861px)');
check('bloc bureau trouve', Boolean(desktop));
check('le menu est une colonne flex', /\.sidebar \{ display: flex; flex-direction: column; \}/.test(desktop));
check('en-tete et pied ne retrecissent pas (fixes)', /\.sidebar-brand, \.sidebar-collapse-btn, \.sidebar-logout, \.sidebar-theme-btn \{ flex-shrink: 0; \}/.test(desktop));
check('la navigation est la seule zone qui defile (min-height:0 + overflow-y:auto)', /\.tabs \{[^}]*min-height: 0;[^}]*overflow-y: auto;/.test(desktop));
check('les boutons de la navigation ne s\'ecrasent pas', /\.tabs button \{ flex-shrink: 0; \}/.test(desktop));
check('fine ligne au-dessus du pied (accrochee au 1er element : Theme)', /\.sidebar-theme-btn::before/.test(desktop) && !/\.sidebar-logout::before/.test(desktop));

console.log('\n[B] RIEN de tout cela dans le bloc MOBILE (<= 860px)');
check('bloc mobile trouve', Boolean(mobile));
check('le mobile ne recoit pas la colonne flex du menu', !/\.sidebar \{ display: flex; flex-direction: column; \}/.test(mobile));
check('le mobile ne recoit pas la zone defilante de la navigation', !/\.tabs \{[^}]*min-height: 0;[^}]*overflow-y: auto;/.test(mobile));
check('le mobile ne recoit pas la ligne du pied', !/\.sidebar-theme-btn::before/.test(mobile));

console.log('\n[C] Ces regles ne fuient pas hors du bloc bureau');
const outside = src.replace(desktop, '');
check('aucune autre definition de la ligne du pied hors du bloc bureau', !/\.sidebar-theme-btn::before/.test(outside));
check('aucune autre colonne flex du menu hors du bloc bureau', !/\.sidebar \{ display: flex; flex-direction: column; \}/.test(outside));

console.log('\n[D] Ordre dans la page : en-tete, navigation, Theme, Reduire, DECONNEXION en tout dernier');
const aside = src.slice(src.indexOf('<aside class="sidebar">'), src.indexOf('</aside>', src.indexOf('<aside class="sidebar">')));
const pos = (k) => aside.indexOf(k);
check('ordre du pied : Theme < Reduire < Deconnexion', pos('class="sidebar-theme-btn"') < pos('class="sidebar-collapse-btn"') && pos('class="sidebar-collapse-btn"') < pos('class="sidebar-logout"'));
check('la navigation est avant tout le pied', pos('id="tabs"') < pos('class="sidebar-theme-btn"'));
check('Deconnexion est le TOUT DERNIER bouton du menu (aucun autre bouton apres lui)', aside.slice(pos('class="sidebar-logout"')).indexOf('<button') === -1);
check('Reduire n\'est plus entre l\'en-tete et la navigation', !(pos('class="sidebar-collapse-btn"') > pos('class="sidebar-brand"') && pos('class="sidebar-collapse-btn"') < pos('id="tabs"')));
check('les boutons gardent leurs actions (repli, deconnexion, theme)', /class="sidebar-collapse-btn" onclick="toggleSidebarCollapsed\(\)"/.test(aside) && /class="sidebar-logout" onclick="logout\(\)"/.test(aside) && /class="sidebar-theme-btn" onclick="toggleTheme\(\)"/.test(aside));
check('espacements du pied dans le bloc bureau', /\.sidebar-theme-btn \{ position: relative; margin-top: 10px; \}/.test(desktop) && /\.sidebar-collapse-btn \{ margin: 4px 0 0; \}/.test(desktop) && /\.sidebar-logout \{ margin-top: 4px; \}/.test(desktop));
check('...et aucun dans le bloc mobile (ou ces boutons restent masques)', !/\.sidebar-(collapse-btn|logout|theme-btn) \{ (margin|position)/.test(mobile));

console.log(`\nRESULTAT : ${pass} verifications reussies, ${fail} echec(s)`);
process.exit(fail ? 1 : 0);
