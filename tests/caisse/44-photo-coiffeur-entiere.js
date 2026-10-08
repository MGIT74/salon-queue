// La photo du coiffeur est affichee ENTIERE (jamais coupee) sur la page de RDV, Mon compte et la borne ; le televersement ne la recadre plus.
const fs = require('fs'), path = require('path'), vm = require('vm');
const rd = (f) => fs.readFileSync(path.join(__dirname, '../../' + f), 'utf8');
const app = rd('public/app.js'), css = rd('public/app.css'), rdv = rd('public/rdv.html'), compte = rd('public/compte.html'), kiosk = rd('public/kiosk.html'), dash = rd('public/dashboard.html');
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n + (x ? '  [' + x + ']' : '')); };
const fnSrc = (src, name) => { const i = src.indexOf('function ' + name + '('); if (i === -1) throw new Error('introuvable: ' + name); const j = src.indexOf('\n}\n', i); return src.slice(i, j + 2); };
const ctx = vm.createContext({ esc: (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;') });
vm.runInContext(fnSrc(app, 'barberTileHtml'), ctx);

console.log('\n[A] Tuile coiffeur (vraie fonction)');
const avec = ctx.barberTileHtml({ id: 'b1', name: 'Karim', photo_url: 'data:image/jpeg;base64,AAA' }, false, "selectBarber(this, 'b1')");
const sans = ctx.barberTileHtml({ id: 'b2', name: 'Léo', photo_url: null }, true, "selectBarber(this, 'b2')");
check('avec photo : classe has-photo, photo dans un cadre dedie (pas en fond de la tuile), nom en dessous', /svc-card barber-tile has-photo"/.test(avec) && /<span class="barber-photo" style="background-image:url\(&quot;data:image\/jpeg/.test(avec) && avec.indexOf('barber-photo') < avec.indexOf('class="name"'));
check('sans photo : initiale, tuile selectionnee', /class="icon">L</.test(sans) && /svc-card barber-tile sel"/.test(sans) && !/has-photo/.test(sans));
check('data-barber-id conserve (selection / tests)', /data-barber-id="b1"/.test(avec));
check('le nom est echappe', /&lt;/.test(ctx.barberTileHtml({ id: 'x', name: '<b>', photo_url: '' }, false, '')));

console.log('\n[B] Style et branchement');
check('CSS : photo en "contain" sur fond blanc, cadre carre, plus de recadrage', /\.svc-card\.has-photo \.barber-photo \{[^}]*aspect-ratio: 1 \/ 1[^}]*background-size: contain/.test(css));
check('rdv.html et Mon compte utilisent la tuile partagee (plus de background-size:cover)', /barberTileHtml\(b, selBarber === b\.id/.test(rdv) && /barberTileHtml\(b, selBookBarber === b\.id/.test(compte) && !/background-size:cover;background-position:center' : ''/.test(rdv + compte));
check('borne : photo entiere (contain) dans un cadre, nom et attente sous la photo (la tuile cadeau est epargnee)', /barber-photo" style="background-image/.test(kiosk) && /\.barber-card\.has-photo:not\(\.gift-tile\) \.barber-photo \{[^}]*contain/.test(kiosk));
check('televersement (tableau de bord) : plus de recadrage carre 300x300, image conservee entiere', /function uploadBarberPhoto[\s\S]*?Photo conservee ENTIERE[\s\S]*?toDataURL/.test(dash) && /Photo conservee ENTIERE/.test(dash) && /600 \/ Math\.max\(img\.width, img\.height\)/.test(dash));

console.log('\n' + pass + ' OK, ' + fail + ' ECHEC');
process.exit(fail ? 1 : 0);
