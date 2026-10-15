// Réglages > « Envoyer les emails et SMS aux clients » : pause pendant l'import des RDV d'un autre logiciel.
// Vérifié avec un vrai (faux) serveur SMTP local : en pause, rien ne part vers les clients pour les RDV ; restent
// envoyés les emails demandés par le client lui-même, ceux faits au salon (cadeau, fidélité) et les tests de l'admin.
const net = require('net');
const fs = require('fs');
let pass = 0, fail = 0;
const check = (n, ok, extra) => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n + (ok || extra === undefined ? '' : '  -> ' + JSON.stringify(extra))); };

// Faux serveur SMTP : compte les messages reçus (destinataire).
const received = [];
const smtp = net.createServer((sock) => {
  let data = false, rcpt = '';
  sock.write('220 test ESMTP\r\n');
  let buf = '';
  sock.on('data', (chunk) => {
    buf += chunk.toString();
    let i;
    while ((i = buf.indexOf('\r\n')) !== -1) {
      const line = buf.slice(0, i); buf = buf.slice(i + 2);
      if (data) { if (line === '.') { data = false; received.push(rcpt); sock.write('250 OK\r\n'); } continue; }
      const cmd = line.slice(0, 4).toUpperCase();
      if (cmd === 'EHLO' || cmd === 'HELO') sock.write('250 test\r\n');
      else if (cmd === 'MAIL') sock.write('250 OK\r\n');
      else if (cmd === 'RCPT') { rcpt = (line.match(/<([^>]+)>/) || [])[1] || ''; sock.write('250 OK\r\n'); }
      else if (cmd === 'DATA') { data = true; sock.write('354 go\r\n'); }
      else if (cmd === 'QUIT') { sock.write('221 bye\r\n'); sock.end(); }
      else sock.write('250 OK\r\n');
    }
  });
});

const settings = {};
const dbPath = require.resolve('../../src/db');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { getSettings: async (id) => Object.assign({}, settings[id]) } };
const mailer = require('../../src/lib/mailer');

(async () => {
  await new Promise((r) => smtp.listen(0, '127.0.0.1', r));
  const port = smtp.address().port;
  const base = { smtp_host: '127.0.0.1', smtp_port: String(port), smtp_from: 'salon@test.local', salon_name: 'Salon T' };
  settings.on = Object.assign({}, base, { client_emails_paused: '0' });
  settings.off = Object.assign({}, base, { client_emails_paused: '1' });
  const info = { clientName: 'Karim', when: 'demain', serviceName: 'Coupe', barberName: 'Alice', cancelUrl: 'https://x/rdv', reason: 'x', startDate: '2026-10-20', endDate: '2026-10-20' };
  const n = () => received.length;

  let before = n();
  await mailer.sendAppointmentConfirmation('off', 'a@client.test', info);
  await mailer.sendAppointmentReminder('off', 'b@client.test', info);
  await mailer.sendAppointmentCancelledByAdmin('off', 'c@client.test', info);
  await mailer.sendAppointmentRescheduled('off', 'd@client.test', info);
  await mailer.sendSalonClosureNotice('off', 'e@client.test', info);
  await mailer.sendTurnSoon('off', 'f@client.test', 'Karim', 10);
  await mailer.sendCustomClientEmail('off', 'g@client.test', 'Karim', 'Promo', 'Bonjour');
  check('en pause : confirmation, rappel, annulation, report, fermeture, « bientôt votre tour », envoi groupé -> AUCUN email (sans erreur)', n() === before, received.slice(before));

  before = n();
  await mailer.sendClientPasswordReset('off', 'reset@client.test', 'https://x/reset');
  await mailer.sendClientVerificationEmail('off', 'verify@client.test', 'https://x/verify');
  check('en pause : mot de passe oublié et vérification d\'email (demandés par le client) partent quand même', n() === before + 2 && received.includes('reset@client.test') && received.includes('verify@client.test'));
  before = n();
  await mailer.sendGiftConfirmation('off', 'gift@client.test', { recipientName: 'K', code: 'ABC', amountCents: 1000, items: [], buyerName: 'X', expiresAt: null });
  await mailer.sendLoyaltyActivation('off', 'loyal@client.test', { clientName: 'K', serviceThreshold: 10, productThreshold: 15 });
  check('en pause : carte cadeau et activation fidélité (faites au salon) partent quand même', n() === before + 2, received.slice(before));
  before = n();
  await mailer.sendTest('off', 'admin@salon.test');
  await mailer.forceSend(() => mailer.sendAppointmentReminder('off', 'admin2@salon.test', info));
  check('en pause : les tests de l\'admin (SMTP, aperçu des modèles) partent quand même', n() === before + 2);

  before = n();
  await mailer.sendAppointmentConfirmation('on', 'h@client.test', info);
  await mailer.sendAppointmentReminder('on', 'i@client.test', info);
  check('envoi réactivé : confirmation et rappel partent normalement', n() === before + 2 && received.includes('h@client.test'));

  const read = (f) => fs.readFileSync(__dirname + '/../../' + f, 'utf8');
  const notify = read('src/cron/notify.js');
  check('rappels email automatiques : rien n\'est envoyé NI marqué comme envoyé pendant la pause (reprise normale ensuite)', (notify.match(/client_emails_paused\) === '1'\) return/g) || []).length === 2);
  const auto = read('src/routes/automation.js');
  check('rappels SMS et envois groupés automatiques : bloqués pendant la pause', /client_emails_paused\) === '1'\) \{ skipped\.paused_salons/.test(auto) && /send-client-email[\s\S]{0,1800}client_emails_paused\) === '1'/.test(auto));
  check('réglage enregistré en \'0\' / \'1\'', /'client_emails_paused',/.test(read('src/routes/settings.js')) && /patch\.client_emails_paused = \(/.test(read('src/routes/settings.js')));
  const dash = read('public/dashboard.html');
  check('Réglages : interrupteur visible « Envoyer les emails et SMS aux clients », confirmation avant la pause, bandeau « en pause »', /id="client-msg-switch"/.test(dash) && /function toggleClientMessages[\s\S]{0,600}showConfirm/.test(dash) && /id="client-msg-paused"/.test(dash));

  smtp.close();
  console.log('\nRESULTAT : ' + pass + ' verifications reussies, ' + fail + ' echec(s)');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
