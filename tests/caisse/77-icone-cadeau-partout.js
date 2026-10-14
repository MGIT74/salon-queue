// L'image de la tuile « Utiliser un cadeau » (Reglages > Marketing) s'affiche partout : borne, reservation, compte client.
const fs = require('fs'), path = require('path');
const rd = (p) => fs.readFileSync(path.join(__dirname, '../..', p), 'utf8');
let pass = 0, fail = 0;
const check = (n, ok) => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n); };
const app = rd('public/app.js'), rdv = rd('public/rdv.html'), compte = rd('public/compte.html'), css = rd('public/app.css');
check('app.js : giftTileHtml(image, onclick) partage', /function giftTileHtml\(imageUrl, onclick\)/.test(app) && /imageUrl \? ' has-photo'/.test(app) && /<span class="icon">🎁<\/span>/.test(app));
check('reservation (rdv.html) : tuile avec l\'image du salon', /giftTileHtml\(giftTileImageUrl, 'openGiftCodeScreen\(\)'\)/.test(rdv) && /giftTileImageUrl = r\[4\]\.gift_tile_image_url/.test(rdv));
check('compte client : tuile avec l\'image du salon', /giftTileHtml\(bookGiftTileImage, 'openBookGiftCodeScreen\(\)'\)/.test(compte) && /bookGiftTileImage = \(r\[4\] && r\[4\]\.gift_tile_image_url\)/.test(compte));
check('CSS : image du cadeau en cover', /\.svc-card\.gift-tile\.has-photo \.barber-photo \{[^}]*cover/.test(css));
check('cache navigateur : app.js / app.css versions relevees', /app\.js\?v=\d+/.test(rdv) && /app\.css\?v=\d+/.test(rdv) && /app\.js\?v=\d+/.test(compte));
console.log('\n' + pass + ' OK, ' + fail + ' ECHEC'); process.exit(fail ? 1 : 0);
