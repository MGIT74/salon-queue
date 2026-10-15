// Date « aujourd'hui » = date DU SALON, jamais celle d'UTC : a 00h48 a Paris le 16, UTC est encore le 15.
// - salonToday() (app.js) avec une horloge figee a 2026-10-15T22:48Z -> 2026-10-16
// - aucune page de reservation / agenda ne calcule plus « aujourd'hui » via toISOString() ou l'appareil
// - la reservation a plusieurs (group-booking.js) part de salonToday() et refuse une date passee
// - serveur : /availability ne renvoie aucun creneau pour une date deja passee
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const BASE = 'http://127.0.0.1:3999';
const PUB = path.join(__dirname, '..', '..', 'public');
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n + (x ? '  [' + x + ']' : '')); };
const read = (f) => fs.readFileSync(path.join(PUB, f), 'utf8');

function contextAt(iso) {
  const Real = Date;
  const fixed = new Real(iso).getTime();
  class FakeDate extends Real { constructor(...a) { if (a.length) super(...a); else super(fixed); } static now() { return fixed; } }
  const ctx = { Date: FakeDate, Intl, console, window: {}, document: undefined };
  vm.createContext(ctx);
  const src = read('app.js');
  const a = src.indexOf("var SALON_TIMEZONE"), b = src.indexOf('window.salonToday = salonToday;');
  vm.runInContext(src.slice(a, b + 'window.salonToday = salonToday;'.length), ctx, { filename: 'app.js' });
  return ctx;
}

(async () => {
  console.log('\n[A] salonToday() suit le fuseau du salon');
  const c = contextAt('2026-10-15T22:48:00Z');
  check('00h48 a Paris le 16 -> 2026-10-16', vm.runInContext('salonToday()', c) === '2026-10-16', vm.runInContext('salonToday()', c));
  vm.runInContext("SALON_TIMEZONE = 'America/Martinique'", c);
  check('meme instant en Martinique -> 2026-10-15', vm.runInContext('salonToday()', c) === '2026-10-15');
  const c2 = contextAt('2026-10-16T21:59:00Z');
  check('23h59 a Paris le 16 -> encore 2026-10-16', vm.runInContext('salonToday()', c2) === '2026-10-16');

  console.log('\n[B] Plus aucun « aujourd\'hui » calcule en UTC ou sur l\'appareil');
  ['rdv.html', 'compte.html', 'caisse.html', 'poste.html', 'dashboard.html'].forEach((f) => {
    const s = read(f);
    check(f + ' : pas de new Date().toISOString().slice(0, 10)', s.indexOf('new Date().toISOString().slice(0, 10)') === -1);
    check(f + ' : pas de todayStr = ymd(new Date())', s.indexOf('todayStr = ymd(new Date())') === -1);
  });
  ['rdv.html', 'compte.html', 'caisse.html', 'poste.html', 'kiosk.html'].forEach((f) => {
    check(f + ' : charge le fuseau du salon depuis les reglages', /SALON_TIMEZONE = \w+(\[\d\])?\.timezone/.test(read(f)));
  });
  const gb = read('group-booking.js');
  check('group-booking : date par defaut = salonToday()', /salonToday\(\)/.test(gb));
  check('group-booking : une date passee est ramenee a aujourd\'hui', /cur\.date < today\(\)/.test(gb) && /t\.value >= today\(\)/.test(gb));

  console.log('\n[C] Serveur : aucune disponibilite pour une date passee');
  const H = { 'X-Salon-Slug': 'test' };
  const svc = { id: 'sv1' };
  const r = await (await fetch(BASE + '/api/appointments/availability?date=2020-01-06&service_id=' + svc.id + '&barber_id=b1', { headers: H })).json();
  check('2020-01-06 -> 0 creneau', r.ok && Array.isArray(r.slots) && r.slots.length === 0, JSON.stringify(r).slice(0, 80));
  const r2 = await (await fetch(BASE + '/api/appointments/availability?date=2020-01-06&service_id=' + svc.id, { headers: H })).json();
  check('2020-01-06 sans coiffeur -> 0 creneau', r2.ok && (r2.slots || []).length === 0);

  console.log('\n' + pass + ' OK, ' + fail + ' ECHEC');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
