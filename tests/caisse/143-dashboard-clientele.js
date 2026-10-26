// Dashboard : 4 chiffres « clientele » en haut (comptes clients, cartes fidelite actives, cartes cadeaux en cours,
// clients sans compte) + « Prochains RDV » : tous les RDV a venir, la liste defile dans la carte.
const { execSync } = require('child_process');
const fs = require('fs'), path = require('path');
const BASE = 'http://127.0.0.1:3999';
const sql = (q) => execSync(`mariadb -uroot salonq -N -e "${q.replace(/"/g, '\\"')}"`).toString().trim();
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n + (x ? '  [' + JSON.stringify(x).slice(0, 200) + ']' : '')); };
const H = { 'X-Salon-Slug': 'test', 'X-Admin-Password': 'adminpw' };
const stats = async () => (await (await fetch(BASE + '/api/owner/client-stats', { headers: H })).json());
const clean = () => sql("DELETE FROM queue WHERE id LIKE 't143%'; DELETE FROM appointments WHERE id LIKE 't143%'; DELETE FROM loyalty_accounts WHERE id LIKE 't143%'; DELETE FROM clients WHERE id LIKE 't143%'; DELETE FROM gift_cards WHERE id LIKE 't143%'; DELETE FROM sales WHERE id LIKE 't143%'");
(async () => {
  clean();
  const before = await stats();
  check('API : les 4 chiffres', ['accounts', 'loyalty', 'gifts', 'without_account'].every((k) => Number.isInteger(before[k])), before);
  const ownerId = sql("SELECT owner_id FROM salons WHERE id='s1'");
  sql(`INSERT INTO clients (id,owner_id,salon_id,name,email,password_hash,email_verified) VALUES ('t143c1','${ownerId}','s1','Avec Compte','avec@t143.fr','x',1),('t143c2','${ownerId}','s1','Pas Confirme','pasconf@t143.fr','x',0)`);
  sql(`INSERT INTO loyalty_accounts (id,owner_id,salon_id,client_key,client_name,points,activated_at) VALUES ('t143l1','${ownerId}','s1','avec@t143.fr','Avec Compte',3,NOW()),('t143l2','${ownerId}','s1','x@t143.fr','X',0,NULL)`);
  sql("INSERT INTO sales (id,salon_id,payment_method,total_price_cents) VALUES ('t143s','s1','especes',1000)");
  sql("INSERT INTO gift_cards (id,salon_id,sale_id,recipient_name,recipient_phone,recipient_email,amount_cents,used_at,voided_at) VALUES ('t143g1','s1','t143s','A','1','a@t143.fr',1000,NULL,NULL),('t143g2','s1','t143s','B','1','b@t143.fr',1000,NOW(),NULL),('t143g3','s1','t143s','C','1','c@t143.fr',1000,NULL,NOW())");
  sql("INSERT INTO queue (id,salon_id,client_name,email,status) VALUES ('t143q1','s1','Avec Compte','avec@t143.fr','done'),('t143q2','s1','Sans Compte','sans@t143.fr','done'),('t143q3','s1','Sans Compte','sans@t143.fr','done')");
  sql("INSERT INTO appointments (id,salon_id,client_name,phone,service_id,scheduled_at) VALUES ('t143a1','s1','Tel Seul','0600000143','sv1',NOW())");
  const after = await stats();
  check('comptes clients : seulement les comptes confirmes', after.accounts - before.accounts === 1, after);
  check('cartes fidelite : seulement les cartes activees', after.loyalty - before.loyalty === 1, after);
  check('cartes cadeaux en cours : ni utilisees ni annulees', after.gifts - before.gifts === 1, after);
  check('clients sans compte : une fois chacun (file + RDV), sans ceux qui ont un compte', after.without_account - before.without_account === 2, after);
  clean();
  const d = fs.readFileSync(path.join(__dirname, '../../public/dashboard.html'), 'utf8');
  check('dashboard : les 4 pastilles', ['Comptes clients <b id="dash-pill-accounts"', 'Cartes fidélité actives <b id="dash-pill-loyalty"', 'Cartes cadeaux en cours <b id="dash-pill-gifts"', 'Clients sans compte <b id="dash-pill-noaccount"'].every((s) => d.includes(s)) && d.includes("api('/api/owner/client-stats')"));
  check('dashboard : plus d\'anciennes pastilles (en attente, occupation, au fauteuil, encaisse)', !/id="dash-pill-(wait|occ|active|rev)"/.test(d));
  check('prochains RDV : tous les RDV, liste qui defile', d.includes('items.map(function (a) {   // tous les RDV') && /#dash-rdv-list \{ max-height: 290px; overflow-y: auto;/.test(d));
  console.log(`\n${pass} OK, ${fail} ECHEC`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); clean(); process.exit(1); });
