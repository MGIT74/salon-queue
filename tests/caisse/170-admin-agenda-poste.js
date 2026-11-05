// Admin > Rendez-vous : même agenda que « Mon poste » et la caisse (vues Jour / Semaine / Mois, « Aujourd'hui »,
// légende, décaler de 5 min, RDV forcés...). Le bouton « Paramètres » en haut et la liste « À venir » restent.
const fs = require('fs'), path = require('path');
const dash = fs.readFileSync(path.join(__dirname, '../../public/dashboard.html'), 'utf8');
const poste = fs.readFileSync(path.join(__dirname, '../../public/poste.html'), 'utf8');
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n + (x ? '  [' + x + ']' : '')); };
const fnSrc = (src, name) => { const i = src.indexOf('function ' + name + '('); if (i === -1) return null; const j = src.indexOf('\nfunction ', i + 10); return src.slice(i, j > -1 ? j : undefined); };
// Adaptation admin : pas de « moi » (pdMe() = null), coiffeurs / catalogue actifs, appels avec le mot de passe admin.
const norm = (t) => t && t.replace(/\(!pdMe\(\) \|\| (pdIsPhone\(\)|phone) \?/g, '($1 ?')
  .replace("(!pdMe() || pdOnlyMe || calBarberFilter ? ''", "(pdOnlyMe || calBarberFilter ? ''")
  .replace("' RDV' + (!pdMe() ? '' : ' · ' + (mineN ? mineN + ' pour moi' : 'aucun pour moi'))", "' RDV · ' + (mineN ? mineN + ' pour moi' : 'aucun pour moi')")
  .replace(/pdMe\(\)/g, 'me').replace(/pdBarbers\(\)/g, 'barbers').replace(/pdActive\((services|extras)\)/g, '$1')
  .replace(/\bapi\(/g, 'barberApi(').replace(/'admin_(day|glance)_/g, "'poste_$1_");
const SAME = ['posteDayHtml', 'pdWeekHtml', 'pdMonthHtml', 'renderCalDay', 'renderCalWeek', 'renderCalMonth', 'setCalView', 'calGoToday', 'calShiftPeriod',
  'loadAgendaPeriod', 'pdNudge', 'pdMovedDialog', 'adRestoreClientTime', 'pdForcedHatchHtml', 'renderCalendarLegend', 'renderCalBarberPicker', 'pdColAdd', 'pdGlanceAdd', 'pdShowDay', 'pdRunSearch'];
const diff = SAME.filter((n) => !fnSrc(dash, n) || norm(fnSrc(dash, n)) !== norm(fnSrc(poste, n)));
check('mêmes fonctions que l\'agenda du poste (Jour, Semaine, Mois, légende, décaler, forcés, recherche...)', diff.length === 0, diff.join(', '));
const old = ['renderMonthView', 'renderWeekView', 'renderDayView', 'renderExpandPanel', 'appointmentsForRange', 'selectCalendarDay'].filter((n) => dash.includes('function ' + n + '('));
check('ancien calendrier de l\'admin retiré', old.length === 0, old.join(', '));
check('même écran : ‹ date [Aujourd\'hui] [Jour | Semaine | Mois] ›, légende, panneau latéral', dash.includes('id="cal-today-btn" onclick="calGoToday()"') && /<button id="cal-view-day" class="on"[^\n]*Jour<\/button>\s*<button id="cal-view-week"[^\n]*Semaine<\/button>\s*<button id="cal-view-month"[^\n]*Mois<\/button>/.test(dash) && dash.includes('<div class="cal-legend" id="cal-legend"></div>') && dash.includes('id="cal-side"'));
check('mêmes styles (copiés du poste)', dash.includes('AGENDA : copie conforme des styles de « Mon poste »') && /\.pd-block \{ position: absolute;/.test(dash) && /\.cal-today \{/.test(dash));
check('bouton « Paramètres » toujours en haut, photos des coiffeurs et liste « À venir » gardées', /<h2>Rendez-vous<\/h2>\s*<button class="btn btn-soft" title="Paramètres des RDV" onclick="openRdvSettings\(\)"/.test(dash) && dash.includes('id="cal-barber-picker"') && dash.includes('id="rdv-list-title"'));
check('admin : pas de « moi » (pas de « Moi seulement » ni « pour moi »)', dash.includes('function pdMe() { return null; }') && (dash.match(/\(!pdMe\(\) \|\| (pdIsPhone\(\)|phone) \? '' : '<(span|div) class="pd-seg2"/g) || []).length === 3);
check('coiffeurs actifs seulement (la liste admin contient aussi les désactivés)', /function pdBarbers\(\) \{ return \(barbers \|\| \[\]\)\.filter\(function \(b\) \{ return b\.active !== 0/.test(dash));
check('clic sur un RDV : tiroir client de l\'admin ; « Ajouter » : assistant admin avec l\'heure touchée (Forcer le RDV à HH:MM)',
  /function openPosteClientDrawer\(id\) \{[\s\S]{0,120}openClientDrawerForAppointment\(id\);/.test(dash) &&
  dash.includes('function openPosteAddAppointment(dateStr, barberId) { openAdminAddAppointment(dateStr, barberId, pdPrefTime); }') &&
  dash.includes('function openAdminAddAppointment(dateStr, preselectedBarberId, prefTime) {') && dash.includes("defaultTime: function () { return prefTime || ''; },"));
check('tiroir : « Remettre à l\'heure du client » (RDV décalé de 5 min)', dash.includes('id="ad-restore-time"') && /adAppt = source === 'appointment' \? c : null;/.test(dash));
check('ouverture de l\'onglet : relu à chaque fois, vue Jour d\'abord', /function loadRdvTab\(\) \{[\s\S]{0,1200}if \(!calViewReady\) \{ calViewReady = true; setCalView\(calViewMode\); \}/.test(dash));
check('liste « À venir » relue avec l\'agenda ; un jour choisi (Mois / Semaine) la filtre', /function loadCalendarPeriod\(\) \{[\s\S]{0,160}loadAgendaPeriod\(\)\.then\(function \(\) \{ renderRdvList\(\); \}\)/.test(dash) && /selectCalDay = function \(dateStr\) \{/.test(dash));
check('planning du jour du Dashboard (accueil) gardé', /function renderDayTimelineHtml\(dateStr, dayAppts\)/.test(dash) && /function rerenderAllTimelines\(\) \{[\s\S]{0,700}renderCalDay\(\)/.test(dash) && !/renderDayView\(\)/.test(dash));
check('ouverture directe sur Rendez-vous : redessiné quand les coiffeurs arrivent', /barbers = r\.items; onDuty = r\.on_duty;\s*\/\/[^\n]*\n\s*if \(calBooted\) rerenderAllTimelines\(\);/.test(dash));
console.log('\n' + pass + ' OK, ' + fail + ' ECHEC');
process.exit(fail ? 1 : 0);
