// Reservation a plusieurs : logique pure (lib/groupBooking) + route /api/appointments/group avec une base simulee en memoire
// (aucune base ni dependance reelle : express, mysql2, nodemailer sont remplaces).
process.env.PUBLIC_HOSTS = 'salon.test';
const Module = require('module'), path = require('path');
let pass = 0, fail = 0;
const check = (n, ok, extra) => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n + (ok || extra === undefined ? '' : '  -> ' + JSON.stringify(extra))); };
const G = require('../../src/lib/groupBooking');

// ---------- Logique pure ----------
const held = G.parseHeld('b1|2026-10-20|10:30|45,b2|2026-10-20|11:00|30,mauvais,b3|2026-10-21|25:00|30');
check('parseHeld : lit les creneaux valides, ignore les mal formes', held.length === 2 && held[0].start === 630 && held[1].barberId === 'b2');
check('heldRanges : seulement le meme coiffeur et le meme jour, marge incluse', JSON.stringify(G.heldRanges(held, 'b1', '2026-10-20', 5)) === '[[630,680]]' && G.heldRanges(held, 'b1', '2026-10-21', 5).length === 0 && G.heldRanges(held, 'b9', '2026-10-20', 5).length === 0);
check('normalizePeople : liste vide / trop longue refusee', G.normalizePeople({ people: [] }).error && G.normalizePeople({ people: new Array(7).fill({ service_id: 's', date: '2026-10-20', time: '10:00', name: 'A' }) }).error);
let n = G.normalizePeople({ client_name: 'Marc', people: [{ service_id: 's', date: '2026-10-20', time: '10:30' }, { name: '  Lucas  ', service_id: 's', date: '2026-10-20', time: '11:15', extras: ['e1', 'e1'], barber_id: 'b2' }] });
check('normalizePeople : sans nom = le client qui reserve ; noms nettoyes ; supplements dedoubles', n.people && n.people[0].name === 'Marc' && n.people[1].name === 'Lucas' && n.people[1].extras.length === 1);
n = G.normalizePeople({ client_name: 'Marc', people: [{ service_id: 's', date: '2026-10-20', time: '99:99' }] });
check('normalizePeople : horaire invalide -> erreur avec l\'index de la personne', n.error && n.index === 0);

// ---------- Route avec base simulee ----------
const state = { appts: [], extras: [], inserted: 0, deleted: [], mails: [], queue: [] };
const ymd = (d) => d.toISOString().slice(0, 10);
const tomorrow = ymd(new Date(Date.now() + 86400000 * 2));
const settings = { timezone: 'Europe/Paris', rdv_slot_step_min: 15, rdv_min_lead_min: 0, rdv_buffer_min: 0, rdv_max_advance_days: 0 };
const SERVICES = { s30: { id: 's30', name: 'Coupe', duration_min: 30, price_cents: 2000 }, s45: { id: 's45', name: 'Coupe + barbe', duration_min: 45, price_cents: 2800 } };
const BARBERS = { b1: 'Karim', b2: 'Sofiane' };
function fakeQuery(sql, params) {
  sql = sql.replace(/\s+/g, ' ').trim();
  if (/FROM services WHERE id = \? AND salon_id/.test(sql)) return [[SERVICES[params[0]]]];
  if (/FROM extras WHERE id IN/.test(sql)) return [[]];
  if (/FROM products WHERE id IN/.test(sql)) return [[]];
  if (/SELECT id FROM barbers WHERE id = \? AND salon_id/.test(sql)) return [[BARBERS[params[0]] ? { id: params[0] } : undefined]];
  if (/SELECT id FROM barbers WHERE salon_id = \? AND active = 1 AND accepts_appointments = 1/.test(sql)) return [Object.keys(BARBERS).map((id) => ({ id }))];
  if (/SELECT id, name FROM barbers WHERE id IN/.test(sql)) return [params[0].map((id) => ({ id, name: BARBERS[id] }))];
  if (/FROM barber_schedules/.test(sql)) return [[{ start_time: '09:00:00', end_time: '19:00:00' }]];
  if (/FROM barber_leaves/.test(sql)) return [[]];
  if (/FROM barber_walkin_days/.test(sql)) return [[]];
  if (/SELECT barber_id, COUNT\(\*\) AS n FROM appointments/.test(sql)) return [[]];
  if (/FROM salon_closures/.test(sql)) return [[]];   // aucune fermeture exceptionnelle
  if (/FROM barber_(service|extra)_(exclusions|prices)/.test(sql)) return [[]];   // ni exclusion ni tarif perso
  if (/FROM barber_breaks/.test(sql)) return [[]];
  if (/SELECT timer_enabled FROM barbers/.test(sql)) return [[{ timer_enabled: 1 }]];
  if (/FROM queue WHERE barber_id/.test(sql)) return [[]];
  if (/FROM appointments a JOIN services s/.test(sql)) {
    const bid = params[0], day = params[1];
    return [state.appts.filter((a) => a.barber_id === bid && a.scheduled_at.slice(0, 10) === day).map((a) => ({ scheduled_at: a.scheduled_at, svc_duration: SERVICES[a.service_id].duration_min, extras_duration: 0, queue_status: null }))];
  }
  if (/^INSERT INTO appointments/.test(sql)) {
    state.inserted++;
    state.appts.push({ id: params[0], barber_id: params[2], client_name: params[3], email: params[4], service_id: params[6], scheduled_at: params[7], status: 'confirmed', cancel_token: params[8], group_id: params[10], promoted_queue_id: null });
    return [{ affectedRows: 1 }];
  }
  if (/^INSERT INTO appointment_(extras|products)/.test(sql)) return [{ affectedRows: 1 }];
  if (/^DELETE FROM appointments WHERE id IN/.test(sql)) { state.deleted.push(...params[0]); state.appts = state.appts.filter((a) => !params[0].includes(a.id)); return [{ affectedRows: params[0].length }]; }
  if (/SELECT id, salon_id, group_id FROM appointments WHERE cancel_token/.test(sql)) { const a = state.appts.find((x) => x.cancel_token === params[0]); return [[a && { id: a.id, salon_id: 'S', group_id: a.group_id }]]; }
  if (/FROM appointments WHERE group_id = \?/.test(sql)) return [state.appts.filter((a) => a.group_id === params[0] && a.status === 'confirmed').map((a) => ({ id: a.id, salon_id: 'S', scheduled_at: a.scheduled_at, promoted_queue_id: null, gift_card_id: null }))];
  if (/^UPDATE appointments SET status = \?/.test(sql)) { const a = state.appts.find((x) => x.id === params[1]); a.status = params[0]; return [{ affectedRows: 1 }]; }
  if (/^UPDATE appointments SET promoted_queue_id/.test(sql)) { const a = state.appts.find((x) => x.id === params[1]); a.promoted_queue_id = params[0]; return [{ affectedRows: 1 }]; }
  if (/^INSERT INTO queue/.test(sql)) { state.queue.push(params); return [{ affectedRows: 1 }]; }
  throw new Error('SQL non prevu par la base simulee : ' + sql.slice(0, 90));
}
const handlers = {};
const fakeRouter = {}; ['get', 'post', 'put', 'delete', 'use'].forEach((m) => { fakeRouter[m] = function (p) { const fns = Array.prototype.slice.call(arguments, 1); handlers[m + ' ' + p] = fns[fns.length - 1]; }; });
const fakeExpress = () => ({}); fakeExpress.Router = () => fakeRouter;
const realLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'express') return fakeExpress;
  if (/(^|\/)db$/.test(request)) return { pool: { query: async (s, p) => fakeQuery(s, p), getConnection: async () => ({ query: async () => [[{ ok: 1 }]], release() {} }) }, utcIso: (x) => x, getSettings: async () => settings };
  if (/middleware\/(auth|barberAuth)$/.test(request)) return (q, r, nx) => nx();
  if (/lib\/mailer$/.test(request)) return new Proxy({}, { get: (t, k) => async (salonId, to, info) => { if (k === 'sendGroupAppointmentConfirmation') state.mails.push({ to, info }); } });
  return realLoad.apply(this, arguments);
};
require('../../src/routes/appointments');
Module._load = realLoad;

// wrap() ne renvoie pas la promesse du gestionnaire : on attend la reponse (res.json) elle-meme.
const call = (key, body) => new Promise((resolve, reject) => {
  const res = { statusCode: 200, body: null, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; resolve(this); return this; } };
  try { handlers[key]({ body, query: body.query || {}, salon: { id: 'S' } }, res, reject); } catch (e) { reject(e); }
});
(async () => {
  const base = { client_name: 'Marc', email: 'marc@x.fr', phone: '0600000000', base_url: 'https://salon.test/rdv.html' };
  // 1) pere + 2 fils, meme coiffeur a la suite (10:00, 10:30 apres 30 min, 11:00)
  let r = await call('post /group', Object.assign({}, base, { people: [
    { name: '', service_id: 's30', barber_id: 'b1', date: tomorrow, time: '10:00' },
    { name: 'Lucas', service_id: 's30', barber_id: 'b1', date: tomorrow, time: '10:30' },
    { name: 'Tom', service_id: 's45', barber_id: 'b2', date: tomorrow, time: '10:00' }] }));
  check('groupe de 3 : accepte, un rendez-vous par personne, meme group_id', r.statusCode === 200 && r.body.appointments.length === 3 && new Set(state.appts.map((a) => a.group_id)).size === 1 && state.appts.length === 3, r.body);
  check('...chacun a son nom (Marc = celui qui reserve), email du parent partage', state.appts.map((a) => a.client_name).join() === 'Marc,Lucas,Tom' && state.appts.every((a) => a.email === 'marc@x.fr'));
  check('...un seul mail pour le groupe, avec un lien par personne + « tout annuler »', state.mails.length === 1 && state.mails[0].info.items.length === 3 && /all=1/.test(state.mails[0].info.cancelAllUrl) && state.mails[0].info.items[2].barberName === 'Sofiane');

  // 2) chevauchement chez le meme coiffeur : rien n'est enregistre, et on dit pour qui
  const before = state.appts.length;
  r = await call('post /group', Object.assign({}, base, { people: [
    { name: 'Ana', service_id: 's30', barber_id: 'b1', date: tomorrow, time: '14:00' },
    { name: 'Leo', service_id: 's30', barber_id: 'b1', date: tomorrow, time: '14:15' }] }));
  check('deux personnes qui se chevauchent chez le meme coiffeur : 409, tout est annule (rien en base)', r.statusCode === 409 && r.body.person_index === 1 && /Leo/.test(r.body.error) && state.appts.length === before && state.deleted.length === 1, r.body);

  // 3) creneau deja pris par un autre rendez-vous
  r = await call('post /group', Object.assign({}, base, { people: [{ name: 'Zoe', service_id: 's30', barber_id: 'b1', date: tomorrow, time: '10:15' }] }));
  check('creneau deja occupe (10:15 chez Karim) : refuse proprement', r.statusCode === 409 && r.body.person_index === 0 && state.appts.length === before, r.body);

  // 4) « premier disponible » : trouve un coiffeur libre a cette heure
  r = await call('post /group', Object.assign({}, base, { people: [
    { name: 'Nina', service_id: 's30', date: tomorrow, time: '10:00' }] }));
  check('« premier disponible » : aucun coiffeur libre a 10:00 -> 409', r.statusCode === 409, r.body);
  r = await call('post /group', Object.assign({}, base, { people: [{ name: 'Nina', service_id: 's30', date: tomorrow, time: '11:00' }] }));
  check('« premier disponible » : un coiffeur est attribue quand un creneau est libre', r.statusCode === 200 && state.appts[state.appts.length - 1].barber_id, r.body);

  // 5) validations
  r = await call('post /group', { client_name: 'Marc', people: [{ service_id: 's30', date: tomorrow, time: '09:00' }] });
  check('email obligatoire', r.statusCode === 400);
  r = await call('post /group', Object.assign({}, base, { people: [{ name: 'Old', service_id: 's30', barber_id: 'b1', date: '2020-01-01', time: '10:00' }] }));
  check('creneau passe refuse', r.statusCode === 400 && /passé/.test(r.body.error));
  r = await call('post /group', Object.assign({}, base, { people: [{ name: 'X', service_id: 'inconnue', barber_id: 'b1', date: tomorrow, time: '16:00' }] }));
  check('prestation inconnue : 404, indexee', r.statusCode === 404 && r.body.person_index === 0);

  // 6) disponibilites : les creneaux deja retenus par les autres personnes sont retires (param held)
  const av = async (query) => { const res = await call('get /availability', { query }); return res.body.slots.map((s) => s.time + '@' + s.barber_id); };
  let slots = await av({ date: tomorrow, service_id: 's30', barber_id: 'b2', held: 'b2|' + tomorrow + '|15:00|30' });
  check('availability + held : 14:45 / 15:00 / 15:15 chez Sofiane ne sont plus proposes, 15:30 oui', !slots.includes('14:45@b2') && !slots.includes('15:00@b2') && !slots.includes('15:15@b2') && slots.includes('15:30@b2') && slots.includes('14:30@b2'), slots.filter((x) => /^1[45]/.test(x)));
  slots = await av({ date: tomorrow, service_id: 's30', held: 'b1|' + tomorrow + '|15:00|30' });
  check('availability sans coiffeur + held : le creneau 15:00 reste propose, avec l\'AUTRE coiffeur', slots.includes('15:00@b2') && !slots.includes('15:00@b1'), slots.filter((x) => /^15:00/.test(x)));
  slots = await av({ date: tomorrow, service_id: 's30', barber_id: 'b2' });
  check('availability sans held : inchange', slots.includes('15:00@b2'));

  // 7) annulation de tout le groupe
  const gid = state.appts[0].group_id, tok = state.appts[0].cancel_token;
  r = await call('post /cancel-group', { token: tok });
  check('cancel-group : les 3 rendez-vous du groupe sont annules, pas les autres', r.statusCode === 200 && r.body.cancelled === 3 && state.appts.filter((a) => a.group_id === gid).every((a) => a.status === 'cancelled') && state.appts.filter((a) => a.group_id !== gid).every((a) => a.status === 'confirmed'), r.body);
  r = await call('post /cancel-group', { token: tok });
  check('cancel-group : deja annule -> 409', r.statusCode === 409);

  // 8) un rendez-vous d'aujourd'hui entre aussitot dans la file (le rendez-vous de demain, non)
  console.log('\n' + pass + ' OK, ' + fail + ' ECHEC'); process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('ERREUR TEST', e.stack); process.exit(1); });
