// Ajouter un RDV côté salon (dashboard, caisse) : un client qui a un COMPTE est reconnu dans la recherche, avec ses
// proches (enfants…) enregistrés ; ils sont proposés dans « Plusieurs personnes », et le salon peut lui en ajouter.
const { execSync } = require('child_process');
const fs = require('fs');
const BASE = 'http://127.0.0.1:3999';
const sql = (q) => execSync(`mariadb -uroot salonq -N -e "${q.replace(/"/g, '\\"')}"`).toString().trim();
const ADMIN = { 'Content-Type': 'application/json', 'X-Salon-Slug': 'test', 'X-Admin-Password': 'adminpw' };
const BARBER = { 'Content-Type': 'application/json', 'X-Salon-Slug': 'test', 'X-Barber-Id': 'b1', 'X-Barber-Pin': '1111' };
const PUBLIC = { 'Content-Type': 'application/json', 'X-Salon-Slug': 'test' };
const req = async (method, path, h, body) => { const r = await fetch(BASE + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, body: await r.json().catch(() => null) }; };
let pass = 0, fail = 0;
const check = (n, ok, extra) => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n + (ok || extra === undefined ? '' : '  -> ' + JSON.stringify(extra))); };

(async () => {
  const clean = "DELETE FROM client_relatives WHERE client_id IN ('t99a','t99b'); DELETE FROM clients WHERE id IN ('t99a','t99b'); DELETE FROM queue WHERE client_name='Dokatel Visiteur'";
  sql(clean);
  sql("INSERT INTO clients (id,owner_id,salon_id,name,email,phone,password_hash,email_verified) VALUES ('t99a','o1','s1','Eric Dokatel','eric.t99@example.com','06 11 22 33 44','x',1)");
  sql("INSERT INTO client_relatives (id,client_id,name,created_at) VALUES ('t99r1','t99a','Noah',NOW() - INTERVAL 2 MINUTE),('t99r2','t99a','Ines',NOW() - INTERVAL 1 MINUTE)");
  sql("INSERT INTO clients (id,owner_id,salon_id,name,email,password_hash,email_verified) VALUES ('t99b','o1','autre-salon','Dokatel Ailleurs','ailleurs.t99@example.com','x',1)");
  sql("INSERT INTO queue (id,salon_id,client_name,phone,status,checkin_at) VALUES (UUID(),'s1','Dokatel Visiteur','0700000000','done',NOW())");

  let r = await req('GET', '/api/queue/clients-search?q=dokat', ADMIN);
  const acc = (r.body.items || []).find((x) => x.name === 'Eric Dokatel');
  check('recherche : le compte client est trouvé, marqué comme compte, en tête de liste', acc && acc.account_id === 't99a' && r.body.items[0] === acc, r.body);
  check('...avec ses proches enregistrés (enfants…) dans l\'ordre', acc && acc.relatives.map((x) => x.name).join(',') === 'Noah,Ines', acc);
  check('...les clients sans compte (simple passage) restent proposés, sans proches', (r.body.items || []).some((x) => x.name === 'Dokatel Visiteur' && !x.account_id && x.relatives.length === 0));
  check('...un compte d\'un AUTRE salon n\'apparaît jamais', !(r.body.items || []).some((x) => x.name === 'Dokatel Ailleurs'));
  r = await req('GET', '/api/queue/clients-search?q=' + encodeURIComponent('11 22 33'), BARBER);
  check('recherche par téléphone (espaces ignorés), aussi depuis la caisse (code PIN)', r.status === 200 && (r.body.items || []).some((x) => x.account_id === 't99a'), r.body);
  r = await req('GET', '/api/queue/clients-search?q=eric.t99', ADMIN);
  check('recherche par email', (r.body.items || []).some((x) => x.account_id === 't99a'));

  r = await req('GET', '/api/queue/client-accounts/t99a/relatives', BARBER);
  check('proches lisibles par le salon', r.status === 200 && r.body.relatives.length === 2, r.body);
  r = await req('POST', '/api/queue/client-accounts/t99a/relatives', BARBER, { name: '  Lina  ' });
  check('« Enregistrer dans ses proches » : ajouté au compte du client', r.status === 200 && r.body.item.name === 'Lina' && sql("SELECT COUNT(*) FROM client_relatives WHERE client_id='t99a' AND name='Lina'") === '1', r.body);
  r = await req('POST', '/api/queue/client-accounts/t99a/relatives', ADMIN, { name: 'lina' });
  check('même prénom : pas de doublon', r.status === 200 && r.body.existing && sql("SELECT COUNT(*) FROM client_relatives WHERE client_id='t99a'") === '3', r.body);
  check('ajout noté dans le journal du salon', sql("SELECT COUNT(*) FROM activity_log WHERE salon_id='s1' AND action='client_relative_add' AND description LIKE '%Lina%Eric Dokatel%'") !== '0');
  r = await req('GET', '/api/queue/client-accounts/t99b/relatives', ADMIN);
  check('compte d\'un autre salon : introuvable (404)', r.status === 404, r.body);
  r = await req('POST', '/api/queue/client-accounts/t99b/relatives', ADMIN, { name: 'Pirate' });
  check('...et impossible d\'y ajouter un proche', r.status === 404 && sql("SELECT COUNT(*) FROM client_relatives WHERE client_id='t99b'") === '0');
  r = await req('GET', '/api/queue/client-accounts/t99a/relatives', PUBLIC);
  check('sans authentification : refusé', r.status === 401, r.status);
  r = await req('GET', '/api/queue/clients-search?q=dokat', PUBLIC);
  check('recherche sans authentification : refusée', r.status === 401, r.status);

  const pub = (f) => fs.readFileSync(__dirname + '/../../public/' + f, 'utf8');
  check('liste de recherche : badge « Compte client · N proches », choix mémorisé', /ac-badge/.test(pub('app.js')) && /_clientPick = c/.test(pub('app.js')));
  check('« Plusieurs personnes » : proches du compte proposés + case pour en ajouter', /relatives: staffAccount\(\)/.test(pub('rdv.html')) && /client-accounts\/' \+ encodeURIComponent\(staffAccount\(\)\.account_id\) \+ '\/relatives/.test(pub('rdv.html')) && /c\.account_id = pick\.account_id/.test(pub('staff-group.js')));

  sql(clean);
  console.log('\nRESULTAT : ' + pass + ' verifications reussies, ' + fail + ' echec(s)');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
