// Agendas (admin > Rendez-vous, Mon poste, caisse) : un jour deja passe se consulte mais n'est plus proposable
// a une prise de RDV - pas de bouton « + Ajouter », lignes du planning non cliquables, assistant refuse.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n + (x ? '  [' + x + ']' : '')); };
const read = (f) => fs.readFileSync(path.join(__dirname, '../../public', f), 'utf8');

console.log('\n[A] isPastDay (app.js) : date du salon');
const app = read('app.js');
const a = app.indexOf('var SALON_TIMEZONE'), b = app.indexOf('window.isPastDay = isPastDay;') + 'window.isPastDay = isPastDay;'.length;
const Real = Date, fixed = new Real('2026-10-15T22:30:00Z').getTime();   // 00h30 a Paris le 16
class FakeDate extends Real { constructor(...x) { if (x.length) super(...x); else super(fixed); } static now() { return fixed; } }
const ctx = { Date: FakeDate, Intl, window: {} }; vm.createContext(ctx); vm.runInContext(app.slice(a, b), ctx);
check('le 15 est passe (00h30 a Paris le 16)', ctx.isPastDay('2026-10-15') === true);
check('le 16 (aujourd\'hui) reste ouvert', ctx.isPastDay('2026-10-16') === false);
check('le 17 reste ouvert', ctx.isPastDay('2026-10-17') === false);

console.log('\n[B] Les trois agendas');
const fnBody = (src, name) => { const i = src.indexOf('function ' + name + '('); return src.slice(i, src.indexOf('\nfunction ', i + 10)); };
[['dashboard.html', 'openAdminAddAppointment'], ['poste.html', 'openPosteAddAppointment'], ['caisse.html', 'openCaisseAddAppointment']].forEach(([f, fn]) => {
  const s = read(f);
  check(f + ' : l\'assistant refuse une date passee', /^\s*if \(isPastDay\(dateStr\)\) \{\s*toast\('Date pass/m.test(fnBody(s, fn).split('\n').slice(1, 3).join('\n')));
});
check('admin : lignes du planning non cliquables un jour passe', /var trackClick = \(rdvIsSalonClosed\(dateStr\) \|\| isPastDay\(dateStr\)\)\s*\? ''/.test(read('dashboard.html')));
check('poste : lignes non cliquables et pas de bouton « + Ajouter » un jour passe', /var trackClick = \(rdvIsSalonClosed\(dateStr\) \|\| isPastDay\(dateStr\)\) \? ''/.test(read('poste.html')) && /if \(isPastDay\(dateStr\)\) return '';/.test(fnBody(read('poste.html'), 'posteAddBtnHtml')));
check('caisse : lignes non cliquables et pas de bouton « + Ajouter » un jour passe', /var trackClick = \(bid === 'unassigned' \|\| isPastDay\(dateStr\)\) \? ''/.test(read('caisse.html')) && /if \(activeBarberId && !isPastDay\(dateStr\)\)/.test(read('caisse.html')));

console.log('\n[C] Calendrier : jours passes grises et non cliquables');
[['dashboard.html', 'selectCalendarDay'], ['caisse.html', 'selectCalDay']].forEach(([f, fn]) => {
  const s = read(f);
  check(f + ' : classe « past » (grisee) sur les jours passes, en Mois et en Semaine', (s.match(/if \(isPastDay\(dateStr\)\) classes \+= ' past';/g) || []).length === 2 && /\.cal-day\.past \{ opacity: \.5; \}/.test(s));
  check(f + ' : un jour passe reste cliquable pour consulter ses RDV (seule la prise de RDV est bloquee)', !/isPastDay\(dateStr\) \? '' : ' onclick/.test(s) && (s.match(new RegExp("' onclick=\"" + fn + "\\(\\\\'' \\+ dateStr", 'g')) || []).length === 2);
});
// Mon poste : Mois et Semaine au style de la vue Jour (test 155) - jours passes grises mais toujours ouvrables.
{
  const s = read('poste.html');
  check('poste.html : jours passes grises en Mois (carte) et en Semaine (en-tete et colonne)', /\(ds < todayStr \? ' past' : ''\)/.test(s) && /pd-wk-head' \+ \(d === todayStr \? ' today' : ''\) \+ \(d < todayStr \? ' past' : ''\)/.test(s) && /\.pd-mday\.past \{ opacity: \.55; \}/.test(s));
  check('poste.html : un jour passe reste ouvrable (sa vue Jour), seule la prise de RDV est bloquee', /onclick="pdShowDay\(\\'' \+ ds \+ '\\'\)"/.test(s) && /onclick="pdShowDay\(\\'' \+ d \+ '\\'\)" title="Ouvrir ce jour"/.test(s) && /if \(rdvIsSalonClosed\(dateStr\) \|\| isPastDay\(dateStr\)\) return '';/.test(s));
}

console.log('\n[D] Synchronisation des agendas');
const caisse = read('caisse.html');
check('caisse : fermetures exceptionnelles chargees avec l\'agenda', /function rdvLoadSalonClosures\(\)/.test(caisse) && /loadRdvSlotStep\(\),\s*rdvLoadSalonClosures\(\)/.test(caisse));
check('caisse : jours fermes marques « Fermé » (Mois et Semaine)', (caisse.match(/if \(rdvIsSalonClosed\(dateStr\)\) classes \+= ' salon-closed';/g) || []).length === 2 && /\.cal-day\.salon-closed::after/.test(caisse));
check('caisse : jour ferme = message seul, assistant refuse', /function renderAgendaTimeline\(dateStr\) \{\n[^\n]*\n  if \(rdvIsSalonClosed\(dateStr\)\) return '<div class="salon-closure-banner"/.test(caisse) && /function openCaisseAddAppointment\(dateStr, barberId\) \{[\s\S]{0,200}if \(rdvIsSalonClosed\(dateStr\)\)/.test(caisse));
const poste = read('poste.html'), dash = read('dashboard.html');
check('Mon poste : agenda relu a chaque ouverture et actualise tout seul (15 s sans toucher)', /calBooted = true; calMonthCache = \{\}; loadAgendaPeriod\(\);/.test(poste) && /autorefresh\.js/.test(poste) && /AutoRefresh\.start\(function \(\) \{\n  var ag = document\.getElementById\('p-agenda'\)/.test(poste));
check('admin > Rendez-vous : calendrier actualise tout seul (15 s sans toucher)', /autorefresh\.js/.test(dash) && /var tab = document\.getElementById\('t-rdv'\);[\s\S]{0,120}calMonthCache = \{\}; return loadCalendarPeriod\(\);/.test(dash));

console.log('\nRESULTAT : ' + pass + ' verifications reussies, ' + fail + ' echec(s)');
process.exit(fail ? 1 : 0);
