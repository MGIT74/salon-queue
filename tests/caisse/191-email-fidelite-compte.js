// Email d'activation de la carte de fidélité : explique que la carte est liée à l'email, renvoie vers le compte client
// (« Voir ma carte » s'il a déjà un compte, « Créer mon compte » sinon, email pré-rempli), et comment les récompenses
// s'utilisent. Les paliers sont relus sur la carte au moment de l'envoi (un palier ajouté par l'admin y figure).
const fs = require('fs'), path = require('path');
const nodemailer = require('nodemailer');
const sent = [];
nodemailer.createTransport = () => ({ sendMail: async (m) => { sent.push(m); return {}; } });
process.env.DB_HOST = process.env.DB_HOST || '127.0.0.1'; process.env.DB_USER = process.env.DB_USER || 'sq';
process.env.DB_PASSWORD = process.env.DB_PASSWORD || 'sqpass'; process.env.DB_NAME = process.env.DB_NAME || 'salonq';
process.env.SETTINGS_ENCRYPTION_KEY = process.env.SETTINGS_ENCRYPTION_KEY || 'testkeytestkeytestkeytestkey123456';
const { pool, setSettings } = require('../../src/db');
const mailer = require('../../src/lib/mailer');
const { compteLink } = require('../../src/lib/safeUrl');
const LC = require('../../src/lib/loyaltyCards');
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n + (x ? '  [' + JSON.stringify(x).slice(0, 240) + ']' : '')); };
const KEYS = ['smtp_host', 'salon_name'];
(async () => {
  console.log('\n[A] Lien vers le compte (domaine officiel, jamais un Host forgé)');
  const fakeReq = (host) => ({ salon: { slug: 'tbo' }, get: (k) => (k === 'host' ? host : '') });
  check('domaine de l\'app conservé', compteLink(fakeReq('app.thebarberone.com')) === 'https://app.thebarberone.com/compte.html?salon=tbo');
  check('Host forgé -> domaine officiel', compteLink(fakeReq('pirate.example')).startsWith('https://app.thebarberone.com/'));
  check('inscription + email pré-rempli', compteLink(fakeReq('app.thebarberone.com'), { signup: true, email: 'eric@test.fr' }) === 'https://app.thebarberone.com/compte.html?salon=tbo&signup=1&email=eric%40test.fr');

  console.log('\n[B] Email');
  const [old] = await pool.query('SELECT `key`, value FROM settings WHERE salon_id = ? AND `key` IN (?)', ['s1', KEYS]);
  try {
    await setSettings('s1', { smtp_host: 'smtp.exemple.test', salon_name: 'TBO OYONNAX' });
    mailer.invalidateTransport('s1');
    const card = { name: 'Carte Coupe', scope_all: true, tiers: [{ points: 10, label: '-50 % sur une coupe' }] };
    const urlNew = 'https://app.exemple.test/compte.html?salon=tbo&signup=1&email=eric%40test.fr';
    await mailer.sendLoyaltyActivation('s1', 'eric@test.fr', { clientName: 'Eric', cards: [{ name: card.name, rule: LC.ruleText(card) }], hasAccount: false, accountUrl: urlNew });
    let m = sent[0];
    check('intro et règle conservées', m.html.includes('Votre Carte Coupe chez TBO OYONNAX vient d') && m.html.includes('10 points : -50 % sur une coupe'));
    check('carte liée à CET email', m.html.includes('Votre carte est liée à cette adresse email (eric@test.fr)') && m.text.includes('eric@test.fr'));
    check('sans compte : invite à créer le compte avec cette adresse', m.html.includes('Créez votre compte client avec cette même adresse email'));
    check('sans compte : bouton « Créer mon compte » -> inscription', m.html.includes('href="' + urlNew.replace(/&/g, '&amp;') + '"') && m.html.includes('>Créer mon compte</a>') && m.text.includes(urlNew));
    check('récompenses : proposées à l\'encaissement au salon', m.html.includes('proposée à l\'encaissement au salon') || m.html.includes('proposée à l&#39;encaissement au salon'));
    sent.length = 0;
    const card2 = { name: 'Carte Coupe', scope_all: true, tiers: [{ points: 10, label: '-50 % sur une coupe' }, { points: 20, label: 'Coupe offerte' }] };
    await mailer.sendLoyaltyActivation('s1', 'eric@test.fr', { clientName: 'Eric', cards: [{ name: card2.name, rule: LC.ruleText(card2) }], hasAccount: true, accountUrl: 'https://x.test/compte.html?salon=tbo' });
    m = sent[0];
    check('avec compte : bouton « Voir ma carte de fidélité »', m.html.includes('>Voir ma carte de fidélité</a>') && !m.html.includes('Créer mon compte'));
    check('palier ajouté par l\'admin : présent dans l\'email', m.html.includes('20 points : Coupe offerte'));
    sent.length = 0;
    await mailer.sendLoyaltyActivation('s1', 'eric@test.fr', { clientName: 'Eric', cards: [{ name: 'A', rule: 'r1' }, { name: 'B', rule: 'r2' }], hasAccount: true, accountUrl: 'https://x.test/c' });
    check('plusieurs cartes : « Vos cartes sont liées » / « Voir mes cartes »', sent[0].html.includes('Vos cartes sont liées') && sent[0].html.includes('Voir mes cartes de fidélité'));
    sent.length = 0;
    await mailer.sendLoyaltyActivation('s1', 'eric@test.fr', { clientName: 'Eric', cards: [{ name: 'A', rule: 'r1' }] });
    check('sans lien : pas de bouton vide', !sent[0].html.includes('<a href'));
  } finally {
    await pool.query('DELETE FROM settings WHERE salon_id = ? AND `key` IN (?)', ['s1', KEYS]);
    if (old.length) await pool.query('INSERT INTO settings (salon_id, `key`, value, updated_at) VALUES ' + old.map(() => '(?, ?, ?, NOW())').join(', '), old.flatMap((r) => ['s1', r.key, r.value]));
  }

  console.log('\n[C] Branchements');
  const owner = fs.readFileSync(path.join(__dirname, '../../src/routes/owner.js'), 'utf8');
  const loy = fs.readFileSync(path.join(__dirname, '../../src/lib/loyalty.js'), 'utf8');
  const ca = fs.readFileSync(path.join(__dirname, '../../src/routes/clientAuth.js'), 'utf8');
  const compte = fs.readFileSync(path.join(__dirname, '../../public/compte.html'), 'utf8');
  check('caisse : compte existant détecté par l\'email -> connexion, sinon inscription', owner.includes("SELECT id FROM clients WHERE salon_id = ? AND LOWER(TRIM(email)) = ?") && owner.includes('hasAccount: Boolean(acct), accountUrl: compteLink(req, { signup: !acct, email })'));
  check('création du compte : « Voir ma carte »', loy.includes('hasAccount: true, accountUrl') && ca.includes('accountUrl: compteLink(req, { email })'));
  check('paliers relus sur la carte à l\'envoi', owner.includes('rule: LC.ruleText(c)') && loy.includes('rule: LC.ruleText(c)'));
  check('compte : email pré-rempli (connexion + inscription) puis retiré de l\'adresse', compte.includes("document.getElementById('su-email').value = mailParam") && compte.includes("params.delete('email')"));
  await pool.end();
  console.log(`\n${pass} OK, ${fail} ECHEC`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
