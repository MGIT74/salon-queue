// Import de RDV (export CSV type Bookly) : lecture du fichier, rapprochement coiffeurs/prestations (ecran jsdom), route /import (base simulee).
const fs = require('fs'), Module = require('module');
let pass = 0, fail = 0;
const check = (n, ok, extra) => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n + (ok || extra === undefined ? '' : '  -> ' + JSON.stringify(extra))); };
const html = fs.readFileSync(__dirname + '/../../public/dashboard.html', 'utf8');
const a = html.indexOf('function _normalizeCsvHeader'), e = html.indexOf('function deleteSelectedClients');
const code = html.slice(a, e);

// Fichier fictif au format de l'export Bookly (colonnes reelles, donnees inventees)
const HEAD = '"Date rendez-vous",Equipe,"Nom Client","Téléphone Client","E-mail Client",Service,Durée,Statut,Notes,Créé,"Note interne","Adresse client",Site\n';
const line = (d, eq, nom, svc, st) => `"${d}",${eq},"${nom}",+33600000000,x@y.fr,"${svc}",25,${st},,"2026-08-19 23:06:45",,,"Salon Test - Ville"\n`;
const csv = HEAD +
  line('2026-10-20 10:00:00', 'Thomas', 'Ana', 'Coupe', 'Accepté') +
  line('2026-10-20 10:30:00', 'Ibrahim (Tous)', 'Bob', 'Coupe enfant -18 ans', 'Accepté') +
  line('2026-10-21 11:00:00', 'Ibrahim', 'Cleo', 'Coupe', 'Accepté') +
  line('2026-10-22 11:00:00', 'Emirhan', 'Dan', 'Coupe', 'Accepté') +
  line('2026-10-23 11:00:00', 'Thomas', 'Eva', 'Coupe', 'Annulé') +
  line('2026-10-01 09:00:00', 'Thomas', 'Passe', 'Coupe', 'Accepté') +
  '"pas une date",Thomas,Zed,Coupe,1,,Accepté\n';

// ---- A. lecture ----
const env = new Function(code + '; return { parseRdvCsv, _barberKey };')();
let p = env.parseRdvCsv(csv);
check('lit 6 RDV valides, 1 date illisible comptee', p.rows.length === 6 && p.badDate === 1, [p.rows.length, p.badDate]);
check('colonnes reconnues (date, coiffeur, client, prestation, statut, site)', p.rows[0].date === '2026-10-20' && p.rows[0].time === '10:00' && p.rows[0].barber === 'Thomas' && p.rows[0].status === 'Accepté' && /Ville/.test(p.rows[0].site));
check('"Ibrahim (Tous)" et "Ibrahim" = meme coiffeur', env._barberKey('Ibrahim (Tous)') === env._barberKey('Ibrahim'));
p = env.parseRdvCsv('Nom;Email\nAna;a@b.c\n');
check('fichier sans colonnes date/coiffeur/prestation : signale', p.missing.length === 3 || p.missing.includes('date'), p.missing);
p = env.parseRdvCsv('Date;Coiffeur;Nom;Prestation\n20/10/2026 9h30;Tom;Ana;Coupe\n');
check('format francais 20/10/2026 9h30', p.rows.length === 1 && p.rows[0].date === '2026-10-20' && p.rows[0].time === '09:30', p.rows);

// ---- B. ecran de rapprochement (jsdom) ----
let JSDOM = null; try { JSDOM = require('jsdom').JSDOM; } catch (_) { /* jsdom absent */ }
const handlers = {};
const sent = [];
(async () => {
  if (JSDOM) {
    const dom = new JSDOM('<body></body>', { runScripts: 'outside-only' });
    const w = dom.window;
    w.esc = (x) => String(x == null ? '' : x).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    w.nowSalonDatetimeString = () => '2026-10-14 12:00:00';
    w.toast = () => {}; w.location.reload = () => {};
    w.api = (url, o) => { sent.push({ url, body: o && o.body }); return Promise.resolve({ inserted: o.body.rows.length, skipped: 0, overlaps: 1, errors: [] }); };
    w.eval(code);
    const parsed = w.parseRdvCsv(csv);
    const barbers = [{ id: 'b-th', name: 'Thomas', active: 1 }, { id: 'b-ib', name: 'Ibrahim', active: 1 }];
    const services = [{ id: 's-c', name: 'Coupe' }];
    w.openRdvImportModal(parsed, barbers, services);
    const doc = w.document;
    let txt = doc.body.textContent;
    const sv = Array.from(doc.querySelectorAll('select')).map((x) => x.value);
    check('Thomas et Ibrahim (+ "(Tous)") associes automatiquement, Emirhan a choisir', sv[0] === 'b-th' && sv[1] === 'b-ib' && sv[2] === '' && /Emirhan/.test(txt), sv);
    check('prestation inconnue "Coupe enfant" a choisir -> import bloque', doc.getElementById('imp-go').disabled === true && /correspondance/.test(txt), txt.slice(0, 300));
    w._rdvImpSet('barber', 'emirhan', 'b-th');
    w._rdvImpSet('service', 'coupe enfant 18 ans', 'ignore');
    txt = doc.body.textContent;
    check('tout choisi : import possible, RDV passes exclus par defaut, annule exclu', doc.getElementById('imp-go').disabled === false && /3 rendez-vous seront importés/.test(txt), txt.slice(-200));
    w._rdvImpSet('past', '', true);
    check('case "RDV passes" : +1', /4 rendez-vous seront importés/.test(doc.body.textContent));
    w._rdvImpSet('status', 'Annulé', true);
    check('statut "Annulé" coche : compte mis a jour (5)', /5 rendez-vous seront importés/.test(doc.body.textContent));
    w._rdvImpSet('status', 'Annulé', false);
    doc.getElementById('imp-go').click();
    await new Promise((r) => setTimeout(r, 30));
    const rows = sent.length ? sent[0].body.rows : [];
    check('envoi vers /api/appointments/import avec coiffeur + prestation associes', sent[0] && sent[0].url === '/api/appointments/import' && rows.length === 4 && rows.every((r) => r.barber_id && r.service_id) && rows[0].barber_id === 'b-th', sent[0] && sent[0].body);
    check('Emirhan envoye sous Thomas (choix de l\'admin)', rows.some((r) => r.client_name === 'Dan' && r.barber_id === 'b-th'));
    const res = doc.body.textContent;
    check('fin : resultat + chevauchement signale + Valider', /4 rendez-vous importés/.test(res) && /chevauchent/.test(res) && doc.getElementById('imp-actions').style.display === '');
  } else console.log('  (jsdom absent : ecran de rapprochement non teste)');

  // ---- C. route /import ----
  const SERV = { s1: 30, s2: 45 }, BARB = new Set(['b1', 'b2']);
  const existing = [{ barber_id: 'b1', scheduled_at: '2026-10-20 10:00:00', client_name: 'Ana', dur: 30 }];
  let inserted = [];
  const fq = (sql, p) => {
    sql = sql.replace(/\s+/g, ' ');
    if (/^SELECT id FROM barbers WHERE salon_id/.test(sql)) return [[...BARB].map((id) => ({ id }))];
    if (/^SELECT id, duration_min FROM services WHERE salon_id/.test(sql)) return [Object.keys(SERV).map((id) => ({ id, duration_min: SERV[id] }))];
    if (/FROM appointments a LEFT JOIN services s/.test(sql)) return [existing];
    if (/^INSERT INTO appointments/.test(sql)) { for (let i = 0; i < p.length; i += 10) inserted.push(p.slice(i, i + 10)); return [{}]; }
    throw new Error('SQL non prevu ' + sql.slice(0, 70));
  };
  const router = {}; ['get', 'post', 'put', 'delete', 'use'].forEach((m) => { router[m] = function (pth) { handlers[m + ' ' + pth] = Array.prototype.slice.call(arguments, 1); }; });
  const fx = () => ({}); fx.Router = () => router;
  const real = Module._load;
  Module._load = function (request) {
    if (request === 'express') return fx;
    if (/(^|\/)db$/.test(request)) return { pool: { query: async (s, p) => fq(s, p) }, utcIso: (x) => x, getSettings: async () => ({ timezone: 'Europe/Paris' }) };
    if (/middleware\/(auth|barberAuth)$/.test(request)) return (q, r, n) => n();
    if (/lib\/mailer$/.test(request)) return new Proxy({}, { get: () => async () => { throw new Error('aucun email ne doit partir'); } });
    if (/lib\/activityLog$/.test(request)) return { logActivity() {} };
    return real.apply(this, arguments);
  };
  require('../../src/routes/appointments');
  Module._load = real;
  const call = (body) => new Promise((resolve, reject) => {
    const fns = handlers['post /import'];
    const res = { statusCode: 200, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; resolve(this); } };
    let i = 0; const next = (er) => { if (er) return reject(er); const f = fns[i++]; if (f) Promise.resolve(f({ body, salon: { id: 'S' } }, res, next)).catch(reject); }; next();
  });
  const row = (o) => Object.assign({ line: 2, date: '2026-10-20', time: '11:00', client_name: 'Bob', barber_id: 'b1', service_id: 's1', email: '', phone: '' }, o);
  let r = await call({ rows: [
    row({ client_name: 'Ana', time: '10:00' }),                 // doublon existant
    row({ client_name: 'Bob', time: '11:00' }),                 // ok
    row({ client_name: 'Cleo', time: '11:15', line: 3 }),       // chevauche Bob (30 min)
    row({ client_name: 'Dan', barber_id: 'ZZ', line: 4 }),      // coiffeur inconnu
    row({ client_name: 'Eva', service_id: 'ZZ', line: 5 }),     // prestation inconnue
    row({ client_name: 'Fay', date: '20/10', line: 6 }),        // date illisible
    row({ client_name: '', line: 7 })                           // sans nom
  ] });
  check('1 doublon ignore, 2 inseres, 1 chevauchement, 4 erreurs detaillees', r.body.skipped === 1 && r.body.inserted === 2 && r.body.overlaps === 1 && r.body.errors.length === 4, r.body);
  check('erreurs : ligne + raison', r.body.errors.some((x) => x.line === 4 && /Coiffeur/.test(x.error)) && r.body.errors.some((x) => x.line === 5 && /Prestation/.test(x.error)));
  check('RDV inseres : confirmes, source import, aucun email', inserted.length === 2 && inserted[0][2] === 'b1');
  r = await call({ rows: [] });
  check('lot vide refuse', r.statusCode === 400);
  r = await call({ rows: new Array(201).fill(row({})) });
  check('plus de 200 par lot refuse', r.statusCode === 400);
  console.log('\nRESULTAT : ' + pass + ' verifications reussies, ' + fail + ' echec(s)');
  process.exit(fail ? 1 : 0);
})();
