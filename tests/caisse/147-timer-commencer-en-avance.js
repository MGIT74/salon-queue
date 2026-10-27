// Reglages > Timer : « Commencer » un client avec RDV X min avant son heure (salon : 10 min par defaut, activable ;
// par coiffeur : comme le salon, personnalise, ou pas d'avance). Poste et Caisse.
const fs = require('fs'), path = require('path'), vm = require('vm');
const BASE = 'http://127.0.0.1:3999';
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n + (x ? '  [' + JSON.stringify(x).slice(0, 200) + ']' : '')); };
const rd = (p) => fs.readFileSync(path.join(__dirname, '../..', p), 'utf8');
const app = rd('public/app.js'), d = rd('public/dashboard.html'), po = rd('public/poste.html'), ca = rd('public/caisse.html');
const ctx = {}; vm.createContext(ctx);
vm.runInContext(['timerEarlyMinFor', 'timerStartAllowedAt'].map((f) => app.match(new RegExp('function ' + f + '\\([\\s\\S]*?\\n\\}\\n'))[0]).join('\n'), ctx);
const cfg = { timer_early_enabled: true, timer_early_min: 10, timer_early_barbers: { b1: { mode: 'custom', min: 30 }, b2: { mode: 'off' } } };
check('salon : 10 min ; coiffeur personnalise : ses minutes ; « pas d\'avance » : 0', ctx.timerEarlyMinFor(cfg, 'b3') === 10 && ctx.timerEarlyMinFor(cfg, 'b1') === 30 && ctx.timerEarlyMinFor(cfg, 'b2') === 0);
check('salon desactive : 0, sauf coiffeur personnalise', ctx.timerEarlyMinFor(Object.assign({}, cfg, { timer_early_enabled: false }), 'b3') === 0 && ctx.timerEarlyMinFor(Object.assign({}, cfg, { timer_early_enabled: false }), 'b1') === 30);
check('heure de deblocage = heure du RDV - minutes', ctx.timerStartAllowedAt({ checkin_at: '2026-10-27T10:00:00Z' }, cfg, 'b3') === Date.parse('2026-10-27T09:50:00Z'));
[['poste', po], ['caisse', ca]].forEach(([n, s]) => {
  check(n + ' : « Commencer » debloque selon le reglage', s.includes('var tooEarly = isAppointmentNotYet && Date.now() < startAt;') && s.includes('(tooEarly && !noTimerBarber)') && s.includes("' · Commencer dès '"));
  check(n + ' : reglages lus dans les reglages publics', s.includes('timerCfg = { timer_early_enabled: d.timer_early_enabled, timer_early_min: d.timer_early_min, timer_early_barbers: d.timer_early_barbers || {} };'));
});
check('reglages : section Timer (salon + liste des coiffeurs automatique + enregistrer + tout le monde)', d.includes("toggleSettingsAccordion('timer')") && d.includes('id="timer-early-switch"') && d.includes('id="timer-barbers"') && /function renderTimerBarbers\(\)[\s\S]*?\(barbers \|\| \[\]\)\.filter\(function \(b\) \{ return b\.active; \}\)/.test(d) && d.includes('function saveTimerSettings()') && d.includes('function timerApplyToAll()'));
check('reglages : interrupteur Timer par coiffeur = le meme que sa fiche (synchronises)', /'<div class="switch' \+ \(timerOn \? ' on' : ''\) \+ '" role="switch"[\s\S]*?toggleBarberTimer\(/.test(d) && d.includes("id=\"bp-timer-switch-' + b.id + '\"") && d.includes("var fsw = document.getElementById('bp-timer-switch-' + id);"));
check('fiche du coiffeur : « Commencer un RDV en avance » (meme reglage, enregistre tout de suite)', d.includes("id=\"bp-timer-early-' + b.id + '\"") && d.includes('function timerBarberChanged(id, el)') && d.includes('function timerSyncViews(id)') && d.includes('function loadTimerSettingsOnce()'));
check('timer coupe : avance grisee', d.includes('.tm-row.timer-off .tm-ctrl { opacity: .45; pointer-events: none; }'));
(async () => {
  const H = { 'Content-Type': 'application/json', 'X-Salon-Slug': 'test', 'X-Admin-Password': 'adminpw' };
  const pub = async () => (await fetch(BASE + '/api/settings/public', { headers: { 'X-Salon-Slug': 'test' } })).json();
  let r = await pub();
  check('par defaut : active, 10 min', r.timer_early_enabled === true && r.timer_early_min === 10, r);
  let put = await fetch(BASE + '/api/settings', { method: 'PUT', headers: H, body: JSON.stringify({ timer_early_enabled: '0', timer_early_min: '15', timer_early_barbers: { b1: { mode: 'custom', min: 30 }, b2: { mode: 'off' }, b3: { mode: 'salon' } } }) });
  r = await pub();
  check('enregistrement : salon + coiffeurs (« comme le salon » non stocke)', put.status === 200 && r.timer_early_enabled === false && r.timer_early_min === 15 && JSON.stringify(r.timer_early_barbers) === '{"b1":{"mode":"custom","min":30},"b2":{"mode":"off"}}', r);
  put = await fetch(BASE + '/api/settings', { method: 'PUT', headers: H, body: JSON.stringify({ timer_early_barbers: { b1: { mode: 'custom', min: 999 } } }) });
  check('minutes invalides refusees', put.status === 400);
  put = await fetch(BASE + '/api/settings', { method: 'PUT', headers: H, body: JSON.stringify({ timer_early_min: '-3' }) });
  check('minutes du salon invalides refusees', put.status === 400);
  await fetch(BASE + '/api/settings', { method: 'PUT', headers: H, body: JSON.stringify({ timer_early_enabled: '1', timer_early_min: '10', timer_early_barbers: {} }) });
  console.log(`\n${pass} OK, ${fail} ECHEC`);
  process.exit(fail ? 1 : 0);
})();
