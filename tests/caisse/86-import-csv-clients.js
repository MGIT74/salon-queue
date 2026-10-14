// Import CSV des clients : lecture robuste du fichier (2000 lignes, guillemets multi-lignes, sans nom) + route en lot avec doublons (base simulee).
const fs = require('fs');
const Module = require('module');
let pass = 0, fail = 0;
const check = (n, ok, extra) => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n + (ok || extra === undefined ? '' : '  -> ' + JSON.stringify(extra))); };

// --- A. parseur cote dashboard ---
const html = fs.readFileSync(__dirname + '/../../public/dashboard.html', 'utf8');
const a = html.indexOf('var CSV_HEADER_ALIASES'), e = html.indexOf('function confirmImportClients');
const P = new Function(html.slice(a, e) + '; return parseClientsCsv;')();
let csv = 'Nom;Email;Téléphone\n';
for (let i = 0; i < 2000; i++) csv += (i % 10 === 0 ? '' : '"Client ' + i + '"') + ';c' + i + '@x.fr;06' + i + '\n';
csv += '"Multi\nligne";a@b.c;1\n;;\n';
let r = P(csv);
check('2000 lignes + 1 multi-ligne : tous les contacts utilisables lus', r.length === 2001, r.length);
check('lignes sans nom gardees via email (200)', r.noName === 200, r.noName);
check('ligne totalement vide ignoree et comptee', r.ignored === 0 && r.totalRows === 2001, [r.ignored, r.totalRows]);
check('champ multi-ligne lu comme un seul client', r[r.length - 1].name === 'Multi\nligne');
r = P('Name,Phone\r\nAnna,0612\r\n,\r\n');
check('virgule + en-tetes anglais + CRLF', r.length === 1 && r[0].phone === '0612' && r.ignored === 0, r);
check('envoi par lots de 100 + route /bulk appelee', /batch: 100/.test(html) && /manual-client\/bulk/.test(html));

// --- B. route /manual-client/bulk ---
const rows = [{ client_name: 'Anna', email: 'a@x.fr', phone: '06' }];
let inserted = [];
const handlers = {};
const fakeRouter = {}; ['get', 'post', 'put', 'delete', 'use'].forEach((m) => { fakeRouter[m] = function (p) { handlers[m + ' ' + p] = Array.prototype.slice.call(arguments, 1); }; });
const fakeExpress = () => ({}); fakeExpress.Router = () => fakeRouter;
const real = Module._load;
Module._load = function (request) {
  if (/routes\/queue$/.test(request)) return real.apply(this, arguments);
  if (request === 'express') return fakeExpress;
  if (/(^|\/)db$/.test(request)) return { pool: { query: async (s, p) => {
    s = s.replace(/\s+/g, ' ');
    if (/^SELECT client_name, email, phone FROM queue/.test(s)) return [rows];
    if (/^INSERT INTO queue/.test(s)) { for (let i = 0; i < p.length; i += 5) inserted.push(p.slice(i, i + 5)); return [{}]; }
    throw new Error('SQL non prevu ' + s.slice(0, 60));
  } }, utcIso: () => '', getSettings: async () => ({}) };
  if (/middleware\/auth$/.test(request)) { const f = (q, s, n) => n(); f.verifyOwnerPassword = async () => true; return f; }
  if (/middleware\/barberAuth$/.test(request)) return (q, s, n) => n();
  if (/lib\/(queueMath|lineAttribution|activityLog|wrap)$/.test(request)) return { wrap: (f) => f, logActivity() {}, clientKey() {}, loadQueue() {}, recompute() {}, serviceLineTransfers() {}, applyTransfers() {}, salesRevenueByBarber() {} };
  if (/routes\/appointments$|^\.\/appointments$/.test(request)) return { promoteTodayAppointments() {}, nowParisDatetimeString: () => '' };
  return new Proxy(function () {}, { get: () => () => ({}), apply: () => ({}) });
};
try { require('../../src/routes/queue'); } finally { Module._load = real; }
const call = (body) => new Promise((resolve, reject) => {
  const fns = handlers['post /manual-client/bulk'];
  const res = { statusCode: 200, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; resolve(this); } };
  const req = { body, salon: { id: 'S' } };
  let i = 0; const next = (er) => { if (er) return reject(er); const fn = fns[i++]; if (fn) Promise.resolve(fn(req, res, next)).catch(reject); }; next();
});
(async () => {
  let x = await call({ clients: [{ name: 'Anna', email: 'A@x.fr', phone: '06' }, { name: 'Bob', email: '', phone: '07' }, { name: 'Bob', email: '', phone: '07' }, { name: '  ' }, { name: 'Cleo' }] });
  check('doublon existant, doublon dans le lot et nom vide ignores', x.body.inserted === 2 && x.body.skipped === 3, x.body);
  check('Bob et Cleo inseres avec email/telephone nuls si vides', inserted.length === 2 && inserted[0][2] === 'Bob' && inserted[0][3] === null && inserted[1][4] === null, inserted);
  x = await call({ clients: [] });
  check('lot vide refuse (400)', x.statusCode === 400);
  x = await call({ clients: new Array(501).fill({ name: 'x' }) });
  check('plus de 500 par lot refuse (400)', x.statusCode === 400);
  // --- C. fenetre de progression (jsdom si dispo) ---
  let JSDOM = null; try { JSDOM = require('jsdom').JSDOM; } catch (_) { /* jsdom absent */ }
  if (JSDOM) {
    const dom = new JSDOM('<body></body>', { runScripts: 'outside-only' });
    const w = dom.window; let reloaded = 0; const calls = [];
    w.esc = (x) => String(x); w.location.reload = () => {}; 
    w.api = (url, o) => { calls.push(url); if (/bulk/.test(url)) { const n = o.body.clients.length; if (calls.filter((c) => /bulk/.test(c)).length === 2) return Promise.reject(new Error('Serveur indisponible')); return Promise.resolve({ inserted: n - 1, skipped: 1 }); } return Promise.resolve({}); };
    const a2 = html.indexOf('function _importErrorsHtml'), e2 = html.indexOf('/* ============ Import de RDV');
    w.eval(html.slice(a2, e2));
    const list = []; for (let i = 0; i < 250; i++) list.push({ name: 'C' + i });
    w.runClientsImport(list);
    check('fenetre de progression ouverte a 0 %', /0 %/.test(w.document.body.textContent) && !!w.document.getElementById('imp-bar'));
    await new Promise((r) => setTimeout(r, 50));
    const txt = w.document.body.textContent;
    check('fin : 100 %, titre "avec des erreurs", lot en erreur detaille', /100 %/.test(txt) && /avec des erreurs/.test(txt) && /Lignes 101 à 200 : Serveur indisponible/.test(txt), txt.slice(0, 200));
    check('fin : 148 importes (lots 1 et 3) et 2 doublons comptes', /148 clients importés/.test(txt) && /2 déjà présents/.test(txt), txt.slice(0, 200));
    check('bouton Valider visible et journal appele', w.document.getElementById('imp-actions').style.display === '' && calls.some((c) => /import-log/.test(c)));
  } else console.log('  (jsdom absent : fenetre de progression non testee)');
  console.log('\nRESULTAT : ' + pass + ' verifications reussies, ' + fail + ' echec(s)');
  process.exit(fail ? 1 : 0);
})();
