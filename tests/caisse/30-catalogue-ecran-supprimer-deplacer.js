// Dashboard, listes Prestations / Supplements / Produits : bouton SUPPRIMER (avec un message qui
// dit la verite sur l'historique) et DEPLACEMENT (poignee, clavier). Execute les VRAIES fonctions
// du fichier. Le glissement a la souris / au doigt (qui demande une vraie mise en page) est
// verifie a part, dans un vrai navigateur.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '../../public/dashboard.html'), 'utf8');
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n + (x ? '  [' + x + ']' : '')); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
function fnSrc(name) { const i = src.indexOf('function ' + name + '('); if (i === -1) throw new Error('introuvable: ' + name); const j = src.indexOf('\nfunction ', i + 10); return src.slice(i, j === -1 ? undefined : j); }
const gripLine = src.slice(src.indexOf('var GRIP_ICON'), src.indexOf('\n', src.indexOf('var GRIP_ICON')));

function makeWin(html) {
  const dom = new JSDOM(html || '<div></div>', { runScripts: 'outside-only', url: 'http://localhost/' });
  const w = dom.window; w.__calls = []; w.__toasts = []; w.__confirms = [];
  w.esc = (x) => String(x == null ? '' : x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  w.eur = (c) => (c / 100).toFixed(2) + ' €'; w.formatMinutes = (m) => m + ' min';
  w.toast = (m, err) => w.__toasts.push({ m, err: !!err });
  w.loadCatalog = () => { w.__reloaded = (w.__reloaded || 0) + 1; return Promise.resolve(); };
  w.eval(gripLine);
  return w;
}

(async () => {
  console.log('\n[A] Chaque ligne a sa poignee et son bouton Supprimer (3 listes)');
  {
    const w = makeWin('<div id="services-list"></div><div id="extras-list"></div><div id="products-list"></div>');
    w.services = [{ id: 's1', name: 'Coupe', duration_min: 30, price_cents: 2000, active: 1 }, { id: 's2', name: 'Barbe', duration_min: 15, price_cents: 1200, active: 0 }];
    w.extras = [{ id: 'e1', name: 'Gel', duration_min: 5, price_cents: 300, active: 1 }];
    w.products = [{ id: 'p1', name: 'Cola', price_cents: 250, active: 1, stock_enabled: 0 }];
    w.eval('function initCatalogSort(){}' + fnSrc('renderCatalog'));
    for (const [t, n] of [['services', 2], ['extras', 1], ['products', 1]]) {
      w.renderCatalog(t);
      const list = w.document.getElementById(t + '-list');
      check(t + ' : ' + n + ' ligne(s), chacune avec data-id, poignee et "Supprimer"', list.querySelectorAll('.item[data-id]').length === n && list.querySelectorAll('.drag-handle').length === n && [...list.querySelectorAll('button')].filter(b => b.textContent === 'Supprimer').length === n);
    }
    const arch = w.document.getElementById('services-list').querySelectorAll('.item')[1];
    check('un article ARCHIVE garde "Reactiver" ET peut etre supprime / deplace', /Réactiver/.test(arch.textContent) && /Supprimer/.test(arch.textContent) && arch.querySelector('.drag-handle'));
    check('"Supprimer" est distinct d\'"Archiver" (2 boutons differents)', /archiveCatalog/.test(w.document.getElementById('services-list').innerHTML) && /deleteCatalog/.test(w.document.getElementById('services-list').innerHTML));
    check('poignee accessible : role=button, au clavier (tabindex), libelle', /role="button" tabindex="0" aria-label="Déplacer/.test(w.document.getElementById('services-list').innerHTML));
    check('CSS : touch-action:none sur la poignee (sinon le doigt fait defiler la page au lieu de deplacer)', /\.drag-handle \{[^}]*touch-action: none/.test(src));
  }

  console.log('\n[B] SUPPRIMER : le message dit la verite, avec les vrais chiffres');
  async function del(usage, confirmAnswer, usageFails) {
    const w = makeWin();
    w.api = (p, o) => { w.__calls.push({ p, m: (o && o.method) || 'GET' }); if (/\/usage$/.test(p)) return usageFails ? Promise.reject(new Error('Erreur interne du serveur')) : Promise.resolve({ ok: true, name: 'Coupe', usage }); return Promise.resolve({ ok: true }); };
    w.showConfirm = (msg, o) => { w.__confirms.push({ msg, o }); return Promise.resolve(confirmAnswer); };
    w.eval(fnSrc('deleteCatalog'));
    w.deleteCatalog('services', 's1'); await sleep(40);
    return w;
  }
  let w = await del({ passages: 0, rendez_vous: 0, a_venir: 0, total: 0 }, true);
  check('jamais utilise : "Supprimer definitivement ... irreversible"', /^Supprimer définitivement « Coupe » \? Cette action est irréversible\.$/.test(w.__confirms[0].msg), w.__confirms[0].msg);
  check('bouton rouge "Supprimer" (style danger)', w.__confirms[0].o.danger === true && w.__confirms[0].o.confirmLabel === 'Supprimer');
  check('confirme -> DELETE ?permanent=1, relit les listes, annonce "Supprime"', w.__calls.some(c => c.m === 'DELETE' && c.p === '/api/catalog/services/s1?permanent=1') && w.__reloaded === 1 && w.__toasts[0].m === 'Supprimé');
  w = await del({ passages: 12, rendez_vous: 3, a_venir: 2, total: 15 }, true);
  const m = w.__confirms[0].msg;
  check('deja utilise : cite "12 passages et 3 rendez-vous"', /12 passages et 3 rendez-vous/.test(m), m);
  check('...promet que l\'historique est CONSERVE', /conservés tels quels dans l'historique/.test(m));
  check('...dit ou il disparait (catalogue, caisse, borne, reservation)', /disparaîtra du catalogue, de la caisse, de la borne et de la réservation/.test(m));
  check('...previent des rendez-vous A VENIR (pluriel)', /2 rendez-vous à venir l'utilisent encore : ils restent valables/.test(m));
  w = await del({ passages: 1, rendez_vous: 0, a_venir: 1, total: 1 }, true);
  check('singulier : "(1 passage) : ce passage est conserve tel quel" et "1 rendez-vous a venir l\'utilise encore : il reste valable"', /\(1 passage\) : ce passage est conservé tel quel/.test(w.__confirms[0].msg) && /1 rendez-vous à venir l'utilise encore : il reste valable/.test(w.__confirms[0].msg), w.__confirms[0].msg);
  w = await del({ passages: 0, rendez_vous: 4, a_venir: 0, total: 4 }, true);
  check('rendez-vous seulement : "(4 rendez-vous) : ces rendez-vous sont conserves" - aucun mot "passage" hors de propos', /\(4 rendez-vous\) : ces rendez-vous sont conservés tels quels/.test(w.__confirms[0].msg) && !/passage/.test(w.__confirms[0].msg), w.__confirms[0].msg);
  w = await del({ passages: 0, rendez_vous: 0, a_venir: 0, total: 0 }, false);
  check('annule -> RIEN n\'est supprime', !w.__calls.some(c => c.m === 'DELETE') && !w.__reloaded);
  w = await del(null, true, true);
  check('serveur en erreur : message d\'erreur, aucune suppression', w.__toasts[0].err && !w.__calls.some(c => c.m === 'DELETE'));

  console.log('\n[C] ORDRE : enregistre dans l\'ordre AFFICHE');
  async function persist(failApi) {
    const w = makeWin('<div id="services-list"><div class="item" data-id="s3"></div><div class="item" data-id="s1"></div><div class="item" data-id="s2"></div></div>');
    w.services = [{ id: 's1' }, { id: 's2' }, { id: 's3' }]; w.extras = []; w.products = [];
    w.api = (p, o) => { w.__calls.push({ p, m: o && o.method, body: o && o.body }); return failApi ? Promise.reject(new Error('Erreur interne du serveur')) : Promise.resolve({ ok: true }); };
    w.eval(fnSrc('persistCatalogOrder'));
    w.persistCatalogOrder('services'); await sleep(40);
    return w;
  }
  w = await persist(false);
  check('POST /reorder avec les identifiants dans l\'ordre de l\'ecran', w.__calls[0].p === '/api/catalog/services/reorder' && w.__calls[0].m === 'POST' && JSON.stringify(w.__calls[0].body.ids) === '["s3","s1","s2"]', JSON.stringify(w.__calls[0].body));
  check('le tableau local suit tout de suite (sans relecture) et reste le MEME tableau', JSON.stringify(w.services.map(x => x.id)) === '["s3","s1","s2"]');
  check('confirme a l\'ecran', w.__toasts[0].m === 'Ordre enregistré' && !w.__toasts[0].err);
  w = await persist(true);
  check('echec serveur : message + on relit l\'ordre REEL (pas un ordre faux a l\'ecran)', w.__toasts[0].err && w.__reloaded === 1);

  console.log('\n[D] DEPLACER au clavier (fleches sur la poignee)');
  {
    const w = makeWin('<div id="services-list">' + ['a', 'b', 'c'].map(i => `<div class="item" data-id="${i}"><span class="drag-handle" tabindex="0"></span></div>`).join('') + '</div>');
    w.services = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]; w.extras = []; w.products = [];
    w.api = (p, o) => { w.__calls.push({ p, body: o && o.body }); return Promise.resolve({ ok: true }); };
    w.eval(fnSrc('persistCatalogOrder') + fnSrc('initCatalogSort'));
    w.initCatalogSort('services');
    const list = w.document.getElementById('services-list');
    const order = () => [...list.querySelectorAll('.item')].map(e => e.dataset.id).join('');
    const key = (id, k) => list.querySelector(`[data-id="${id}"] .drag-handle`).dispatchEvent(new w.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
    key('a', 'ArrowDown'); check('fleche bas sur "a" : a descend d\'un cran', order() === 'bac', order());
    key('a', 'ArrowDown'); check('encore : a est en dernier', order() === 'bca', order());
    key('a', 'ArrowDown'); check('encore (deja en dernier) : rien ne bouge', order() === 'bca');
    key('c', 'ArrowUp'); check('fleche haut sur "c" : c monte', order() === 'cba', order());
    key('c', 'ArrowUp'); check('encore (deja en premier) : rien ne bouge', order() === 'cba');
    check('rien n\'est envoye tant que les fleches se suivent (une seule sauvegarde ensuite)', w.__calls.length === 0);
    await sleep(750);
    check('apres la derniere fleche : UNE seule sauvegarde, dans l\'ordre final', w.__calls.length === 1 && JSON.stringify(w.__calls[0].body.ids) === '["c","b","a"]', JSON.stringify(w.__calls.map(c => c.body)));
    check('la liste n\'est initialisee qu\'une fois meme si la liste est redessinee', (w.initCatalogSort('services'), list.__sortReady === true));
  }

  console.log(`\nRESULTAT : ${pass} verifications reussies, ${fail} echec(s)`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('ERREUR TEST', e); process.exit(2); });
