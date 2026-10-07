// Page de RESERVATION EN LIGNE (rdv.html) : les photos des prestations ne s'affichaient pas - seules les icones par defaut
// (signale en production : le gerant avait ajoute des photos). La page ne lisait JAMAIS image_url pour les prestations (la
// borne, elle, le faisait). Desormais : prestation avec photo = photo en fond de carte + voile (comme la borne) ; supplements
// et produits avec photo = petite photo ronde ; sans photo = icone d'origine. Execute les VRAIES fonctions de la page.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const rdv = fs.readFileSync(path.join(__dirname, '../../public/rdv.html'), 'utf8');
const app = fs.readFileSync(path.join(__dirname, '../../public/app.js'), 'utf8');
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n + (x ? '  [' + x + ']' : '')); };
// Une fonction va de "function nom(" a sa PROPRE accolade fermante (ligne "}") : jamais jusqu'a la fonction suivante, pour ne pas
// embarquer le code qui les separe (ex. "var services = [] ...", qui viderait la liste de prestations du test).
const fnSrc = (src, name) => { const i = src.indexOf('function ' + name + '('); if (i === -1) throw new Error('introuvable: ' + name); const j = src.indexOf('\n}\n', i); return src.slice(i, j + 3); };
const IMG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

function page(services, extras, products) {
  const dom = new JSDOM('<button id="service-next-btn" disabled></button><div id="svc-grid"></div><div id="extras-grid"></div><div id="products-grid"></div>', { runScripts: 'outside-only', url: 'http://localhost/' });
  const w = dom.window;
  w.eval(fnSrc(app, 'esc'));
  w.formatMinutes = (m) => m + ' min'; w.eur = (c) => (c / 100).toFixed(2) + ' €';
  w.services = services; w.extras = extras || []; w.products = products || [];
  w.eval('var selService = null, selExtras = [], selProducts = [];' + fnSrc(rdv, 'iconForItem') + fnSrc(rdv, 'renderServiceGrid') + fnSrc(rdv, 'selectService') + fnSrc(rdv, 'toggleExtra'));
  w.renderServiceGrid();
  return w;
}
const cards = (w) => [...w.document.querySelectorAll('#svc-grid .svc-card')];

(async () => {
  console.log('\n[A] Prestations : photo si elle existe, sinon l\'icone par defaut');
  let w = page([
    { id: 's1', name: 'Barbe premium', duration_min: 20, price_cents: 1300, image_url: IMG },
    { id: 's2', name: 'Coupe homme', duration_min: 25, price_cents: 1500, image_url: null },
    { id: 's3', name: 'Shampoing', duration_min: 5, price_cents: 300, image_url: '' }
  ]);
  let c = cards(w);
  check('3 cartes, dans l\'ordre de la liste', c.map(x => x.dataset.id).join() === 's1,s2,s3');
  check('prestation AVEC photo : carte "has-photo" dont le fond est la photo', c[0].classList.contains('has-photo') && c[0].querySelector('.photo-bg').getAttribute('style').includes(IMG), c[0].className);
  check('...avec son nom et sa duree / son prix lisibles par-dessus (voile)', c[0].querySelector('.overlay .name').textContent === 'Barbe premium' && /20 min · 13\.00 €/.test(c[0].querySelector('.overlay .meta').textContent));
  check('...et plus d\'icone par defaut sur cette carte', !c[0].querySelector('.icon'));
  check('prestation SANS photo (null) : icone par defaut, comme avant', !c[1].classList.contains('has-photo') && !!c[1].querySelector('.icon') && !c[1].querySelector('.photo-bg'));
  check('prestation sans photo (chaine vide) : idem', !c[2].classList.contains('has-photo') && !!c[2].querySelector('.icon'));
  check('toutes les cartes restent cliquables vers selectService', c.every(x => /selectService\(this,'s\d'\)/.test(x.getAttribute('onclick'))));

  console.log('\n[B] La selection fonctionne aussi sur une carte a photo');
  w.selectService(c[0], 's1');
  check('carte a photo : classe "sel" posee (c\'est elle qui porte l\'anneau de selection)', c[0].classList.contains('sel'));
  check('...et le bouton "Continuer" est active', w.document.getElementById('service-next-btn').disabled === false);
  w.selectService(c[1], 's2');
  check('on choisit une autre carte : l\'ancienne est desélectionnée, une seule reste choisie', !c[0].classList.contains('sel') && c[1].classList.contains('sel') && cards(w).filter(x => x.classList.contains('sel')).length === 1);

  console.log('\n[C] Supplements et produits : petite photo ronde si elle existe');
  w = page([{ id: 's1', name: 'Coupe', duration_min: 10, price_cents: 1000 }],
    [{ id: 'e1', name: 'Shampoing', duration_min: 5, price_cents: 300, image_url: IMG }, { id: 'e2', name: 'Soin', duration_min: 5, price_cents: 400 }],
    [{ id: 'p1', name: 'Cire', price_cents: 700, image_url: IMG }, { id: 'p2', name: 'Gel', price_cents: 500, image_url: null }]);
  const ex = [...w.document.querySelectorAll('#extras-grid .xchip')], pr = [...w.document.querySelectorAll('#products-grid .xchip')];
  check('supplement AVEC photo : petite photo ronde devant le nom', !!ex[0].querySelector('.xphoto') && ex[0].querySelector('.xphoto').getAttribute('style').includes(IMG));
  check('supplement SANS photo : chip inchangee (pas de photo)', !ex[1].querySelector('.xphoto') && ex[1].textContent.includes('Soin'));
  check('produit avec photo / sans photo : meme regle', !!pr[0].querySelector('.xphoto') && !pr[1].querySelector('.xphoto'));
  check('les chips restent cliquables (supplement -> toggleExtra, produit -> toggleProduct)', /toggleExtra\(this,'e1'\)/.test(ex[0].getAttribute('onclick')) && /toggleProduct\(this,'p1'\)/.test(pr[0].getAttribute('onclick')));

  console.log('\n[D] Securite : une adresse d\'image piegee ne peut pas injecter de HTML');
  const evil = 'https://x.example/a.png"onerror="alert(1)';
  w = page([{ id: 's1', name: 'Coupe', duration_min: 10, price_cents: 1000, image_url: evil }], [{ id: 'e1', name: 'X', duration_min: 1, price_cents: 1, image_url: evil }], []);
  const bg = w.document.querySelector('#svc-grid .photo-bg'), xp = w.document.querySelector('#extras-grid .xphoto');
  check('prestation : l\'element ne porte QUE l\'attribut style (aucun "onerror" injecte)', [...bg.attributes].map(a => a.name).join() === 'class,style' && !w.document.querySelector('#svc-grid [onerror]'));
  check('supplement : idem', [...xp.attributes].map(a => a.name).join() === 'class,style' && !w.document.querySelector('#extras-grid [onerror]'));
  w = page([{ id: 's1', name: '"><img src=x onerror=alert(1)>', duration_min: 10, price_cents: 1000, image_url: IMG }]);
  check('nom piege : echappe (aucune balise <img> creee)', !w.document.querySelector('#svc-grid img') && w.document.querySelector('#svc-grid .name').textContent === '"><img src=x onerror=alert(1)>');
  check('adresse https avec "&" : conservee correctement', page([{ id: 's1', name: 'A', duration_min: 1, price_cents: 1, image_url: 'https://cdn.example/a.png?x=1&y=2' }]).document.querySelector('.photo-bg').style.backgroundImage.includes('x=1&y=2'));

  console.log('\n[E] Style : meme rendu que la borne, selection visible PAR-DESSUS la photo');
  check('carte a photo : photo en fond plein, voile degrade, texte blanc', /\.svc-card\.has-photo \.photo-bg \{ position: absolute; inset: 0; background-size: cover/.test(rdv) && /linear-gradient\(to top, rgba\(0,0,0,\.78\)/.test(rdv) && /\.svc-card\.has-photo \.name, \.svc-card\.has-photo \.meta \{ color: #fff; \}/.test(rdv));
  check('anneau de selection pose par-dessus la photo (::after, z-index 2) - un anneau interieur serait cache par elle', /\.svc-card\.has-photo\.sel::after \{[^}]*box-shadow: inset 0 0 0 3px var\(--blue\)[^}]*z-index: 2/.test(rdv));
  check('petite photo ronde des chips', /\.xchip \.xphoto \{ width: 22px; height: 22px; border-radius: 50%/.test(rdv));

  console.log('\n[F] Borne : la selection d\'une prestation a photo etait INVISIBLE (mesure : 0 pixel bleu au bord) - meme correction');
  const kiosk = fs.readFileSync(path.join(__dirname, '../../public/kiosk.html'), 'utf8');
  check('borne : anneau de selection pose par-dessus la photo (::after, z-index 2)', /\.svc-card\.has-photo\.sel::after \{[^}]*box-shadow: inset 0 0 0 3px var\(--blue\)[^}]*z-index: 2/.test(kiosk));
  check('borne : plus d\'anneau "inset" pose sur la carte elle-meme (cache par la photo)', !/\.svc-card\.has-photo\.sel \{ box-shadow: inset/.test(kiosk));

  console.log(`\nRESULTAT : ${pass} verifications reussies, ${fail} echec(s)`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('ERREUR TEST', e); process.exit(2); });
