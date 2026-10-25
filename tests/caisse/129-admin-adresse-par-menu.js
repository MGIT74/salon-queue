// Admin : chaque menu de la barre de gauche a sa propre adresse (/admin/rendez-vous?salon=...) pour partager un lien,
// mettre en favori, ouvrir dans un nouvel onglet, et utiliser le bouton retour du navigateur. Les anciens liens
// (dashboard.html#rdv) restent valides.
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n + (x ? '  [' + String(x).slice(0, 160) + ']' : '')); };
const src = fs.readFileSync(path.join(__dirname, '../../public/dashboard.html'), 'utf8');
const grab = (re) => (src.match(re) || [''])[0];
const ctx = { location: { pathname: '/', search: '?salon=test', hash: '' } }; vm.createContext(ctx);
vm.runInContext(grab(/var VALID_TABS = [^\n]+\n/) + grab(/var TAB_PATHS = [\s\S]*?\};\n/) + grab(/function tabUrl\([^\n]+\n/) + grab(/function tabFromLocation\(\) \{[\s\S]*?\n\}\n/), ctx);
check('chaque menu a une adresse', ctx.VALID_TABS.every((t) => typeof ctx.TAB_PATHS[t] === 'string'));
check('adresses en francais', ctx.tabUrl('rdv') === '/admin/rendez-vous?salon=test' && ctx.tabUrl('settings') === '/admin/reglages?salon=test' && ctx.tabUrl('dashboard') === '/admin?salon=test');
const at = (pathname, hash) => { ctx.location.pathname = pathname; ctx.location.hash = hash || ''; return ctx.tabFromLocation(); };
check('/admin/coiffeurs -> menu Coiffeurs', at('/admin/coiffeurs') === 'barbers' && at('/admin/file-d-attente/') === 'queue');
check('/admin -> Dashboard ; menu inconnu -> Dashboard', at('/admin') === 'dashboard' && at('/admin/inconnu') === 'dashboard');
check('ancien lien dashboard.html#rdv -> Rendez-vous', at('/dashboard.html', '#rdv') === 'rdv');
check('clic sur un menu : nouvelle entree d\'historique (bouton retour)', /history\.pushState\(\{ tab: tabName \}/.test(src) && /addEventListener\('popstate'/.test(src));
check('Cmd/Ctrl + clic ou clic molette : nouvel onglet', /e\.metaKey \|\| e\.ctrlKey/.test(src) && /window\.open\(tabUrl\(b\.dataset\.t\), '_blank'\)/.test(src));
check('titre de l\'onglet = menu + salon', /TAB_TITLES\[currentTab\]/.test(src));
check('liens « Mes salons » (kiosk, caisse...) inchanges', src.includes("var pages = ['kiosk.html', 'display.html', 'poste.html', 'caisse.html', 'rdv.html', 'compte.html'];"));

(async () => {
  try {
    for (const u of ['/admin', '/admin/rendez-vous', '/admin/reglages?salon=test', '/dashboard.html']) {
      const r = await fetch('http://127.0.0.1:3999' + u);
      const t = await r.text();
      check('serveur ' + u + ' -> page admin', r.status === 200 && t.includes('id="tabs"'), r.status);
    }
    const bad = await fetch('http://127.0.0.1:3999/admin/a/b');
    check('serveur /admin/a/b -> 404', bad.status === 404, bad.status);
  } catch (e) { check('serveur joignable', false, e.message); }
  console.log(`\n${pass} OK, ${fail} ECHEC`);
  process.exit(fail ? 1 : 0);
})();
