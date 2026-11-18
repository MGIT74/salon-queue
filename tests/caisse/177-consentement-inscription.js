// Création de compte client : case « J'accepte les conditions d'utilisation et j'ai lu la politique de
// confidentialité » obligatoire (non cochée par défaut), date + version des textes enregistrées.
const { execSync } = require('child_process');
const fs = require('fs'), path = require('path');
const BASE = 'http://127.0.0.1:3999';
const sql = (q) => execSync(`mariadb -uroot salonq -N -e "${q.replace(/"/g, '\\"')}"`).toString().trim();
let pass = 0, fail = 0;
const check = (n, ok, extra) => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n + (ok || extra === undefined ? '' : '  -> ' + JSON.stringify(extra))); };
const post = async (body) => { const r = await fetch(BASE + '/api/client-auth/signup', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Salon-Slug': 'test' }, body: JSON.stringify(body) }); return { s: r.status, b: await r.json().catch(() => ({})) }; };
(async () => {
  sql("DELETE FROM clients WHERE email LIKE 't177-%'");
  const base = { name: 'Eric', phone: '+33600000177', password: 'motdepasse1' };
  let r = await post({ ...base, email: 't177-a@exemple.fr' });
  check('sans la case cochée : refusé (400, needs_terms), aucun compte créé', r.s === 400 && r.b.needs_terms === true && sql("SELECT COUNT(*) FROM clients WHERE email='t177-a@exemple.fr'") === '0', r);
  r = await post({ ...base, email: 't177-b@exemple.fr', accept_terms: 'true' });
  check('« true » en texte ne suffit pas (case réellement cochée exigée)', r.s === 400, r);
  r = await post({ ...base, email: 't177-c@exemple.fr', accept_terms: true });
  const row = sql("SELECT CONCAT(terms_accepted_at IS NOT NULL, '|', terms_version) FROM clients WHERE email='t177-c@exemple.fr'");
  check('case cochée : compte créé avec la date et la version acceptées', r.s === 200 && row === '1|2026-11', row);
  const c = fs.readFileSync(path.join(__dirname, '../../public/compte.html'), 'utf8');
  check('formulaire : case non cochée par défaut, liens vers les CGU et la politique de confidentialité', /<input id="su-terms" type="checkbox">/.test(c) && c.includes('href="https://thebarberone.com/cgu"') && c.includes('href="https://thebarberone.com/politique-de-confidentialite"'));
  check('formulaire : la case est vérifiée avant l\'envoi et transmise', c.includes("if (terms && !terms.checked)") && c.includes('accept_terms: !!(terms && terms.checked)'));
  sql("DELETE FROM clients WHERE email LIKE 't177-%'");
  console.log('\n' + pass + ' OK, ' + fail + ' ECHEC');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
