// Chronologies (Planning du jour du Dashboard, onglet Rendez-vous, Agenda de la
// caisse) : l'echelle affiche une heure A CHAQUE PAS des creneaux (Rendez-vous >
// Parametres : 5/10/15/20/30 min) - 08:00, 08:05, 08:10... - et la frise
// s'elargit (defilement horizontal) pour qu'aucun libelle ne chevauche l'autre.
// Execute les VRAIES fonctions du dashboard ; la caisse est verifiee en
// statique ici et en conditions reelles (vrai serveur + vrai navigateur) a part.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const dash = fs.readFileSync(path.join(__dirname, '../../public/dashboard.html'), 'utf8');
const caisse = fs.readFileSync(path.join(__dirname, '../../public/caisse.html'), 'utf8');
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n + (x ? '  [' + x + ']' : '')); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
function fnSrc(src, name) { const i = src.indexOf('function ' + name + '('); if (i === -1) throw new Error('introuvable: ' + name); const j = src.indexOf('\nfunction ', i + 10); return src.slice(i, j === -1 ? undefined : j); }
const varsBlock = dash.slice(dash.indexOf('var rdvSlotStepMin = 15;'), dash.indexOf('})();', dash.indexOf('installTimelineAutoScroll')) + 5);

function makeWin() {
  const dom = new JSDOM('<div id="dash-timeline"></div>', { runScripts: 'outside-only', url: 'http://localhost/' });
  const w = dom.window;
  const today = '2026-10-06';
  w.salonScheduleByWeekday = { [new Date(today + 'T00:00:00').getDay()]: { startMin: 480, endMin: 1140 } };
  w.barbers = [{ id: 'b1', name: 'Alice' }];
  w.isBookableForAdmin = () => true; w.rdvBarberColors = {}; w.stableColorForId = () => '#08f';
  w.minutesFromScheduledAt = (a) => Number(a.scheduled_at.slice(11, 13)) * 60 + Number(a.scheduled_at.slice(14, 16));
  w.esc = (x) => String(x); w.nowSalonDatetimeString = () => today + ' 10:30:00';
  w.timelineZoom = 1;
  w.eval(varsBlock + '\n' + fnSrc(dash, 'renderDayTimelineHtml') + '\n' + fnSrc(dash, 'rerenderAllTimelines') + '\n' + fnSrc(dash, 'adjustTimelineZoom'));
  w.__today = today;
  return w;
}
function parse(w, step, zoom) {
  w.rdvSlotStepMin = step; if (zoom != null) w.timelineZoom = zoom;
  const html = w.renderDayTimelineHtml(w.__today, []);
  const doc = new JSDOM('<body>' + html + '</body>').window.document;
  const labels = [...doc.querySelectorAll('.timeline-hours span')].map(s => ({ t: s.textContent, h: s.classList.contains('h') }));
  const inner = doc.querySelector('.timeline-inner');
  return { labels, innerWidth: parseInt(inner.style.minWidth, 10), range: Number(inner.dataset.rangeEnd) - Number(inner.dataset.rangeStart), grid: doc.querySelector('.timeline-minute-grid').getAttribute('style'), pct: doc.querySelector('.timeline-zoom-ctrl span').textContent };
}
const toMin = (s) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3));

(async () => {
  console.log('\n[A] Une heure A CHAQUE PAS (plage 08:00-19:00)');
  for (const step of [5, 10, 15, 20, 30]) {
    const w = makeWin(); const r = parse(w, step, 1);
    const expected = r.range / step + 1;
    check('pas ' + String(step).padStart(2) + ' min : ' + expected + ' libelles, de 08:00 a 19:00', r.labels.length === expected && r.labels[0].t === '08:00' && r.labels[r.labels.length - 1].t === '19:00', r.labels.slice(0, 4).map(l => l.t).join(' ') + ' ...');
    check('pas ' + String(step).padStart(2) + ' min : chaque libelle = le precedent + ' + step + ' min', r.labels.every((l, i) => i === 0 || toMin(l.t) - toMin(r.labels[i - 1].t) === step));
    check('pas ' + String(step).padStart(2) + ' min : les heures pleines (et elles seules) sont mises en avant', r.labels.every(l => l.h === (l.t.endsWith(':00'))));
    const pctStep = (step / r.range * 100), pctHour = (60 / r.range * 100);
    const m = r.grid.match(/background-size:([\d.]+)% 100%, ([\d.]+)% 100%/);
    check('pas ' + String(step).padStart(2) + ' min : traits de fond = un par pas + un plus marque par heure', m && Math.abs(Number(m[1]) - pctStep) < 0.001 && Math.abs(Number(m[2]) - pctHour) < 0.001, r.grid);
  }

  console.log('\n[B] Aucun chevauchement : chaque libelle garde au moins 44 px (zoom normal ET zoom reduit)');
  for (const step of [5, 10, 15, 20, 30]) for (const z of [1, 0.6]) {
    const w = makeWin(); const r = parse(w, step, z);
    const pxPerLabel = r.innerWidth / r.range * step;
    check('pas ' + String(step).padStart(2) + ' min, zoom demande ' + Math.round(z * 100) + '% : ' + pxPerLabel.toFixed(1) + ' px par libelle', pxPerLabel >= 43.5, 'largeur ' + r.innerWidth + 'px, affiche ' + r.pct);
  }

  console.log('\n[C] Largeur : la frise s\'elargit quand le pas est fin (defilement horizontal)');
  const widths = {}; for (const step of [30, 20, 15, 10, 5]) widths[step] = parse(makeWin(), step, 1).innerWidth;
  check('plus le pas est fin, plus la frise est large', widths[30] <= widths[20] && widths[20] < widths[15] && widths[15] < widths[10] && widths[10] < widths[5], JSON.stringify(widths));
  check('pas 30 min : largeur d\'avant (90 px/heure), rien ne change pour ce reglage', widths[30] === 11 * 90, String(widths[30]));

  console.log('\n[D] Zoom : part de la valeur AFFICHEE, jamais de bouton "mort"');
  { const w = makeWin(); w.rdvSlotStepMin = 5; w.dashTimelineCache = { dateStr: w.__today, appts: [] };
    const show = () => { w.document.getElementById('dash-timeline').innerHTML = w.renderDayTimelineHtml(w.__today, []); return w.document.querySelector('.timeline-zoom-ctrl span').textContent; };
    check('pas 5 : zoom de depart 100% (= juste assez large pour tous les libelles)', show() === '100%');
    w.adjustTimelineZoom(-1); w.adjustTimelineZoom(-1); w.adjustTimelineZoom(-1);
    check('"-" au minimum : reste a 100% (on ne peut pas faire se chevaucher les libelles)', w.document.querySelector('.timeline-zoom-ctrl span').textContent === '100%');
    w.adjustTimelineZoom(1);
    check('puis UN seul clic sur "+" : monte tout de suite a 120% (pas de clics a vide)', w.document.querySelector('.timeline-zoom-ctrl span').textContent === '120%', w.document.querySelector('.timeline-zoom-ctrl span').textContent);
    for (let i = 0; i < 12; i++) w.adjustTimelineZoom(1);
    check('zoom maximum 250%', w.document.querySelector('.timeline-zoom-ctrl span').textContent === '250%'); }

  console.log('\n[E] Le pas vient des reglages et l\'echelle suit (vraie fonction de chargement)');
  async function load(stepValue, start) {
    const dom = new JSDOM('<div></div>', { runScripts: 'outside-only', url: 'http://localhost/' });
    const w = dom.window; let rerenders = 0;
    w.SALON_SLUG = 'x'; w.applyAccentColor = () => {}; w.applySidebarBrand = () => {}; w.brandCacheKey = () => 'k'; w.rerenderAllTimelines = () => { rerenders++; };
    w.fetch = () => Promise.resolve({ json: () => Promise.resolve({ salon_name: 'X', rdv_slot_step_min: stepValue }) });
    w.eval('var rdvSlotStepMin = ' + start + ';var currentSalonName="",currentSalonLogo="",currentGiftTileImage="",currentLoginImage="",currentLoyaltyCardImage="",currentGiftCardImage="";\n' + fnSrc(dash, 'loadCurrentSalonName'));
    w.loadCurrentSalonName(); await sleep(40);
    return { step: w.rdvSlotStepMin, rerenders };
  }
  let r = await load(5, 15);
  check('reglage a 5 (etait 15) : le pas passe a 5 ET les frises sont redessinees', r.step === 5 && r.rerenders === 1, JSON.stringify(r));
  r = await load(15, 15);
  check('reglage inchange : pas de redessin inutile', r.step === 15 && r.rerenders === 0, JSON.stringify(r));
  r = await load(undefined, 15);
  check('reglage absent : repli sur 15 (comme le serveur)', r.step === 15);
  { // isolement : si le redessin des frises plante, le logo / les apercus se chargent QUAND MEME
    const dom = new JSDOM('<div></div>', { runScripts: 'outside-only', url: 'http://localhost/' });
    const w = dom.window; let brand = null;
    w.SALON_SLUG = 'x'; w.applyAccentColor = () => {}; w.applySidebarBrand = (n, l) => { brand = { n, l }; }; w.brandCacheKey = () => 'k';
    w.rerenderAllTimelines = () => { throw new Error('plantage du redessin'); };
    w.fetch = () => Promise.resolve({ json: () => Promise.resolve({ salon_name: 'TBO', logo_url: 'data:image/png;base64,AAAA', rdv_slot_step_min: 5 }) });
    w.eval('var rdvSlotStepMin = 15;var currentSalonName="",currentSalonLogo="",currentGiftTileImage="",currentLoginImage="",currentLoyaltyCardImage="",currentGiftCardImage="";\n' + fnSrc(dash, 'loadCurrentSalonName'));
    w.loadCurrentSalonName(); await sleep(40);
    check('un redessin qui PLANTE n\'empeche pas le logo / le nom de se charger (isole)', brand && brand.n === 'TBO' && brand.l === 'data:image/png;base64,AAAA' && w.rdvSlotStepMin === 5, JSON.stringify(brand)); }
  check('enregistrement des parametres RDV : l\'echelle suit le nouveau pas tout de suite', /rdvSlotStepMin = Number\(overlay\.querySelector\('#rs-step'\)\.value\) \|\| 15;\s*rerenderAllTimelines\(\);/.test(dash));

  console.log('\n[F] Caisse (Agenda) : meme logique, relue a chaque chargement de l\'Agenda');
  check('meme boucle "une heure a chaque pas"', /for \(var t = rangeStart; t <= rangeEnd; t \+= stepMin\)/.test(caisse) && /rdvSlotStepMin > 0 \? rdvSlotStepMin : 15/.test(caisse));
  check('meme grille (un trait par pas + un par heure) et meme largeur sans chevauchement', /background-size:' \+ stepPct \+ '% 100%, ' \+ hourPct/.test(caisse) && /fitPerHour = Math\.max\(90, labelsPerHour \* TIMELINE_LABEL_PX\)/.test(caisse));
  check('pas lu dans les reglages PUBLICS, AVANT le rendu (dans le meme Promise.all que les RDV)', /function loadRdvSlotStep\(\)[\s\S]*settings\/public/.test(caisse) && /loadRdvSlotStep\(\)\s*\]\)/.test(caisse));
  check('zoom de la caisse part de la valeur affichee', /timelineMinZoom, Math\.min\(2\.5, \+\(base \+ delta \* 0\.2\)/.test(caisse));
  for (const [n, src] of [['dashboard', dash], ['caisse', caisse]]) {
    check(n + ' : heures pleines en gras + 2 couches de traits (fin par pas, marque par heure)', /\.timeline-hours span\.h \{/.test(src) && /rgba\(128,128,128,\.38\) 1px/.test(src));
    check(n + ' : centrage automatique sur "maintenant" des qu\'une frise apparait, seulement si elle est VRAIMENT plus large que l\'ecran', /installTimelineAutoScroll/.test(src) && /sc\.scrollLeft = Math\.max\(0, now\.offsetLeft - sc\.clientWidth \/ 2\)/.test(src) && /sc\.scrollWidth - sc\.clientWidth < 80\) return/.test(src));
  }

  console.log(`\nRESULTAT : ${pass} verifications reussies, ${fail} echec(s)`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('ERREUR TEST', e); process.exit(2); });
