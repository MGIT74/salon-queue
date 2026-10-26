// Compte client : menu lateral au dessin de la barre laterale de l'admin (carte arrondie flottante, logo + nom du salon
// en tete, onglet actif sur fond gris, Deconnexion en rouge en bas). Telephone : menu du bas inchange.
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const check = (n, ok) => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n); };
const c = fs.readFileSync(path.join(__dirname, '../../public/compte.html'), 'utf8');
check('en-tete du menu (logo + nom du salon) avant « Accueil »', /<div class="client-footer" id="client-footer">\s*<!--[\s\S]*?-->\s*<div class="side-brand"><div class="side-logo" id="side-logo"[^>]*><\/div><div class="side-salon" id="side-salon"><\/div><\/div>\s*<button id="nav-home"/.test(c));
check('logo du salon (Reglages) applique seulement s\'il existe, nom du salon renseigne', c.includes("if (sideLogo && d.logo_url) {") && c.includes("sideLogo.classList.add('has-logo');") && c.includes("if (sideSalon) sideSalon.textContent = d.salon_name;"));
check('telephone : menu du bas inchange (en-tete cache)', c.includes('.side-brand, .side-logo { display: none; }'));
check('carte flottante arrondie comme l\'admin', c.includes('top: 20px; bottom: 20px; left: var(--side-gap);') && c.includes('gap: 2px; padding: 18px 10px; border-radius: 20px; border: none;') && c.includes('background: var(--card); box-shadow: var(--shadow);'));
check('onglet actif sur fond gris (comme l\'admin)', c.includes('body.has-footer .client-footer.on button.on { background: var(--fill); color: var(--ink); font-weight: 600; }') && c.includes('[data-theme="dark"] body.has-footer .client-footer.on button.on { background: #3a3a3c; }'));
check('Deconnexion en rouge tout en bas, sous une fine ligne', c.includes('<button id="nav-logout" onclick="doLogout()">') && c.includes('body.has-footer .client-footer.on #nav-logout { position: relative; margin-top: auto; color: var(--red); }') && c.includes('body.has-footer .client-footer.on #nav-logout::before'));
check('grand ecran : 240 px, nom du salon dans sa pastille', c.includes('body.has-footer { --side-w: 240px; }') && c.includes('.side-salon:not(:empty) { display: block; padding: 9px 12px; border-radius: 10px; background: var(--fill);'));
console.log(`\n${pass} OK, ${fail} ECHEC`);
process.exit(fail ? 1 : 0);
