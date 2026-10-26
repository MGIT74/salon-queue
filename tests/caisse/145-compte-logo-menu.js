// Compte client : logo du salon au-dessus du menu « Accueil » (barre laterale ordinateur / tablette ; telephone inchange).
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const check = (n, ok) => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n); };
const c = fs.readFileSync(path.join(__dirname, '../../public/compte.html'), 'utf8');
check('logo en premier dans le menu, avant « Accueil »', /<div class="client-footer" id="client-footer">\s*<!--[^>]*-->\s*<div class="side-logo" id="side-logo"[^>]*><\/div>\s*<button id="nav-home"/.test(c));
check('logo du salon (Reglages) applique, seulement s\'il existe', c.includes("if (sideLogo && d.logo_url) {") && c.includes("sideLogo.classList.add('has-logo');"));
check('telephone : menu du bas inchange (logo cache)', c.includes('.side-logo { display: none; }'));
check('tablette et ordinateur : logo affiche', c.includes('body.has-footer .client-footer.on .side-logo.has-logo { display: block; width: 56px;') && c.includes('body.has-footer .client-footer.on .side-logo.has-logo { width: 72px;'));
console.log(`\n${pass} OK, ${fail} ECHEC`);
process.exit(fail ? 1 : 0);
