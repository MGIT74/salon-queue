// Email « Votre cadeau » : en plus du salon (accueil / borne), il explique la réservation EN LIGNE : compte client ouvert
// avec cet email -> « Mes cadeaux », ou le code saisi pendant la réservation en ligne, avec un bouton vers le compte.
const fs = require('fs'), path = require('path');
const nodemailer = require('nodemailer');
const sent = [];
nodemailer.createTransport = () => ({ sendMail: async (m) => { sent.push(m); return {}; } });
process.env.DB_HOST = process.env.DB_HOST || '127.0.0.1'; process.env.DB_USER = process.env.DB_USER || 'sq';
process.env.DB_PASSWORD = process.env.DB_PASSWORD || 'sqpass'; process.env.DB_NAME = process.env.DB_NAME || 'salonq';
process.env.SETTINGS_ENCRYPTION_KEY = process.env.SETTINGS_ENCRYPTION_KEY || 'testkeytestkeytestkeytestkey123456';
const { pool, setSettings } = require('../../src/db');
const mailer = require('../../src/lib/mailer');
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n + (x ? '  [' + JSON.stringify(x).slice(0, 220) + ']' : '')); };
const KEYS = ['smtp_host', 'salon_name'];
(async () => {
  const [old] = await pool.query('SELECT `key`, value FROM settings WHERE salon_id = ? AND `key` IN (?)', ['s1', KEYS]);
  try {
    await setSettings('s1', { smtp_host: 'smtp.exemple.test', salon_name: 'TBO OYONNAX' });
    mailer.invalidateTransport('s1');
    const url = 'https://app.exemple.test/compte.html?salon=tbo';
    await mailer.sendGiftConfirmation('s1', 'eric@test.fr', { recipientName: 'eric', amountEur: '20,00 €', items: [{ quantity: 1, item_name: 'Coupe' }], code: 'BQF4R9MT', accountUrl: url });
    const m = sent[0] || {};
    check('code toujours présent', m.html.includes('BQF4R9MT') && m.text.includes('BQF4R9MT'));
    check('en ligne : compte client avec cet email -> « Mes cadeaux »', m.html.includes('compte client') && m.html.includes('« Mes cadeaux »') && m.text.includes('« Mes cadeaux »'));
    check('en ligne : code saisi pendant la réservation en ligne', m.html.includes('lors de votre réservation en ligne') && m.text.includes('lors de votre réservation en ligne'));
    check('bouton « Réserver en ligne avec mon cadeau » vers le compte du salon', m.html.includes('href="' + url + '"') && m.html.includes('Réserver en ligne avec mon cadeau') && m.text.includes(url));
    check('au salon : accueil ou borne (conservé)', m.html.includes('accueil') && m.html.includes('borne'));
    sent.length = 0;
    await mailer.sendGiftConfirmation('s1', 'eric@test.fr', { recipientName: 'eric', amountEur: '20,00 €', items: [{ quantity: 1, item_name: 'Coupe' }], code: 'BQF4R9MT' });
    check('sans lien connu : pas de bouton vide', !sent[0].html.includes('<a href=""') && !sent[0].html.includes('Réserver en ligne avec mon cadeau'));
  } finally {
    await pool.query('DELETE FROM settings WHERE salon_id = ? AND `key` IN (?)', ['s1', KEYS]);
    if (old.length) await pool.query('INSERT INTO settings (salon_id, `key`, value, updated_at) VALUES ' + old.map(() => '(?, ?, ?, NOW())').join(', '), old.flatMap((r) => ['s1', r.key, r.value]));
  }
  const sales = fs.readFileSync(path.join(__dirname, '../../src/routes/sales.js'), 'utf8');
  const owner = fs.readFileSync(path.join(__dirname, '../../src/routes/owner.js'), 'utf8');
  const link = "accountUrl: 'https://' + req.get('host') + '/compte.html?salon=' + encodeURIComponent(req.salon.slug || '')";
  check('vente en caisse : lien du compte transmis', sales.includes(link));
  check('renvoi du cadeau (admin) : lien du compte transmis', owner.includes(link));
  await pool.end();
  console.log(`\n${pass} OK, ${fail} ECHEC`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
