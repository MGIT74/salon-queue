// Fidelite : carte activee automatiquement a la PREMIERE reservation en ligne (plus besoin de la caisse).
const fs = require('fs'), path = require('path'), Module = require('module');
let pass = 0, fail = 0;
const check = (n, ok) => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n); };
const appt = fs.readFileSync(path.join(__dirname, '../../src/routes/appointments.js'), 'utf8');

// Reservation en ligne (route publique) = appelle l'activation ; reservation manuelle (admin-create) = non.
const pub = appt.slice(appt.indexOf("gift_card_id)\n     VALUES"), appt.indexOf("router.post('/admin-create'"));
check('reservation en ligne : activation appelee apres l\'enregistrement du RDV', /activateOnFirstOnlineBooking\(req\.salon\.id, \{ client_name, email, phone \}\)/.test(pub));
check('une erreur d\'activation n\'empeche jamais la reservation (try/catch)', /try \{\s*await activateOnFirstOnlineBooking[\s\S]{0,200}catch/.test(pub));
check('RDV cree a la main par l\'admin : pas d\'activation automatique', !/activateOnFirstOnlineBooking/.test(appt.slice(appt.indexOf("router.post('/admin-create'"))));

// Comportement reel du module, avec une base simulee.
const state = { accounts: [], mails: [], dupNext: false };
const fakePool = { query: async (sql, p) => {
  if (/FROM loyalty_accounts/.test(sql)) return [state.accounts.filter((a) => a.salon_id === p[0] && a.client_key === p[1])];
  if (/FROM salons/.test(sql)) return [[{ owner_id: 'o1' }]];
  if (/INSERT INTO loyalty_accounts/.test(sql)) {
    if (state.dupNext) { const e = new Error('dup'); e.code = 'ER_DUP_ENTRY'; throw e; }
    state.accounts.push({ salon_id: p[1], client_key: p[2], client_name: p[3], email: p[4], activated: true }); return [{}];
  }
  return [[]];
} };
const fakes = {
  '../db': { pool: fakePool, getOwnerSettings: async () => ({ loyalty_threshold: 8 }) },
  './queueMath': { clientKey: (r) => (r.email || r.phone || r.client_name || '').toLowerCase() || null },
  './mailer': { sendLoyaltyActivation: async (salon, to, info) => { state.mails.push({ to, threshold: info.threshold }); } },
  './activityLog': { logActivity: () => {} }
};
const origLoad = Module._load;
Module._load = function (req, parent, ...rest) { if (parent && /lib[\\/]loyalty\.js$/.test(parent.filename) && fakes[req]) return fakes[req]; return origLoad.call(this, req, parent, ...rest); };
const { activateOnFirstOnlineBooking } = require('../../src/lib/loyalty');
Module._load = origLoad;

(async () => {
  const c = { client_name: 'Karim', email: 'karim@ex.fr', phone: '0600000000' };
  check('premiere reservation : carte creee et activee', (await activateOnFirstOnlineBooking('s1', c)) === true && state.accounts.length === 1 && state.accounts[0].activated);
  check('email d\'activation envoye avec le seuil du salon', state.mails.length === 1 && state.mails[0].to === 'karim@ex.fr' && state.mails[0].threshold === 8);
  check('2e reservation du meme client : rien de nouveau (pas de doublon, pas de 2e email)', (await activateOnFirstOnlineBooking('s1', c)) === false && state.accounts.length === 1 && state.mails.length === 1);
  check('carte deja desactivee par l\'admin : pas reactivee de force', (await (async () => { state.accounts.push({ salon_id: 's1', client_key: 'old@ex.fr', activated: false }); return activateOnFirstOnlineBooking('s1', { client_name: 'Old', email: 'old@ex.fr' }); })()) === false);
  check('sans email : rien', (await activateOnFirstOnlineBooking('s1', { client_name: 'X', email: '' })) === false);
  state.dupNext = true;
  check('deux reservations simultanees : la seconde est ignoree proprement', (await activateOnFirstOnlineBooking('s1', { client_name: 'Zed', email: 'z@ex.fr' })) === false);
  console.log('\n' + pass + ' OK, ' + fail + ' ECHEC'); process.exit(fail ? 1 : 0);
})();
