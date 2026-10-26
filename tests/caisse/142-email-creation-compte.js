// Reglages > Notifications email : l'email de creation de compte client est modifiable (sujet + message, jetons
// {{salon}} et {{verify_url}}). Le lien d'activation est toujours present. Sans modele : texte d'origine inchange.
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
const KEYS = ['smtp_host', 'salon_name', 'email_tpl_signup_subject', 'email_tpl_signup_body'];
(async () => {
  const [old] = await pool.query('SELECT `key`, value FROM settings WHERE salon_id = ? AND `key` IN (?)', ['s1', KEYS]);
  try {
    await setSettings('s1', { smtp_host: 'smtp.exemple.test', salon_name: 'TBO Test', email_tpl_signup_subject: '', email_tpl_signup_body: '' });
    mailer.invalidateTransport('s1');
    await mailer.sendClientVerificationEmail('s1', 'a@b.c', 'https://x.test/v?t=1');
    check('sans modele : texte d\'origine', sent[0].subject === 'Confirmez votre adresse email — TBO Test' && /Bienvenue ! Cliquez sur ce lien/.test(sent[0].text) && sent[0].text.includes('https://x.test/v?t=1'), sent[0].subject);

    await setSettings('s1', { email_tpl_signup_subject: 'Bienvenue chez The Barber One', email_tpl_signup_body: 'Bonjour,\nActivez votre compte : {{verify_url}}\n\nThe Barber One' });
    await mailer.sendClientVerificationEmail('s1', 'a@b.c', 'https://x.test/v?t=2');
    const m = sent[1];
    check('modele : sujet personnalise (plus de nom du salon impose)', m.subject === 'Bienvenue chez The Barber One', m.subject);
    check('modele : message personnalise, lien remplace', m.text === 'Bonjour,\nActivez votre compte : https://x.test/v?t=2\n\nThe Barber One', m.text);
    check('modele : lien cliquable dans la version HTML', m.html.includes('<a href="https://x.test/v?t=2">https://x.test/v?t=2</a>') && m.html.includes('<br>'), m.html);

    await setSettings('s1', { email_tpl_signup_body: 'Bienvenue chez {{salon}} !' });
    await mailer.sendClientVerificationEmail('s1', 'a@b.c', 'https://x.test/v?t=3');
    check('lien retire du modele : ajoute quand meme (le compte doit pouvoir s\'activer)', sent[2].text.includes('https://x.test/v?t=3') && sent[2].text.startsWith('Bienvenue chez TBO Test !'), sent[2].text);

    await mailer.sendClientVerificationEmail('s1', 'a@b.c', 'https://x.test/v?t=4', { change: true });
    check('changement d\'adresse email : message inchange (pas ce modele)', /Confirmez votre nouvelle adresse email/.test(sent[3].text), sent[3].text);
  } finally {
    await pool.query('DELETE FROM settings WHERE salon_id = ? AND `key` IN (?)', ['s1', KEYS]);
    if (old.length) await pool.query('INSERT INTO settings (salon_id, `key`, value, updated_at) VALUES ' + old.map(() => '(?, ?, ?, NOW())').join(', '), old.flatMap((r) => ['s1', r.key, r.value]));
  }
  const d = fs.readFileSync(path.join(__dirname, '../../public/dashboard.html'), 'utf8');
  const st = fs.readFileSync(path.join(__dirname, '../../src/routes/settings.js'), 'utf8');
  check('reglages : bloc « Création de compte client » avec ses jetons', d.includes('id="tpl-signup-body"') && d.includes('Jetons disponibles : {{salon}}, {{verify_url}}'));
  check('reglages : dans la liste des modeles (enregistrer, retablir, tester)', d.includes("'turn-soon', 'signup', 'closure'") && d.includes("signup: 'Création de compte client'") && st.includes("'email_tpl_signup_subject', 'email_tpl_signup_body'") && st.includes('signup: () => sendClientVerificationEmail('));
  check('reglages : refus d\'enregistrer sans {{verify_url}}', d.includes("gardez {{verify_url}} dans le message"));
  await pool.end();
  console.log(`\n${pass} OK, ${fail} ECHEC`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
