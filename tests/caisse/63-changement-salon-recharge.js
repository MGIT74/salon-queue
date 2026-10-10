// Changer de salon dans le selecteur recharge toute la page (aucune donnee de l'ancien salon ne subsiste).
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '../../public/dashboard.html'), 'utf8');
let pass = 0, fail = 0;
const check = (n, ok) => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n); };
const i = src.indexOf('function switchSalon(newSlug)');
const body = src.slice(i, src.indexOf('function loadCatalog()', i));
check('switchSalon navigue vers l\'URL du nouveau salon (?salon=)', /searchParams\.set\('salon', newSlug\)/.test(body) && /window\.location\.href = url\.toString\(\)/.test(body));
check('plus de remise a zero partielle de l\'etat', !/queue = \[\]/.test(body) && !/loadCatalog\(\)/.test(body));
check('pas de reload concurrent qui annulerait la navigation', !/setTimeout/.test(body));
check('le #hash (onglet courant) est conserve par new URL(window.location.href)', /new URL\(window\.location\.href\)/.test(body));
check('la session survit au rechargement (sessionStorage pw + autoLogin)', /sessionStorage\.setItem\('pw', pw\)/.test(src) && /function autoLogin\(\)/.test(src));
// Execution reelle de la fonction avec une fausse fenetre
const loc = { href: 'https://app.thebarberone.com/dashboard.html?salon=oyonnax#settings' };
const fn = new Function('window', 'SALON_SLUG', 'URL', body + '; return switchSalon;')({ location: loc }, 'oyonnax', URL);
fn('valleiry');
check('navigue vers ?salon=valleiry en gardant #settings', loc.href === 'https://app.thebarberone.com/dashboard.html?salon=valleiry#settings');
loc.href = 'https://x/d.html?salon=oyonnax'; fn('oyonnax');
check('meme salon : rien ne se passe', loc.href === 'https://x/d.html?salon=oyonnax');
console.log('\n' + pass + ' OK, ' + fail + ' ECHEC'); process.exit(fail ? 1 : 0);
