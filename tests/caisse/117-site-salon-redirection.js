// Reglages > General : lien du site du salon. Apres une prise de RDV en ligne (rdv.html), le client y est renvoye
// apres un compte a rebours. Jamais en mode salon (equipe), ni ailleurs (compte, borne). Lien http(s) uniquement.
const fs = require('fs'), path = require('path');
const BASE = 'http://127.0.0.1:3999';
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n + (x ? '  [' + (typeof x === 'string' ? x : JSON.stringify(x)).slice(0, 160) + ']' : '')); };
const ADMIN = { 'Content-Type': 'application/json', 'X-Salon-Slug': 'test', 'X-Admin-Password': 'adminpw' };
const PUB = { 'Content-Type': 'application/json', 'X-Salon-Slug': 'test' };
const call = async (m, u, h, b) => { const r = await fetch(BASE + u, { method: m, headers: h, body: b ? JSON.stringify(b) : undefined }); let j = null; try { j = await r.json(); } catch (e) {} return { status: r.status, body: j }; };
const rd = (f) => fs.readFileSync(path.join(__dirname, '../../public', f), 'utf8');

(async () => {
  console.log('\n[A] Reglage');
  let r = await call('PUT', '/api/settings', ADMIN, { salon_website_url: 'javascript:alert(1)' });
  check('lien dangereux refuse', r.status === 400, r.body);
  r = await call('PUT', '/api/settings', ADMIN, { salon_website_url: 'monsalon.fr' });
  r = await call('GET', '/api/settings/public', PUB);
  check('sans https:// : complete automatiquement et public', r.body.website_url === 'https://monsalon.fr', r.body.website_url);
  r = await call('PUT', '/api/settings', PUB, { salon_website_url: 'https://pirate.example' });
  check('reserve a l\'admin', r.status === 401 || r.status === 403, r.status);
  await call('PUT', '/api/settings', ADMIN, { salon_website_url: '' });
  r = await call('GET', '/api/settings/public', PUB);
  check('vide = pas de redirection', r.body.website_url === null, r.body.website_url);

  console.log('\n[B] Ecrans');
  const dash = rd('dashboard.html'), rdv = rd('rdv.html');
  check('champ « Site du salon » dans General, charge et enregistre', /id="set-website"/.test(dash) && /set-website'\)\.value = s\.salon_website_url/.test(dash) && /salon_website_url: document\.getElementById\('set-website'\)/.test(dash));
  check('rdv.html : redirection apres confirmation (seul et a plusieurs)', /show\('p-confirmed'\); redirectToSalonSite\('p-confirmed'\)/.test(rdv) && /show\('p-group-confirmed'\); redirectToSalonSite\('p-group-confirmed'\)/.test(rdv));
  check('jamais en mode salon (equipe)', /if \(!salonWebsite \|\| STAFF_BRIDGE\) return;/.test(rdv));
  check('« Prendre un autre rendez-vous » annule la redirection', /function startNewBooking\(\) \{\n  stopSiteRedirect\(\);/.test(rdv));
  check('pas de redirection ailleurs (compte, borne)', !/website_url/.test(rd('compte.html')) && !/website_url/.test(rd('kiosk.html')));

  console.log(`\n${pass} OK, ${fail} ECHEC`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
