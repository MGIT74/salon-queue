// « Mes proches » du compte client : ajout, doublon, renommage, suppression, limite, isolation entre comptes (base simulee).
const Module = require('module');
let pass = 0, fail = 0;
const check = (n, ok, extra) => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n + (ok || extra === undefined ? '' : '  -> ' + JSON.stringify(extra))); };
const rel = [];
const SESSIONS = { tokA: { id: 'A', name: 'Marc', email: 'm@x.fr', salon_id: 'S' }, tokB: { id: 'B', name: 'Eve', email: 'e@x.fr', salon_id: 'S' } };
function q(sql, p) {
  sql = sql.replace(/\s+/g, ' ').trim();
  if (/FROM client_sessions cs/.test(sql)) return [[SESSIONS[p[0]]]];
  if (/^SELECT id, name FROM client_relatives WHERE client_id = \? ORDER BY/.test(sql)) return [rel.filter((r) => r.client_id === p[0]).map(({ id, name }) => ({ id, name }))];
  if (/^SELECT COUNT\(\*\) AS n FROM client_relatives/.test(sql)) return [[{ n: rel.filter((r) => r.client_id === p[0]).length }]];
  if (/LOWER\(name\) = LOWER/.test(sql)) return [[rel.filter((r) => r.client_id === p[0] && r.name.toLowerCase() === p[1].toLowerCase()).map(({ id, name }) => ({ id, name }))[0]]];
  if (/^INSERT INTO client_relatives/.test(sql)) { rel.push({ id: p[0], client_id: p[1], name: p[2] }); return [{ affectedRows: 1 }]; }
  if (/^UPDATE client_relatives SET name/.test(sql)) { const r = rel.find((x) => x.id === p[1] && x.client_id === p[2]); if (r) r.name = p[0]; return [{ affectedRows: r ? 1 : 0 }]; }
  if (/^DELETE FROM client_relatives/.test(sql)) { const i = rel.findIndex((x) => x.id === p[0] && x.client_id === p[1]); if (i >= 0) rel.splice(i, 1); return [{ affectedRows: i >= 0 ? 1 : 0 }]; }
  throw new Error('SQL non prevu : ' + sql.slice(0, 80));
}
const handlers = {};
const fakeRouter = {}; ['get', 'post', 'put', 'delete', 'use'].forEach((m) => { fakeRouter[m] = function (p) { const fns = Array.prototype.slice.call(arguments, 1); handlers[m + ' ' + p] = fns; }; });
const fakeExpress = () => ({}); fakeExpress.Router = () => fakeRouter;
const real = Module._load;
Module._load = function (request) {
  if (request === 'express') return fakeExpress;
  if (/(^|\/)db$/.test(request)) return { pool: { query: async (s, p) => q(s, p) }, getSettings: async () => ({}) };
  if (/lib\/password$/.test(request)) return {};
  if (/lib\/mailer$/.test(request)) return {};
  if (/lib\/loyalty$/.test(request)) return {};
  if (/middleware\/rateLimiter$/.test(request)) return { loginRateLimiter: () => (a, b, n) => n(), signupRateLimiter: () => (a, b, n) => n() };
  if (/routes\/appointments$|^\.\/appointments$/.test(request)) return { nowParisDatetimeString: () => '2026-01-01 00:00:00' };
  return real.apply(this, arguments);
};
require('../../src/routes/clientAuth');
Module._load = real;

const call = (key, token, body, params) => new Promise((resolve, reject) => {
  const fns = handlers[key];
  const res = { statusCode: 200, body: null, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; resolve(this); return this; } };
  const req = { headers: token ? { 'x-client-token': token } : {}, body: body || {}, params: params || {} };
  let i = 0;
  const next = (e) => { if (e) return reject(e); const fn = fns[i++]; if (fn) Promise.resolve(fn(req, res, next)).catch(reject); };
  next();
});
(async () => {
  let r = await call('get /relatives');
  check('sans connexion : 401', r.statusCode === 401);
  r = await call('post /relatives', 'tokA', { name: '  Lucas  ' });
  check('ajout : prenom nettoye', r.statusCode === 200 && r.body.item.name === 'Lucas', r.body);
  const lucas = r.body.item.id;
  r = await call('post /relatives', 'tokA', { name: 'lucas' });
  check('meme prenom (casse differente) : pas de doublon', r.body.existing === true && rel.length === 1);
  r = await call('post /relatives', 'tokA', { name: '   ' });
  check('prenom vide refuse', r.statusCode === 400);
  await call('post /relatives', 'tokA', { name: 'Tom' });
  r = await call('get /relatives', 'tokA');
  check('liste : mes proches dans l\'ordre d\'ajout', r.body.items.map((x) => x.name).join() === 'Lucas,Tom');
  r = await call('get /relatives', 'tokB');
  check('isolation : un autre compte ne voit pas ces proches', r.body.items.length === 0);
  r = await call('put /relatives/:id', 'tokB', { name: 'Pirate' }, { id: lucas });
  check('isolation : un autre compte ne peut pas renommer', r.statusCode === 404 && rel.find((x) => x.id === lucas).name === 'Lucas');
  r = await call('delete /relatives/:id', 'tokB', {}, { id: lucas });
  check('isolation : un autre compte ne peut pas supprimer', r.statusCode === 404 && rel.length === 2);
  r = await call('put /relatives/:id', 'tokA', { name: 'Lucas B.' }, { id: lucas });
  check('renommage', r.statusCode === 200 && rel.find((x) => x.id === lucas).name === 'Lucas B.');
  r = await call('delete /relatives/:id', 'tokA', {}, { id: lucas });
  check('suppression', r.statusCode === 200 && rel.length === 1);
  for (let i = 0; i < 12; i++) await call('post /relatives', 'tokA', { name: 'P' + i });
  r = await call('post /relatives', 'tokA', { name: 'Un de trop' });
  check('limite de 12 proches', r.statusCode === 400 && rel.filter((x) => x.client_id === 'A').length === 12, r.body);
  console.log('\n' + pass + ' OK, ' + fail + ' ECHEC'); process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('ERREUR TEST', e.stack); process.exit(1); });
