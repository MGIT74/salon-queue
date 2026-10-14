// Audit securite : liens d'email (base_url), echappement HTML des emails, export CSV, double reservation,
// limite de reservations publiques, jeton d'annulation, sessions client apres reinitialisation.
const fs = require('fs'), Module = require('module');
let pass = 0, fail = 0;
const check = (n, ok, extra) => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n + (ok || extra === undefined ? '' : '  -> ' + JSON.stringify(extra))); };
const read = (p) => fs.readFileSync(__dirname + '/../../' + p, 'utf8');

(async () => {
  // 1) base_url : jamais un domaine etranger dans un lien d'email
  delete process.env.PUBLIC_HOSTS;
  const { safeBaseUrl } = require('../../src/lib/safeUrl');
  const req = (host, xfh) => ({ get: (k) => ({ host, 'x-forwarded-host': xfh })[k.toLowerCase()] });
  const prod = req('app.thebarberone.com');
  check('base_url legitime conserve tel quel', safeBaseUrl(prod, 'https://app.thebarberone.com/rdv.html?salon=oyo') === 'https://app.thebarberone.com/rdv.html?salon=oyo');
  check('base_url pirate -> domaine officiel (jeton jamais envoye ailleurs)', safeBaseUrl(prod, 'https://evil.example/reset-password.html') === 'https://app.thebarberone.com/reset-password.html');
  check('//evil et javascript: neutralises', safeBaseUrl(prod, '//evil.example/x') === 'https://app.thebarberone.com/x' && safeBaseUrl(prod, 'javascript:alert(1)') === 'https://app.thebarberone.com');
  check('serveur test : repli sur le domaine de test', safeBaseUrl(req('127.0.0.1:3000', 'rdv.handsgraphic.com'), 'https://evil.example/a') === 'https://rdv.handsgraphic.com/a');
  check('guillemets/chevrons du chemin encodes (pas de sortie d\'attribut href)', !/["<>]/.test(safeBaseUrl(prod, 'https://app.thebarberone.com/a"><b>?x="<')));
  const routes = ['src/routes/appointments.js', 'src/routes/signup.js', 'src/routes/clientAuth.js', 'src/routes/salons.js'].map(read).join('\n');
  check('aucune route n\'utilise encore base_url brut', !/String\(req\.body\.base_url/.test(routes) && !/appendParam\(req\.body\.base_url/.test(routes));

  // 2) emails : valeurs echappees en HTML
  const sent = [];
  const real = Module._load;
  Module._load = function (r) {
    if (r === 'nodemailer') return { createTransport: () => ({ sendMail: async (m) => sent.push(m) }) };
    if (/\.\.\/db$/.test(r)) return { getSettings: async () => ({ smtp_host: 'x', salon_name: 'Salon', email_tpl_reminder_body: 'Coucou {{client_name}}' }) };
    return real.apply(this, arguments);
  };
  const mailer = require('../../src/lib/mailer');
  Module._load = real;
  const evil = '<a href="https://evil.example">Cliquez ici</a>';
  await mailer.sendAppointmentConfirmation('s', 'v@x.fr', { clientName: evil, when: 'lundi', serviceName: 'Coupe', cancelUrl: 'https://app.thebarberone.com/rdv.html?cancel=1' });
  await mailer.sendAppointmentReminder('s', 'v@x.fr', { clientName: evil, when: 'lundi', serviceName: 'Coupe' });
  await mailer.sendCustomClientEmail('s', 'v@x.fr', evil, 'Sujet', 'ligne1\n<script>x</script>');
  check('email de confirmation : nom du client echappe', !sent[0].html.includes('<a href="https://evil') && sent[0].html.includes('&lt;a href='));
  check('email avec modele personnalise : jetons echappes', !sent[1].html.includes('<a href="https://evil') && /Coucou &lt;a/.test(sent[1].html));
  check('email libre : message echappe, retours a la ligne conserves', !sent[2].html.includes('<script>') && sent[2].html.includes('ligne1<br>&lt;script'));
  check('version texte inchangee', sent[0].text.includes(evil));

  // 3) export CSV : pas de formule active
  const dash = read('public/dashboard.html');
  const csvCell = new Function(dash.slice(dash.indexOf('function csvCell'), dash.indexOf('function exportRdvCsv')) + '; return csvCell;')();
  check('CSV : =HYPERLINK neutralise', csvCell('=HYPERLINK("http://x")').startsWith('"\'='));
  check('CSV : telephone +33 intact', csvCell('+33 6 12 34 56 78') === '"+33 6 12 34 56 78"');
  check('CSV : les deux exports utilisent csvCell', (dash.match(/vals\.map\(csvCell\)/g) || []).length === 2);

  // 4) verrou de reservation : deux reservations simultanees passent l'une apres l'autre
  let held = false, maxConcurrent = 0, inside = 0;
  Module._load = function (r) {
    if (/\.\.\/db$/.test(r)) return { pool: { getConnection: async () => ({
      query: async (sql) => { if (/GET_LOCK/.test(sql)) { if (held) return [[{ ok: 0 }]]; held = true; return [[{ ok: 1 }]]; } if (/RELEASE_LOCK/.test(sql)) held = false; return [[{}]]; },
      release() {} }) } };
    return real.apply(this, arguments);
  };
  const { withBookingLock } = require('../../src/lib/bookingLock');
  Module._load = real;
  const h = withBookingLock(async (rq, rs) => { inside++; maxConcurrent = Math.max(maxConcurrent, inside); await new Promise((r) => setTimeout(r, 150)); inside--; rs.ok = true; });
  const mk = () => ({ ok: false, status() { return this; }, json() { return this; } });
  const r1 = mk(), r2 = mk();
  await Promise.all([h({ salon: { id: 'S' } }, r1), h({ salon: { id: 'S' } }, r2)]);
  check('double reservation : jamais deux verifications+insertions en meme temps', maxConcurrent === 1 && r1.ok && r2.ok, maxConcurrent);
  const appts = read('src/routes/appointments.js');
  check('verrou pose sur creation publique, groupe, creation salon et deplacement',
    /router\.post\('\/', bookingRateLimiter, wrap\(withBookingLock/.test(appts) && /router\.post\('\/group', bookingRateLimiter, wrap\(withBookingLock/.test(appts) &&
    /router\.post\('\/admin-create', requireAdminOrBarber, wrap\(withBookingLock/.test(appts) && /router\.put\('\/:id\/reschedule', requireAdminOrBarber, wrap\(withBookingLock/.test(appts));
  check('reservation publique limitee (30/h par IP)', /signupRateLimiter\('rdv-booking', \{ max: 30/.test(appts));
  check('jeton d\'annulation du client jamais renvoye au salon', /cancel_token: undefined/.test(appts));
  check('reinitialisation du mot de passe client : sessions fermees', /DELETE FROM client_sessions WHERE client_id = \?/.test(read('src/routes/clientAuth.js')));
  check('actualisation discrete suspendue hors ligne', /navigator\.onLine === false/.test(read('public/autorefresh.js')));

  console.log('\nRESULTAT : ' + pass + ' verifications reussies, ' + fail + ' echec(s)');
  process.exit(fail ? 1 : 0);
})();
