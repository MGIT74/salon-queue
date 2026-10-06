// Toute photo qu'on peut AJOUTER dans l'administration doit pouvoir etre RETIREE
// ensuite. Signale : certaines (logo du salon, photo d'un coiffeur) restaient
// definitivement. [A] garde-fou general : chaque champ d'envoi de photo doit avoir
// sa fonction de retrait ET un bouton qui l'appelle - une future photo ajoutee
// sans retrait fera echouer ce test. [B] comportement reel des fonctions.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const dash = fs.readFileSync(path.join(__dirname, '../../public/dashboard.html'), 'utf8');
const sup = fs.readFileSync(path.join(__dirname, '../../public/super-admin.html'), 'utf8');
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n + (x ? '  [' + x + ']' : '')); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function fnSrc(src, name) {
  const i = src.indexOf('function ' + name + '(');
  if (i === -1) throw new Error('fonction introuvable : ' + name);
  const j = src.indexOf('\nfunction ', i + 10);
  return src.slice(i, j === -1 ? undefined : j);
}

(async () => {
console.log('\n[A] Garde-fou : chaque photo ajoutable a son retrait (dashboard + super-admin)');
for (const [label, src] of [['dashboard', dash], ['super-admin', sup]]) {
  const handlers = [...src.matchAll(/type="file"[^>]*onchange="[^"]*?(upload[A-Za-z]+)\(/g)].map(m => m[1]);
  const unique = [...new Set(handlers)];
  check(label + ' : champs d\'envoi de photo trouves', unique.length > 0, unique.join(', '));
  for (const up of unique) {
    const rm = up.replace(/^upload/, 'remove');
    const defined = new RegExp('function ' + rm + '\\(').test(src);
    const wired = new RegExp('onclick="[^"]*' + rm + '\\(').test(src) || new RegExp('onclick=\\\\?"[^"]*' + rm + '\\(').test(src) || new RegExp(rm + '\\(\\\\\'').test(src);
    check(up + '  ->  ' + rm + ' defini ET appele par un bouton', defined && wired, 'defini=' + defined + ' bouton=' + wired);
  }
}

console.log('\n[B] LOGO du salon : retrait (vraies fonctions)');
{
  const dom = new JSDOM('<div id="app"></div>', { runScripts: 'outside-only', url: 'http://localhost/' });
  const w = dom.window;
  const calls = []; let loaded = 0; const toasts = [];
  w.SALON_SLUG = 'oyonnax'; w.currentSalonName = 'TBO OYONNAX';
  w.api = (p, o) => { calls.push({ p, body: o && o.body }); return Promise.resolve({ ok: true }); };
  w.loadCurrentSalonName = () => { loaded++; };
  w.toast = (m, err) => toasts.push({ m, err: !!err });
  w.eval(fnSrc(dash, 'brandCacheKey') + '\n' + fnSrc(dash, 'removeSalonLogo'));
  w.removeSalonLogo(); await sleep(30);
  check('envoie bien logo_url vide au serveur', calls.length === 1 && calls[0].p === '/api/settings' && calls[0].body.logo_url === '', JSON.stringify(calls));
  check('menu lateral : memorise "pas de logo" + nom (retombe sur le nom sans clignoter)', JSON.stringify(JSON.parse(w.sessionStorage.getItem('salon-brand:oyonnax'))) === JSON.stringify({ name: 'TBO OYONNAX', logo: '' }), w.sessionStorage.getItem('salon-brand:oyonnax'));
  check('recharge les aperçus', loaded === 1);
  check('confirme a l\'ecran', toasts.length === 1 && toasts[0].m === 'Logo retiré' && !toasts[0].err);

  const dom2 = new JSDOM('<div id="app"></div>', { runScripts: 'outside-only', url: 'http://localhost/' });
  const w2 = dom2.window; const t2 = []; let l2 = 0;
  w2.SALON_SLUG = 'oyonnax'; w2.currentSalonName = 'X';
  w2.api = () => Promise.reject(new Error('Erreur interne du serveur'));
  w2.loadCurrentSalonName = () => { l2++; }; w2.toast = (m, err) => t2.push({ m, err: !!err });
  w2.eval(fnSrc(dash, 'brandCacheKey') + '\n' + fnSrc(dash, 'removeSalonLogo'));
  w2.removeSalonLogo(); await sleep(30);
  check('serveur en erreur : message d\'erreur, rien de memorise ni recharge', t2.length === 1 && t2[0].err && l2 === 0 && w2.sessionStorage.getItem('salon-brand:oyonnax') === null, JSON.stringify(t2));
}

console.log('\n[C] LOGO : le bouton "Retirer le logo" n\'apparait que s\'il y a un logo (vraie fonction de chargement)');
{
  const card = dash.slice(dash.indexOf('<div class="card-box">\n      <h3>Logo du salon</h3>'));
  const cardHtml = card.slice(0, card.indexOf('<h4 style="font-size:14.5px;font-weight:600;margin:0 0 4px">Couleur'));
  const brand = dash.match(/<div class="brand-head">[\s\S]*?<\/div>\s*<\/div>/)[0];
  async function run(logo) {
    const dom = new JSDOM('<div class="sidebar-brand">' + brand + '</div>' + cardHtml, { runScripts: 'outside-only', url: 'http://localhost/' });
    const w = dom.window;
    w.SALON_SLUG = 'oyonnax'; w.applyAccentColor = () => {};
    w.fetch = () => Promise.resolve({ json: () => Promise.resolve({ salon_name: 'TBO OYONNAX', logo_url: logo }) });
    w.eval(fnSrc(dash, 'applySidebarBrand') + '\n' + fnSrc(dash, 'brandCacheKey') + '\n' + 'var currentSalonName="",currentSalonLogo="",currentGiftTileImage="",currentLoginImage="",currentLoyaltyCardImage="",currentGiftCardImage="";\n' + fnSrc(dash, 'loadCurrentSalonName'));
    w.loadCurrentSalonName(); await sleep(40);
    return w.document.getElementById('logo-remove-btn');
  }
  let btn = await run('data:image/png;base64,AAAA');
  check('avec un logo : bouton visible', btn && btn.style.display === 'inline-block');
  btn = await run(null);
  check('sans logo : bouton masque (rien a retirer)', btn && btn.style.display === 'none');
  check('le bouton appelle bien removeSalonLogo()', /id="logo-remove-btn" onclick="removeSalonLogo\(\)"/.test(dash));
}

console.log('\n[D] PHOTO d\'un coiffeur : retrait (vraies fonctions)');
{
  async function runRemove(confirmAnswer, apiImpl) {
    const dom = new JSDOM('<div></div>', { runScripts: 'outside-only', url: 'http://localhost/' });
    const w = dom.window; const calls = [], toasts = []; let reloaded = 0, asked = null;
    w.showConfirm = (msg, o) => { asked = { msg, o }; return Promise.resolve(confirmAnswer); };
    w.api = (p, o) => { calls.push({ p, body: o && o.body, method: o && o.method }); return apiImpl ? apiImpl() : Promise.resolve({ ok: true }); };
    w.loadBarbers = () => { reloaded++; return Promise.resolve(); };
    w.toast = (m, err) => toasts.push({ m, err: !!err });
    w.eval(fnSrc(dash, 'removeBarberPhoto'));
    w.removeBarberPhoto('b1'); await sleep(40);
    return { calls, toasts, reloaded, asked };
  }
  let r = await runRemove(true);
  check('demande confirmation', r.asked && /photo de ce coiffeur/.test(r.asked.msg));
  check('envoie photo_url vide pour CE coiffeur', r.calls.length === 1 && r.calls[0].p === '/api/barbers/b1' && r.calls[0].method === 'PUT' && r.calls[0].body.photo_url === '', JSON.stringify(r.calls));
  check('recharge la liste + confirme', r.reloaded === 1 && r.toasts[0].m === 'Photo retirée');
  r = await runRemove(false);
  check('confirmation refusee : RIEN n\'est envoye', r.calls.length === 0 && r.reloaded === 0);
  r = await runRemove(true, () => Promise.reject(new Error('Erreur interne du serveur')));
  check('serveur en erreur : message d\'erreur affiche', r.toasts.length === 1 && r.toasts[0].err);

  console.log('\n[E] PHOTO d\'un coiffeur : le bouton n\'apparait que s\'il y a une photo (vraie fonction d\'affichage)');
  function render(photo) {
    const dom = new JSDOM('<div></div>', { runScripts: 'outside-only', url: 'http://localhost/' });
    const w = dom.window;
    w.barberDetailTab = {}; w.esc = (x) => String(x);
    ['renderScheduleTab', 'renderStatsTab', 'renderCapabilitiesTab', 'renderLeavesTab'].forEach(n => { w[n] = () => ''; });
    w.eval(fnSrc(dash, 'renderBarberDetail'));
    return w.renderBarberDetail({ id: 'b1', name: 'Alice', photo_url: photo, has_pin: true, active: true });
  }
  let html = render('data:image/png;base64,AAAA');
  check('avec photo : "Retirer la photo" present, relie a removeBarberPhoto', /removeBarberPhoto\('b1'\)/.test(html) && /Retirer la photo/.test(html));
  check('...et "Photo" (ajout/changement) toujours present', /uploadBarberPhoto/.test(html) && /<span>Photo<\/span>/.test(html));
  html = render(null);
  check('sans photo : pas de "Retirer la photo" (rien a retirer)', !/removeBarberPhoto/.test(html) && !/Retirer la photo/.test(html));
  check('...mais l\'ajout reste possible', /uploadBarberPhoto/.test(html));
}

console.log('\n[F] Grille des actions d\'un coiffeur : un nombre impair de boutons ne laisse pas le dernier seul dans un coin');
check('regle "dernier bouton pleine largeur si impair" presente (compte les <button>, pas le champ <input> cache)', /\.barber-quick-actions > button:last-of-type:nth-of-type\(odd\) \{ grid-column: 1 \/ -1; \}/.test(dash));

console.log(`\nRESULTAT : ${pass} verifications reussies, ${fail} echec(s)`);
process.exit(fail ? 1 : 0);
})().catch(e => { console.error('ERREUR TEST', e); process.exit(2); });
