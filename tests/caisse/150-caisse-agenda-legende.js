// Caisse > Agenda : copie conforme de l'agenda de « Mon poste » (vues Jour / Semaine / Mois, légende des coiffeurs,
// « Aujourd'hui », décaler de 5 min, RDV forcés...) + les clients sans RDV déjà démarrés (spécifique caisse).
const fs = require('fs'), path = require('path');
const caisse = fs.readFileSync(path.join(__dirname, '../../public/caisse.html'), 'utf8');
const poste = fs.readFileSync(path.join(__dirname, '../../public/poste.html'), 'utf8');
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n + (x ? '  [' + x + ']' : '')); };
const fnSrc = (src, name) => { const i = src.indexOf('function ' + name + '('); if (i === -1) return null; const j = src.indexOf('\nfunction ', i + 10); return src.slice(i, j > -1 ? j : undefined); };
// Les fonctions de l'agenda du poste se retrouvent à l'identique dans la caisse (à l'adaptation près : « moi » = la bulle active,
// la liste des coiffeurs = allBarbers, le catalogue = catalog.*).
const norm = (t) => t && t.replace(/pdMe\(\)/g, 'me').replace(/\ballBarbers\b/g, 'barbers').replace(/catalog\.(services|extras)/g, '$1').replace(/'caisse_(day|glance)_/g, "'poste_$1_");
const SAME = ['posteDayHtml', 'pdWeekHtml', 'pdMonthHtml', 'renderCalDay', 'renderCalWeek', 'renderCalMonth', 'setCalView', 'calGoToday', 'pdNudge', 'pdMovedDialog', 'pdForcedHatchHtml', 'renderCalendarLegend', 'pdColAdd', 'pdShowDay'];
const diff = SAME.filter((n) => norm(fnSrc(caisse, n)) !== norm(fnSrc(poste, n)));
check('mêmes fonctions que l\'agenda du poste (Jour, Semaine, Mois, légende, décaler, forcés...)', diff.length === 0, diff.join(', '));
check('même écran : ‹ date [Aujourd\'hui] [Jour | Semaine | Mois] ›, légende, panneau latéral', caisse.includes('id="cal-today-btn" onclick="calGoToday()"') && /<button id="cal-view-day" class="on"[^\n]*Jour<\/button>/.test(caisse) && caisse.includes('<div class="cal-legend" id="cal-legend"></div>') && caisse.includes('id="cal-side"'));
check('mêmes styles (copiés du poste)', caisse.includes('AGENDA : copie conforme des styles de « Mon poste »') && /\.pd-block \{ position: absolute;/.test(caisse) && /\.cal-legend \{/.test(caisse));
check('« moi » = le coiffeur de la bulle active', /function pdMe\(\) \{[\s\S]{0,120}activeBarberId/.test(caisse));
check('tiroir et « Ajouter un RDV » de la caisse (heure touchée gardée pour « Forcer »)', caisse.includes("function openPosteAddAppointment(dateStr, barberId) { openCaisseAddAppointment(dateStr, barberId, pdPrefTime); }") && caisse.includes('openAgendaClientDrawer(id);'));
check('clients sans RDV déjà démarrés : toujours dans la vue Jour (fiche « consultation »)', /function pdWalkInsOfDay\(dateStr\)/.test(caisse) && caisse.includes("openAgendaWalkInDrawer(String(id).slice(2))"));
check('ouverture de l\'onglet : relu à chaque fois, vue Jour d\'abord', caisse.includes('if (!calViewReady) { calViewReady = true; setCalView(calViewMode); }'));
check('pas de 2e rangée de photos des coiffeurs (les bulles de la caisse suffisent)', !caisse.includes('id="cal-barber-picker"'));
console.log('\n' + pass + ' OK, ' + fail + ' ECHEC');
process.exit(fail ? 1 : 0);
