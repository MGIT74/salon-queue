// Fidelite : carte activee automatiquement a la CREATION du compte client en ligne (plus besoin de la caisse).
const fs = require('fs'), path = require('path'), Module = require('module');
let pass = 0, fail = 0;
const check = (n, ok) => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n); };
const auth = fs.readFileSync(path.join(__dirname, '../../src/routes/clientAuth.js'), 'utf8');
const appt = fs.readFileSync(path.join(__dirname, '../../src/routes/appointments.js'), 'utf8');

const signup = auth.slice(auth.indexOf("router.post('/signup'"), auth.indexOf("router.post('/verify-email'"));
check('creation du compte client : activation appelee', /activateOnAccountCreation\(salonId, \{ client_name: name, email, phone \}\)/.test(signup));
check('une erreur d\'activation n\'empeche jamais l\'inscription (try/catch)', /try \{\s*await activateOnAccountCreation[\s\S]{0,200}catch/.test(signup));
check('activation faite APRES la creation du compte', signup.indexOf('INSERT INTO clients') < signup.indexOf('activateOnAccountCreation('));
check('reservation en ligne : plus d\'activation (c\'est a la creation du compte)', !/loyalty/i.test(appt));

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
const { activateOnAccountCreation } = require('../../src/lib/loyalty');
Module._load = origLoad;

(async () => {
  const c = { client_name: 'Karim', email: 'karim@ex.fr', phone: '0600000000' };
  check('creation du compte : carte creee et activee', (await activateOnAccountCreation('s1', c)) === true && state.accounts.length === 1 && state.accounts[0].activated);
  check('email d\'activation envoye avec le seuil du salon', state.mails.length === 1 && state.mails[0].to === 'karim@ex.fr' && state.mails[0].threshold === 8);
  check('meme client deja avec carte : rien de nouveau (pas de doublon, pas de 2e email)', (await activateOnAccountCreation('s1', c)) === false && state.accounts.length === 1 && state.mails.length === 1);
  check('carte deja desactivee par l\'admin : pas reactivee de force', (await (async () => { state.accounts.push({ salon_id: 's1', client_key: 'old@ex.fr', activated: false }); return activateOnAccountCreation('s1', { client_name: 'Old', email: 'old@ex.fr' }); })()) === false);
  check('sans email : rien', (await activateOnAccountCreation('s1', { client_name: 'X', email: '' })) === false);
  state.dupNext = true;
  check('deux inscriptions simultanees : la seconde est ignoree proprement', (await activateOnAccountCreation('s1', { client_name: 'Zed', email: 'z@ex.fr' })) === false);
  console.log('\n' + pass + ' OK, ' + fail + ' ECHEC'); process.exit(fail ? 1 : 0);
})();
