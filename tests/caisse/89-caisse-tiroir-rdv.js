// Caisse : un clic sur un RDV (frise de l'Agenda ou liste des suivants) ouvre le tiroir client a droite - modifier, deplacer, annuler, note.
// + routes /lookup et /reschedule ouvertes au coiffeur (base simulee).
const fs = require('fs'), Module = require('module');
let pass = 0, fail = 0;
const check = (n, ok, extra) => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n + (ok || extra === undefined ? '' : '  -> ' + JSON.stringify(extra))); };
const html = fs.readFileSync(__dirname + '/../../public/caisse.html', 'utf8');

check('Timer : un clic sur un suivant appelle openNextClient()', /class=\\"next-info\\" onclick=\\"openNextClient\(/.test(html.replace(/"/g, '\\"').replace(/\\\\"/g, '\\"')) || /next-info\\" onclick=\\"openNextClient/.test(html) || html.includes("next-info\" onclick=\"openNextClient("));
check('Agenda : la frise appelle toujours openAgendaClientDrawer()', html.includes("'openAgendaClientDrawer(\\'' + it.id + '\\')'") || /openAgendaClientDrawer\(\\'/.test(html));

check('Caisse : pastille de categorie active lisible en sombre (texte = couleur de carte, plus #fff sur fond clair)', html.includes("(f === value ? 'var(--card, #fff)' : 'inherit')") && !html.includes("(f === value ? '#fff' : 'inherit')"));

let JSDOM = null; try { JSDOM = require('jsdom').JSDOM; } catch (_) { /* absent */ }
(async () => {
  if (JSDOM) {
    const markup = html.slice(html.indexOf('<div class="appt-drawer-backdrop"'), html.indexOf('<div class="receipt-overlay"'));
    const code = html.slice(html.indexOf('var adAppt = null;'), html.indexOf('/**\n * Client SANS rendez-vous, deja demarre'));
    const dom = new JSDOM('<body>' + markup + '</body>', { runScripts: 'outside-only' });
    const w = dom.window, doc = w.document;
    const calls = [];
    w.esc = (x) => String(x == null ? '' : x).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    w.nowSalonDatetimeString = () => '2026-10-14 12:00:00';
    w._lockBodyScroll = () => {}; w._unlockBodyScroll = () => {};
    w.toast = (m, err) => calls.push(['toast', m, !!err]);
    w.calMonthCache = { '2026-10': [] }; w.calBooted = true; w.loadAgendaPeriod = () => calls.push(['loadAgenda']);
    w.renderNext = () => calls.push(['renderNext']); w.renderActive = () => {};
    w.toggleNextDetail = (id) => calls.push(['toggle', id]);
    w.eur = (c) => (c / 100).toFixed(2) + ' €'; w.formatMinutes = (m) => m + ' min';
    w.hasBookableSchedule = () => true; w.isOnLeaveOn = () => false;
    w.queue = [{ id: 'q-rdv', is_appointment: 1 }, { id: 'q-walk', is_appointment: 0 }];
    w.allBarbers = [{ id: 'b1', name: 'Thomas', accepts_appointments: 1, active: 1 }, { id: 'b2', name: 'Ibrahim', accepts_appointments: 1, active: 1 }];
    w._buildModal = (inner) => { const o = doc.createElement('div'); o.innerHTML = '<div class="modal-box">' + inner + '</div>'; doc.body.appendChild(o); return o; };
    w._closeModal = (o) => o.remove();
    w.showConfirm = () => Promise.resolve(true); w.showPrompt = () => Promise.resolve(true);
    w.barberApi = (url, o) => {
      calls.push(['api', (o && o.method) || 'GET', url, o && o.body, o && o.actingAs]);
      if (/client-marketing/.test(url)) return Promise.resolve({ loyalty: { activated: true, points: 7, rewards_available: 1 }, gifts: [{ amount_cents: 1500, used_at: null, items: [{ quantity: 1, item_name: 'Barbe' }] }] });
      if (/client-history/.test(url)) return Promise.resolve({ items: [1, 2, 3, 4, 5].map((i) => ({ id: 'h' + i, checkin_at: '2026-09-0' + i + 'T10:00:00Z', service_name: 'Coupe', total_price_cents: 2500, status: 'done', source: i % 2 ? 'online' : 'walkin', start_at: '2026-09-0' + i + 'T10:00:00Z', end_at: '2026-09-0' + i + 'T10:30:00Z' })) });
      if (/availability/.test(url)) return Promise.resolve({ slots: [{ time: '10:00' }, { time: '15:30' }] });
      if (/lookup/.test(url)) return Promise.resolve({ item: Object.assign({}, APPT, { promoted_queue_id: 'q-rdv' }) });
      if (/api\/queue\?/.test(url)) return Promise.resolve({ queue: [] });
      return Promise.resolve({ ok: true });
    };
    const APPT = { id: 'a1', client_name: 'Tom', email: 't@x.fr', phone: '0600', barber_id: 'b1', barber_name: 'Thomas', service_id: 's1', service_name: 'Coupe',
      scheduled_at: '2026-10-20 14:10:00', status: 'confirmed', display_status: 'confirmed', source: 'online', promoted_queue_id: null, note: '' };
    w.calApptById = { a1: APPT };
    w.eval(code);
    const $ = (id) => doc.getElementById(id), drawer = () => $('appt-drawer-backdrop').classList.contains('on');
    const tick = () => new Promise((r) => setTimeout(r, 20));

    w.openAgendaClientDrawer('a1');
    check('clic sur un RDV a venir : le tiroir s\'ouvre avec le nom, le statut et les details', drawer() && $('ad-name').textContent === 'Tom' && /Confirmé/.test($('ad-badge').textContent) && /Coupe/.test($('ad-info').textContent) && /Thomas/.test($('ad-info').textContent));
    check('Deplacer + Annuler le RDV visibles', $('ad-actions').style.display === 'flex');
    check('RDV pas encore dans la file : pas de crayon, note non modifiable', $('ad-edit-btn').style.display === 'none' && /entrera dans la file/.test($('ad-note-box').textContent));
    await tick();
    check('Tiroir : fidelite + cadeau affiches (comme l\'admin)', $('ad-marketing-section').style.display === 'block' && /7 points/.test($('ad-marketing-content').textContent) && /1 récompense/.test($('ad-marketing-content').textContent) && /Cadeau disponible/.test($('ad-marketing-content').textContent));
    check('Tiroir : historique (RDV futur -> par contact), 5 passages dont 4 affiches', /5 passages au total/.test($('ad-visit-count').textContent) && $('ad-visits').querySelectorAll('.ad-visit-row').length === 4 && calls.some((c) => c[0] === 'api' && /client-history-by-contact\?/.test(c[2])));
    w.closeApptDrawer();
    check('✕ ferme le tiroir', !drawer());

    w.openApptDrawer(Object.assign({}, APPT, { status: 'cancelled' }));
    check('RDV annule : pas de Deplacer/Annuler', $('ad-actions').style.display === 'none' && /Annulé/.test($('ad-badge').textContent));
    w.openApptDrawer(Object.assign({}, APPT, { scheduled_at: '2026-10-14 09:00:00' }));
    check('RDV deja passe : pas de Deplacer/Annuler', $('ad-actions').style.display === 'none');
    w.openApptDrawer(Object.assign({}, APPT, { display_status: 'completed' }));
    check('RDV termine : pas de Deplacer/Annuler', $('ad-actions').style.display === 'none' && /Terminé/.test($('ad-badge').textContent));

    // RDV du jour deja promu : modifier + note
    const today = Object.assign({}, APPT, { scheduled_at: '2026-10-14 16:00:00', promoted_queue_id: 'q-rdv', note: 'allergie' });
    w.openApptDrawer(today);
    check('RDV promu : crayon visible, note interne pre-remplie', $('ad-edit-btn').style.display === 'flex' && $('ad-note').value === 'allergie');
    w.adToggleEdit();
    check('Modifier : formulaire pre-rempli', $('ad-edit-section').style.display === 'block' && $('ad-edit-name').value === 'Tom' && $('ad-edit-phone').value === '0600');
    $('ad-edit-name').value = 'Thomas B'; $('ad-edit-phone').value = '0711';
    calls.length = 0; w.adSaveInfo(); await tick();
    const put = calls.find((c) => c[0] === 'api' && c[1] === 'PUT');
    check('Enregistrer : PUT /api/queue/<file> avec les nouvelles coordonnees, au nom du coiffeur', put && put[2] === '/api/queue/q-rdv' && put[3].client_name === 'Thomas B' && put[3].phone === '0711' && put[4] === 'b1', put);
    check('apres modification : tiroir mis a jour et agenda/suivants rafraichis', $('ad-name').textContent === 'Thomas B' && $('ad-edit-section').style.display === 'none' && calls.some((c) => c[0] === 'loadAgenda') && calls.some((c) => c[0] === 'renderNext'));
    $('ad-note').value = 'dégradé'; calls.length = 0; w.adSaveNote(); await tick();
    const pn = calls.find((c) => c[0] === 'api' && /\/note$/.test(c[2]));
    check('note interne : PUT /api/queue/<file>/note', pn && pn[1] === 'PUT' && pn[3].note === 'dégradé', pn);

    // Annuler
    w.openApptDrawer(APPT); calls.length = 0; w.adCancel(); await tick(); await tick();
    const cc = calls.find((c) => c[0] === 'api' && /admin-cancel/.test(c[2]));
    check('Annuler le RDV (double confirmation acceptee) : POST admin-cancel au nom du coiffeur, tiroir ferme, vues rafraichies', cc && cc[1] === 'POST' && cc[2] === '/api/appointments/a1/admin-cancel' && cc[4] === 'b1' && !drawer() && calls.some((c) => c[0] === 'loadAgenda'), cc);
    w.showConfirm = () => Promise.resolve(false); w.openApptDrawer(APPT); calls.length = 0; w.adCancel(); await tick();
    check('Annuler refuse a la 1re confirmation : rien n\'est envoye', !calls.some((c) => c[0] === 'api') && drawer());
    w.showConfirm = () => Promise.resolve(true);

    // Deplacer
    w.openApptDrawer(APPT); calls.length = 0; w.adReschedule(); await tick();
    const modal = () => doc.querySelector('.modal-box');
    check('Deplacer : fenetre avec coiffeurs, date et creneaux (Matin / Apres-midi)', !!$('rs-barber') && $('rs-barber').options.length === 2 && $('rs-date').value === '2026-10-20' && /10:00/.test(modal().textContent), modal() && modal().textContent.slice(0, 120));
    const av = calls.find((c) => c[0] === 'api' && /availability/.test(c[2]));
    check('creneaux : availability de ce coiffeur en excluant le RDV lui-meme', av && /exclude_appointment_id=a1/.test(av[2]) && /barber_id=b1/.test(av[2]) && /service_id=s1/.test(av[2]), av);
    check('Enregistrer inactif tant qu\'aucun creneau n\'est choisi', $('rs-save-btn').disabled === true);
    $('rs-barber').value = 'b2';
    w.adRsShowHalf('afternoon'); w.adRsSelectSlot(doc.querySelector('.aa-slot[data-time="15:30"]'));
    check('choix d\'un creneau : Enregistrer actif', $('rs-save-btn').disabled === false);
    calls.length = 0; $('rs-date').value = '2026-10-21'; $('rs-save-btn').click(); await tick();
    const rp = calls.find((c) => c[0] === 'api' && /reschedule/.test(c[2]));
    check('Enregistrer : PUT reschedule (date, heure, nouveau coiffeur) au nom du coiffeur actuel', rp && rp[1] === 'PUT' && rp[2] === '/api/appointments/a1/reschedule' && rp[3].time === '15:30' && rp[3].barber_id === 'b2' && rp[3].date === '2026-10-21' && rp[4] === 'b1', rp);
    check('apres deplacement : tiroir ferme, agenda rafraichi', !drawer() && calls.some((c) => c[0] === 'loadAgenda'));

    // Timer : liste des suivants
    w.queue = [{ id: 'q-rdv', is_appointment: 1 }, { id: 'q-walk', is_appointment: 0 }];
    calls.length = 0; w.openNextClient('q-walk');
    check('Timer : client SANS RDV -> volet deroulant habituel (pas de tiroir)', calls.some((c) => c[0] === 'toggle' && c[1] === 'q-walk') && !drawer());
    calls.length = 0; w.openNextClient('q-rdv'); await tick();
    check('Timer : RDV -> le tiroir s\'ouvre (RDV retrouve via la file)', calls.some((c) => c[0] === 'api' && /lookup\?queue_id=q-rdv/.test(c[2])) && drawer() && $('ad-name').textContent === 'Tom');
  } else console.log('  (jsdom absent : comportement du tiroir non teste)');

  // ---- routes (base simulee) ----
  const handlers = {};
  const router = {}; ['get', 'post', 'put', 'delete', 'use'].forEach((m) => { router[m] = function (p) { handlers[m + ' ' + p] = Array.prototype.slice.call(arguments, 1); }; });
  const fx = () => ({}); fx.Router = () => router;
  const mwAdmin = (q, r, n) => n(), mwBarber = (q, r, n) => n();
  const row = { id: 'a1', salon_id: 'S', barber_id: 'b1', status: 'confirmed', client_name: 'Tom', email: null, phone: null, scheduled_at: '2026-10-20 14:10:00', service_name: 'Coupe', service_duration_min: 30, extras_duration_min: 0, queue_status: null };
  const fq = (sql) => {
    sql = sql.replace(/\s+/g, ' ');
    if (/FROM client_notes/.test(sql)) return [[]];
    if (/WHERE a.salon_id = \? AND \(a.id = \? OR a.promoted_queue_id = \?\)/.test(sql)) return [[row]];
    if (/FROM appointments a JOIN services s ON s.id = a.service_id WHERE a.id = \? AND a.salon_id = \?/.test(sql)) return [[Object.assign({ duration_min: 30, cancel_token: 't' }, row)]];
    throw new Error('SQL non prevu ' + sql.slice(0, 80));
  };
  const real = Module._load;
  Module._load = function (request) {
    if (request === 'express') return fx;
    if (/(^|\/)db$/.test(request)) return { pool: { query: async (s, p) => fq(s, p) }, utcIso: (x) => x, getSettings: async () => ({ timezone: 'Europe/Paris' }) };
    if (/middleware\/auth$/.test(request)) return mwAdmin;
    if (/middleware\/barberAuth$/.test(request)) return mwBarber;
    if (/lib\/mailer$/.test(request)) return new Proxy({}, { get: () => async () => {} });
    if (/lib\/activityLog$/.test(request)) return { logActivity() {} };
    return real.apply(this, arguments);
  };
  require('../../src/routes/appointments');
  Module._load = real;
  const call = (key, req) => new Promise((resolve, reject) => {
    const fns = handlers[key]; const res = { statusCode: 200, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; resolve(this); } };
    let i = 0; const next = (er) => { if (er) return reject(er); const f = fns[i++]; if (f) Promise.resolve(f(Object.assign({ body: {}, query: {}, salon: { id: 'S' } }, req), res, next)).catch(reject); }; next();
  });
  check('routes historique + fidelite ouvertes au coiffeur', /router\.get\('\/:id\/client-history', requireAdminOrBarber/.test(fs.readFileSync(__dirname + '/../../src/routes/queue.js', 'utf8')) && /router\.get\('\/client-history-by-contact', requireAdminOrBarber/.test(fs.readFileSync(__dirname + '/../../src/routes/queue.js', 'utf8')) && /router\.get\('\/client-marketing', requireAdminOrBarber/.test(fs.readFileSync(__dirname + '/../../src/routes/owner.js', 'utf8')));
  check('/reschedule : ouvert au coiffeur (plus reserve a l\'admin)', handlers['put /:id/reschedule'][0] === mwBarber);
  let r = await call('put /:id/reschedule', { params: { id: 'a1' }, body: { date: '2026-10-21', time: '10:00' }, actingBarberId: 'b2' });
  check('/reschedule : un coiffeur ne deplace pas le RDV d\'un autre (403)', r.statusCode === 403 && /pas le RDV/.test(r.body.error), r.body);
  r = await call('get /lookup', { query: { queue_id: 'q1' } });
  check('/lookup : renvoie le RDV (statut affiche, duree)', r.body.item && r.body.item.id === 'a1' && r.body.item.display_status === 'confirmed' && r.body.item.duration_min === 30, r.body);
  r = await call('get /lookup', { query: {} });
  check('/lookup sans id : 400', r.statusCode === 400);
  console.log('\nRESULTAT : ' + pass + ' verifications reussies, ' + fail + ' echec(s)');
  process.exit(fail ? 1 : 0);
})();
