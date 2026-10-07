// 1) Connexion du TABLEAU DE BORD : le logo du salon s'affiche dans l'icone du formulaire (comme sur "Mon compte" des
//    clients) - seulement sur l'adresse d'un salon PRECIS (meme regle que l'image de gauche), jamais l'icone par defaut puis
//    le logo (aucun eclair). 2) Super-admin : bouton "Identifiant" prerempli avec le nom du salon.
// Execute les VRAIES fonctions des pages.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const dash = fs.readFileSync(path.join(__dirname, '../../public/dashboard.html'), 'utf8');
const sup = fs.readFileSync(path.join(__dirname, '../../public/super-admin.html'), 'utf8');
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n + (x ? '  [' + x + ']' : '')); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const fnSrc = (src, name) => { const i = src.indexOf('function ' + name + '('); if (i === -1) throw new Error('introuvable: ' + name); const j = src.indexOf('\nfunction ', i + 10); return src.slice(i, j === -1 ? undefined : j); };
const LOGO = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const CHAISE = '<svg id="chaise" viewBox="0 0 24 24"><path d="M5 10h14"/></svg>';

(async () => {
  console.log('\n[A] Icone du formulaire de connexion (vraie fonction setLoginIconLogo)');
  const mkIcon = () => { const dom = new JSDOM('<div id="auth-glow-icon">' + CHAISE + '</div>', { runScripts: 'outside-only', url: 'http://localhost/' }); const w = dom.window; w.__orig = w.document.getElementById('auth-glow-icon').innerHTML; w.eval(fnSrc(dash, 'setLoginIconLogo')); return w; };   // __orig : le contenu d'origine tel que la page le serialise
  let w = mkIcon(); const icon = () => w.document.getElementById('auth-glow-icon');
  w.setLoginIconLogo(icon(), LOGO);
  check('avec un logo : il remplace l\'icone d\'origine (image de fond, plus de chaise)', /url\(/.test(icon().style.background) && icon().innerHTML === '' && icon().style.background.includes('center'), icon().style.background.slice(0, 60));
  w.setLoginIconLogo(icon(), '');
  check('logo retire : l\'icone d\'origine est RETABLIE a l\'identique', icon().innerHTML === w.__orig && icon().innerHTML.includes('<svg') && icon().style.background === '');
  w.setLoginIconLogo(icon(), LOGO); w.setLoginIconLogo(icon(), LOGO); w.setLoginIconLogo(icon(), '');
  check('plusieurs bascules de suite : toujours l\'icone d\'origine intacte', icon().innerHTML === w.__orig && icon().innerHTML.includes('<svg'));
  w = mkIcon(); w.setLoginIconLogo(icon(), '');
  check('sans logo des le depart : l\'icone d\'origine n\'est pas touchee', icon().innerHTML === w.__orig && icon().innerHTML.includes('<svg') && icon().style.background === '');
  check('page sans icone (autre ecran) : aucune erreur', (() => { try { w.setLoginIconLogo(null, LOGO); return true; } catch (e) { return false; } })());

  console.log('\n[B] Regle "salon precis" + anti-eclair (vraie fonction de chargement)');
  async function load(slug, settings, failFetch) {
    const dom = new JSDOM('<html class="login-icon-pending"><body><div id="auth-glow-icon">' + CHAISE + '</div></body></html>', { runScripts: 'outside-only', url: 'http://localhost/' });
    const x = dom.window; const orig = x.document.getElementById('auth-glow-icon').innerHTML;
    x.SALON_SLUG = slug; x.applyAccentColor = () => {}; x.applySidebarBrand = () => {}; x.brandCacheKey = () => 'k'; x.rerenderAllTimelines = () => {};
    x.fetch = () => failFetch ? Promise.reject(new Error('reseau')) : Promise.resolve({ json: () => Promise.resolve(settings) });
    x.eval(fnSrc(dash, 'setLoginIconLogo') + '\nvar rdvSlotStepMin = 15;var currentSalonName="",currentSalonLogo="",currentGiftTileImage="",currentLoginImage="",currentLoyaltyCardImage="",currentGiftCardImage="";\n' + fnSrc(dash, 'loadCurrentSalonName'));
    x.loadCurrentSalonName(); await sleep(50);
    const ic = x.document.getElementById('auth-glow-icon');
    return { logo: /url\(/.test(ic.style.background), chaise: ic.innerHTML === orig && ic.innerHTML.includes('<svg'), pending: x.document.documentElement.classList.contains('login-icon-pending') };
  }
  let r = await load('le-salon', { salon_name: 'THE BARBER ONE - OYONNAX', logo_url: LOGO });
  check('adresse d\'un salon AVEC logo : le logo apparait dans l\'icone', r.logo && !r.chaise, JSON.stringify(r));
  check('...et l\'icone n\'est plus masquee (fin de l\'attente)', r.pending === false);
  r = await load('le-salon', { salon_name: 'X', logo_url: null });
  check('adresse d\'un salon SANS logo : l\'icone d\'origine, et elle apparait', r.chaise && !r.logo && r.pending === false, JSON.stringify(r));
  r = await load('', { salon_name: 'X', logo_url: LOGO });
  check('connexion GENERIQUE (sans ?salon=) : icone d\'origine meme si le salon par defaut a un logo (comme l\'image de gauche)', r.chaise && !r.logo, JSON.stringify(r));
  r = await load('le-salon', null, true);
  check('serveur injoignable : l\'icone reapparait quand meme (jamais masquee)', r.pending === false && r.chaise, JSON.stringify(r));
  check('entete : sur ?salon=..., l\'icone est masquee des le chargement ; filet de securite de 2,5 s', /classList\.add\('login-icon-pending'\)/.test(dash) && /setTimeout\(function \(\) \{ document\.documentElement\.classList\.remove\('login-icon-pending'\); \}, 2500\)/.test(dash) && /html\.login-icon-pending \.auth-glow-icon \{ opacity: 0; \}/.test(dash));
  check('l\'icone est adressable (id="auth-glow-icon")', /<div class="auth-glow-icon" id="auth-glow-icon">/.test(dash));

  console.log('\n[C] Super-admin : identifiant propose d\'apres le nom du salon');
  const dom = new JSDOM('<div></div>', { runScripts: 'outside-only', url: 'http://localhost/' }); const sw = dom.window;
  sw.eval(fnSrc(sup, 'slugFromName'));
  const cases = [['THE BARBER ONE - OYONNAX', 'the-barber-one-oyonnax'], ['Salon Rive Gauche', 'salon-rive-gauche'], ['Café Élégant & Fils', 'cafe-elegant-fils'], ['  --Test__Salon!!  ', 'test-salon'], ['', ''], ['é', 'e']];
  for (const [input, want] of cases) check('"' + input + '" -> "' + sw.slugFromName(input) + '"', sw.slugFromName(input) === want);
  check('toujours conforme a la regle du serveur (minuscules, chiffres, tirets)', /^[a-z0-9-]*$/.test(sw.slugFromName('Äpfel Ünd Öl 2000 !!! ✂ Salon')));
  check('longueur plafonnee a 80', sw.slugFromName('a'.repeat(200)).length === 80);

  console.log('\n[D] Super-admin : le bouton "Identifiant" (vraie fonction)');
  async function change(promptValue, apiImpl) {
    const d = new JSDOM('<div></div>', { runScripts: 'outside-only', url: 'http://localhost/' }); const x = d.window; x.__calls = []; x.__toasts = []; x.__prompt = null; x.__reloaded = 0;
    x.owners = [{ id: 'o1', salons: [{ id: 's1', name: 'THE BARBER ONE - OYONNAX', slug: 'le-salon' }] }];
    x.showPrompt = (msg, o) => { x.__prompt = { msg, o }; return Promise.resolve(promptValue); };
    x.superApi = (p, o) => { x.__calls.push({ p, body: o && o.body }); return apiImpl ? apiImpl() : Promise.resolve({ ok: true, slug: o.body.slug }); };
    x.loadOwners = () => { x.__reloaded++; return Promise.resolve(); }; x.toast = (m, e) => x.__toasts.push({ m, e: !!e });
    x.eval(fnSrc(sup, 'slugFromName') + fnSrc(sup, 'changeSalonSlug')); x.changeSalonSlug('s1'); await sleep(40); return x;
  }
  let x = await change('the-barber-one-oyonnax');
  check('la fenetre propose "the-barber-one-oyonnax" (d\'apres le nom) et rappelle que l\'ancien lien continue de marcher', x.__prompt.o.defaultValue === 'the-barber-one-oyonnax' && /ancien lien continuera de fonctionner/.test(x.__prompt.msg) && /\?salon=le-salon/.test(x.__prompt.msg), x.__prompt.o.defaultValue);
  check('valider : PUT /api/super/salons/s1/slug avec le nouvel identifiant', x.__calls.length === 1 && x.__calls[0].p === '/api/super/salons/s1/slug' && x.__calls[0].body.slug === 'the-barber-one-oyonnax');
  check('...confirme "l\'ancien reste valable" et recharge la liste', /reste valable/.test(x.__toasts[0].m) && x.__reloaded === 1);
  x = await change('  THE-Barber-ONE  ');
  check('espaces et majuscules saisis : normalises avant envoi (the-barber-one)', x.__calls[0] && x.__calls[0].body.slug === 'the-barber-one');
  x = await change('le-salon'); check('meme identifiant que l\'actuel : rien n\'est envoye', x.__calls.length === 0);
  x = await change(''); check('champ vide / annulation : rien n\'est envoye', x.__calls.length === 0);
  x = await change(null); check('annuler la fenetre : rien n\'est envoye', x.__calls.length === 0);
  x = await change('autre', () => Promise.reject(new Error('Cet identifiant est déjà utilisé')));
  check('refus du serveur (deja utilise) : message d\'erreur affiche, liste non rechargee', x.__toasts[0].e && /déjà utilisé/.test(x.__toasts[0].m) && x.__reloaded === 0);
  check('le bouton "Identifiant" figure sur chaque salon, ainsi que les anciens liens', /changeSalonSlug\(\\'' \+ s\.id \+ '\\'\)">Identifiant<\/button>/.test(sup) && /ancien lien toujours valable/.test(sup));

  console.log(`\nRESULTAT : ${pass} verifications reussies, ${fail} echec(s)`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('ERREUR TEST', e); process.exit(2); });
