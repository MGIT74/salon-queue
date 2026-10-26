// Actualisation discrete en arriere-plan (public/autorefresh.js) : 15 s sans toucher l'ecran, jamais si occupe.
const fs = require('fs');
let pass = 0, fail = 0;
const check = (n, ok, extra) => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n + (ok || extra === undefined ? '' : '  -> ' + JSON.stringify(extra))); };
const src = fs.readFileSync(__dirname + '/../../public/autorefresh.js', 'utf8');
const caisse = fs.readFileSync(__dirname + '/../../public/caisse.html', 'utf8');
const compte = fs.readFileSync(__dirname + '/../../public/compte.html', 'utf8');

check('caisse : autorefresh.js charge + intervalle 15 s + garde "occupe"', /autorefresh\.js/.test(caisse) && /AutoRefresh\.start\(function \(\) \{[\s\S]*idleMs: 15000, busy: caisseIsBusy/.test(caisse));
check('caisse : saute si ticket en cours / tiroir / fenetre / paiement', /if \(ticket && ticket\.length\) return true/.test(caisse) && /appt-drawer-backdrop\.on[\s\S]*tpe-overlay\.on[\s\S]*modal-overlay/.test(caisse));
check('compte client : accueil actualise a 15 s sans toucher', /autorefresh\.js/.test(compte) && /AutoRefresh\.start\(function \(\) \{[\s\S]*client-auth\/me[\s\S]*idleMs: 15000/.test(compte));

let JSDOM = null; try { JSDOM = require('jsdom').JSDOM; } catch (_) { /* absent */ }
(async () => {
  if (JSDOM) {
    const dom = new JSDOM('<body><input id="i"><div id="s" style="overflow:auto"></div></body>', { runScripts: 'outside-only', pretendToBeVisual: true });
    const w = dom.window; w.eval(src);
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    let n = 0, busy = false;
    const stop = w.AutoRefresh.start(() => { n++; return Promise.resolve(); }, { idleMs: 150, tickMs: 20, busy: () => busy });
    await sleep(60); check('pas d\'actualisation avant la fin du delai d\'inactivite', n === 0, n);
    await sleep(200); check('actualisation apres inactivite', n >= 1, n);
    { const n0 = n; await sleep(100); check('pas d\'actualisation en boucle a chaque tour : une seule par delai', n - n0 <= 1, [n0, n]); }
    // chaque interaction repousse le compteur
    const before = n;
    for (let i = 0; i < 8; i++) { w.document.body.dispatchEvent(new w.Event('pointerdown', { bubbles: true })); await sleep(40); }
    check('un toucher repart de zero (rien pendant l\'interaction)', n === before, [before, n]);
    await sleep(250); check('reprend apres un nouveau delai sans toucher', n > before, [before, n]);
    // occupe
    busy = true; const b2 = n; await sleep(300); check('saute le tour quand occupe', n === b2, [b2, n]);
    busy = false;
    // champ de saisie actif
    w.document.getElementById('i').focus(); const b3 = n; await sleep(300); check('saute si un champ de saisie a le focus', n === b3, [b3, n]);
    w.document.getElementById('i').blur();
    stop(); const b4 = n; await sleep(300); check('stop() arrete la boucle', n === b4);
    // pas de chevauchement
    let running = 0, maxRun = 0;
    const stop2 = w.AutoRefresh.start(() => { running++; maxRun = Math.max(maxRun, running); return sleep(120).then(() => { running--; }); }, { idleMs: 10, tickMs: 10 });
    await sleep(400); stop2(); check('jamais deux actualisations en meme temps', maxRun === 1, maxRun);
    // defilement conserve
    const s = w.document.getElementById('s'); Object.defineProperty(s, 'scrollTop', { value: 0, writable: true });
    s.scrollTop = 120; let calls = 0;
    const stop3 = w.AutoRefresh.start(() => { calls++; s.scrollTop = 0; return Promise.resolve(); }, { idleMs: 10, tickMs: 10 });
    await sleep(120); stop3();
    check('position de defilement restauree apres rechargement', calls >= 1 && s.scrollTop === 120, [calls, s.scrollTop]);
  }
  console.log('\nRESULTAT : ' + pass + ' verifications reussies, ' + fail + ' echec(s)');
  process.exit(fail ? 1 : 0);
})();
