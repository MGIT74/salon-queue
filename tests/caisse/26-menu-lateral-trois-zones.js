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
check('fine ligne au-dessus du pied', /\.sidebar-logout::before/.test(desktop));

console.log('\n[B] RIEN de tout cela dans le bloc MOBILE (<= 860px)');
check('bloc mobile trouve', Boolean(mobile));
check('le mobile ne recoit pas la colonne flex du menu', !/\.sidebar \{ display: flex; flex-direction: column; \}/.test(mobile));
check('le mobile ne recoit pas la zone defilante de la navigation', !/\.tabs \{[^}]*min-height: 0;[^}]*overflow-y: auto;/.test(mobile));
check('le mobile ne recoit pas la ligne du pied', !/\.sidebar-logout::before/.test(mobile));

console.log('\n[C] Ces regles ne fuient pas hors du bloc bureau');
const outside = src.replace(desktop, '');
check('aucune autre definition de .sidebar-logout::before hors du bloc bureau', !/\.sidebar-logout::before/.test(outside));
check('aucune autre colonne flex du menu hors du bloc bureau', !/\.sidebar \{ display: flex; flex-direction: column; \}/.test(outside));

console.log('\n[D] Ordre dans la page : en-tete, navigation, Deconnexion, Theme, REDUIRE en dernier');
const aside = src.slice(src.indexOf('<aside class="sidebar">'), src.indexOf('</aside>'));
const pos = (k) => aside.indexOf(k);
check('Reduire est APRES Theme', pos('class="sidebar-collapse-btn"') > pos('class="sidebar-theme-btn"') && pos('class="sidebar-theme-btn"') > pos('class="sidebar-logout"'));
check('Reduire n\'est plus entre l\'en-tete et la navigation', !(pos('class="sidebar-collapse-btn"') > pos('class="sidebar-brand"') && pos('class="sidebar-collapse-btn"') < pos('id="tabs"')));
check('Reduire reste dans le menu (avant </aside>)', pos('class="sidebar-collapse-btn"') !== -1);
check('le bouton garde son action de repli', /class="sidebar-collapse-btn" onclick="toggleSidebarCollapsed\(\)"/.test(aside));
check('marges du bouton ajustees pour sa place en bas (bloc bureau)', /\.sidebar-collapse-btn \{ margin: 4px 0 0; \}/.test(desktop));
check('...et pas dans le bloc mobile (ou il reste masque)', !/\.sidebar-collapse-btn \{ margin/.test(mobile) && /\.sidebar-collapse-btn \{ display: none; \}/.test(mobile));

console.log(`\nRESULTAT : ${pass} verifications reussies, ${fail} echec(s)`);
process.exit(fail ? 1 : 0);
