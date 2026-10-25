// « Je veux seulement un supplement » : on peut reserver / prendre sa place SANS prestation, avec au moins un supplement.
// Le serveur utilise une prestation cachee « Supplement seul » (0 min, 0 EUR, jamais listee) : duree et prix = supplements.
// Partout : RDV en ligne, Mon compte, a plusieurs, borne, admin, caisse, Mon poste.
const fs = require('fs'), path = require('path'), vm = require('vm');
const { execSync } = require('child_process');
const BASE = 'http://127.0.0.1:3999';
const sql = (q) => execSync(`mariadb -uroot salonq -N -e "${q.replace(/"/g, '\\"')}"`).toString().trim();
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n + (x ? '  [' + (typeof x === 'string' ? x : JSON.stringify(x)).slice(0, 160) + ']' : '')); };
const PUB = { 'Content-Type': 'application/json', 'X-Salon-Slug': 'test' };
const ADMIN = Object.assign({ 'X-Admin-Password': 'adminpw' }, PUB);
const call = async (m, u, h, b) => { const r = await fetch(BASE + u, { method: m, headers: h, body: b ? JSON.stringify(b) : undefined }); let j = null; try { j = await r.json(); } catch (e) {} return { status: r.status, body: j }; };
const rd = (f) => fs.readFileSync(path.join(__dirname, '../../public', f), 'utf8');

(async () => {
  const d = new Date(Date.now() + 12 * 86400000), DAY = d.toISOString().slice(0, 10), wd = d.getUTCDay();
  sql(`DELETE FROM appointments WHERE client_name LIKE 'T124%'; DELETE FROM queue WHERE client_name LIKE 'T124%';
       INSERT IGNORE INTO extras (id, salon_id, name, duration_min, price_cents, active, sort_order) VALUES ('t124-soin','s1','T124 Soin',20,1200,1,99);
       UPDATE extras SET active = 1, deleted_at = NULL WHERE id = 't124-soin';
       DELETE FROM barber_schedules WHERE barber_id = 'b1' AND weekday = ${wd};
       INSERT INTO barber_schedules (id, barber_id, weekday, start_time, end_time, active) VALUES (UUID(),'b1',${wd},'09:00','19:00',1);
       DELETE FROM barber_walkin_days WHERE barber_id = 'b1'; DELETE FROM salon_closures WHERE salon_id = 's1';
       UPDATE barbers SET kiosk_hidden = 1, accepts_appointments = 1 WHERE id = 'b1';`);
  const hidden = 'supplement-seul-s1';

  console.log('\n[A] Serveur');
  let r = await call('GET', `/api/appointments/availability?date=${DAY}&barber_id=b1&extras=t124-soin`, PUB);
  check('creneaux sans prestation (duree des supplements)', r.status === 200 && r.body.slots.length > 0, r.body);
  r = await call('POST', '/api/appointments', PUB, { client_name: 'T124 Ligne', email: 't124@example.com', phone: '0600', barber_id: 'b1', extras: ['t124-soin'], date: DAY, time: '10:00' });
  check('RDV en ligne : seulement un supplement', r.status === 200, r.body);
  check('enregistre sur la prestation cachee, avec le supplement', sql(`SELECT CONCAT(a.service_id, '|', ae.extra_id) FROM appointments a JOIN appointment_extras ae ON ae.appointment_id = a.id WHERE a.client_name = 'T124 Ligne'`) === hidden + '|t124-soin');
  r = await call('POST', '/api/appointments', PUB, { client_name: 'T124 Rien', email: 't@x.fr', phone: '06', barber_id: 'b1', date: DAY, time: '11:00' });
  check('ni prestation ni supplement : refuse', r.status === 400 && /au moins un supplément/.test(r.body.error), r.body);
  r = await call('POST', '/api/appointments', PUB, { client_name: 'T124 Repere', email: 't@x.fr', phone: '06', service_id: '__extras__', barber_id: 'b1', extras: ['t124-soin'], date: DAY, time: '12:00' });
  check('le repere des pages (« __extras__ ») est accepte', r.status === 200, r.body);
  r = await call('POST', '/api/appointments/admin-create', ADMIN, { client_name: 'T124 Admin', barber_id: 'b1', extras: ['t124-soin'], date: DAY, time: '14:00' });
  check('admin / caisse / Mon poste : « Ajouter un RDV »', r.status === 200, r.body);
  r = await call('POST', '/api/appointments/group', PUB, { client_name: 'T124 G', email: 'g@x.fr', phone: '06', base_url: BASE + '/rdv.html',
    people: [{ name: 'T124 G1', service_id: '__extras__', extras: ['t124-soin'], barber_id: 'b1', date: DAY, time: '15:00' }, { name: 'T124 G2', service_id: 'sv1', barber_id: 'b1', date: DAY, time: '16:00' }] });
  check('a plusieurs : une personne seulement un supplement, l\'autre une prestation', r.status === 200 && r.body.appointments.length === 2, r.body);
  r = await call('POST', '/api/queue/checkin', PUB, { client_name: 'T124 Borne', extras: ['t124-soin'] });
  check('borne : place dans la file, 20 min / 12 EUR', r.status === 200 && r.body.entry.total_duration_min === 20 && r.body.entry.total_price_cents === 1200, r.body.entry && [r.body.entry.total_duration_min, r.body.entry.total_price_cents]);
  r = await call('GET', '/api/catalog/services?all=1', ADMIN);
  check('prestation cachee jamais listee', !r.body.items.some((s) => s.id === hidden));
  r = await call('PUT', '/api/catalog/services/' + hidden, ADMIN, { price_cents: 500 });
  check('ni modifiable ni supprimable', r.status === 403 && (await call('DELETE', '/api/catalog/services/' + hidden, ADMIN)).status === 403);
  r = await call('GET', '/api/appointments?month=' + DAY.slice(0, 7), ADMIN);
  const it = ((r.body && (r.body.items || r.body.appointments)) || []).find((a) => a.client_name === 'T124 Ligne');
  check('agenda : le nom affiche est le supplement', it && it.service_name === 'T124 Soin', it && it.service_name);

  console.log('\n[B] Ecrans');
  const app = rd('app.js');
  const ctx = {}; vm.createContext(ctx);
  vm.runInContext(app.match(/var EXTRAS_ONLY = [^\n]+\nvar EXTRAS_ONLY_NAME = [^\n]+\n/)[0] + app.match(/function svcLabel\([\s\S]*?\n\}\n/)[0], ctx);
  check('libelle : « Soin » pour un supplement seul, « Coupe + Soin » sinon', ctx.svcLabel('Supplément seul', [{ name: 'Soin' }]) === 'Soin' && ctx.svcLabel('Coupe', ['Soin']) === 'Coupe + Soin' && ctx.svcLabel('', ['Soin']) === 'Soin');
  check('carte « Seulement un supplement » partagee', /function extrasOnlyCardHtml\(/.test(app) && /Seulement un supplément/.test(app));
  for (const [f, re] of [['rdv.html', /extrasOnlyCardHtml\(selService === EXTRAS_ONLY/], ['compte.html', /extrasOnlyCardHtml\(selBookService === EXTRAS_ONLY/], ['kiosk.html', /extrasOnlyCardHtml\(selService === EXTRAS_ONLY/],
                         ['dashboard.html', /extrasOnlyCardHtml\(state\.serviceId === EXTRAS_ONLY/], ['caisse.html', /extrasOnlyCardHtml\(false, 'paSelectService\(this\)'\)/], ['poste.html', /extrasOnlyCardHtml\(false, 'paSelectService\(this\)'\)/]]) {
    check(f + ' : carte « Seulement un supplement »', re.test(rd(f)));
  }
  check('au moins un supplement avant la suite (en ligne, compte, borne, admin, caisse, poste)',
    /selService === EXTRAS_ONLY && !selExtras\.length/.test(rd('rdv.html')) && /selBookService === EXTRAS_ONLY && !selBookExtras\.length/.test(rd('compte.html')) &&
    /selService === EXTRAS_ONLY && !selExtras\.length/.test(rd('kiosk.html')) && /state\.serviceId === EXTRAS_ONLY && !state\.extraIds\.length/.test(rd('dashboard.html')) &&
    /state\.serviceId === EXTRAS_ONLY && !state\.extraIds\.length/.test(rd('caisse.html')) && /state\.serviceId === EXTRAS_ONLY && !state\.extraIds\.length/.test(rd('poste.html')));
  check('Timer / ecran TV : libelle du supplement', /svcLabel\(q\.service\.name, q\.extras\)/.test(rd('caisse.html')) && /svcLabel\(q\.service\.name, q\.extras\)/.test(rd('poste.html')) && /svcLabel\(q\.service\.name, q\.extras\)/.test(rd('display.html')));

  sql(`DELETE FROM appointments WHERE client_name LIKE 'T124%'; DELETE FROM queue WHERE client_name LIKE 'T124%'; DELETE FROM extras WHERE id = 't124-soin';`);
  console.log(`\n${pass} OK, ${fail} ECHEC`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
