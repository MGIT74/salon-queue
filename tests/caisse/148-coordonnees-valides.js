// Coordonnees verifiees PARTOUT (avant : « t » passait pour un nom, un email et un telephone) :
// RDV en ligne (seul / a plusieurs), compte client (inscription, profil), borne, equipe (admin / caisse / poste), cadeau.
const { execSync } = require('child_process');
const fs = require('fs'), path = require('path'), vm = require('vm');
const BASE = 'http://127.0.0.1:3999';
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n + (x ? '  [' + JSON.stringify(x).slice(0, 200) + ']' : '')); };
const { isValidEmail, isValidPhone, contactError } = require('../../src/lib/contact');
check('email : « t », « a@b », « a@@b.fr » refuses ; « prenom.nom@gmail.com » accepte', !isValidEmail('t') && !isValidEmail('a@b') && !isValidEmail('a@@b.fr') && isValidEmail('prenom.nom@gmail.com'));
check('telephone : « +33t », « 06 », « +336123456789 » refuses ; « 06 12 34 56 78 », « +33612345678 », « +41791234567 » acceptes',
  !isValidPhone('+33t') && !isValidPhone('06') && !isValidPhone('+336123456789') && isValidPhone('06 12 34 56 78') && isValidPhone('+33612345678') && isValidPhone('+41791234567'));
check('nom en ligne : « t » refuse ; equipe : nom non controle', !!contactError({ name: 't', email: 'a@b.fr' }) && contactError({ name: 'X' }, { nameRequired: false }) === null);
const app = fs.readFileSync(path.join(__dirname, '../../public/app.js'), 'utf8');
const ctx = {}; vm.createContext(ctx);
vm.runInContext(['isValidEmailStr', 'isValidPhoneStr', 'contactProblem'].map((f) => app.match(new RegExp('function ' + f + '\\([\\s\\S]*?\\n\\}\\n'))[0]).join('\n'), ctx);
check('pages : memes regles que le serveur', ctx.contactProblem({ name: 't', email: 't', phone: '+33t' }, { emailRequired: true }) !== '' && ctx.contactProblem({ name: 'Tom', email: 'tom@gmail.com', phone: '+33612345678' }, { emailRequired: true }) === '' &&
  /email invalide/.test(ctx.contactProblem({ name: 'Tom', email: 't' })) && /téléphone invalide/.test(ctx.contactProblem({ name: 'Tom', phone: '+33t' })));
const rd = (p) => fs.readFileSync(path.join(__dirname, '../..', p), 'utf8');
check('pages qui appellent la verification : RDV en ligne (seul + a plusieurs), compte (inscription + profil), borne, equipe',
  (rd('public/rdv.html').match(/contactProblem\(/g) || []).length === 2 && (rd('public/compte.html').match(/contactProblem\(/g) || []).length === 2 &&
  rd('public/kiosk.html').includes('contactProblem(') && rd('public/staff-group.js').includes('contactProblem(c, { nameRequired: false })'));
(async () => {
  const H = { 'Content-Type': 'application/json', 'X-Salon-Slug': 'test' };
  const post = async (p, body, h) => { const r = await fetch(BASE + p, { method: 'POST', headers: Object.assign({}, H, h || {}), body: JSON.stringify(body) }); return { status: r.status, body: await r.json().catch(() => null) }; };
  const DAY = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
  let r = await post('/api/appointments', { client_name: 't', email: 't', phone: '+33t', service_id: 'sv1', date: DAY, time: '10:00' });
  check('RDV en ligne « t / t / +33t » : refuse', r.status === 400, r.body);
  r = await post('/api/appointments', { client_name: 'Tom', email: 'tom@gmail.com', phone: '+33t', service_id: 'sv1', date: DAY, time: '10:00' });
  check('RDV en ligne, telephone « +33t » : refuse', r.status === 400 && /téléphone/.test(r.body.error), r.body);
  r = await post('/api/appointments/group', { client_name: 'Tom', email: 'x', phone: '0612345678', people: [] });
  check('RDV a plusieurs, email « x » : refuse', r.status === 400 && /email/i.test(r.body.error), r.body);
  r = await post('/api/queue/checkin', { client_name: 'Tom', email: 'x', service_id: 'sv1' });
  check('borne, email « x » : refuse', r.status === 400 && /email/i.test(r.body.error), r.body);
  r = await post('/api/client-auth/signup', { name: 'Tom', email: 'tom@gmail.com', phone: '+33t', password: 'secret12' });
  check('inscription compte, telephone « +33t » : refuse', r.status === 400 && /téléphone/.test(r.body.error), r.body);
  r = await post('/api/appointments/admin-create', { client_name: 'X', email: 'x', service_id: 'sv1', date: DAY, time: '10:00', barber_id: 'b1' }, { 'X-Admin-Password': 'adminpw' });
  check('equipe (admin) : email saisi « x » refuse', r.status === 400 && /email/i.test(r.body.error), r.body);
  console.log(`\n${pass} OK, ${fail} ECHEC`);
  process.exit(fail ? 1 : 0);
})();
