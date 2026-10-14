// Statistiques du Dashboard (base et serveur reels, voir README) : « Encaisse aujourd'hui » et le CA de la
// semaine comptent TOUTES les ventes de la caisse (comme le Z), par jour du SALON (pas jour UTC).
const { execSync } = require('child_process');
const BASE = 'http://127.0.0.1:3999';
const sql = (q) => execSync(`mariadb -uroot salonq -N -e "${q.replace(/"/g, '\\"')}"`).toString().trim();
const ADMIN = { 'Content-Type': 'application/json', 'X-Salon-Slug': 'test', 'X-Admin-Password': 'adminpw' };
const get = async (p) => (await (await fetch(BASE + p, { headers: ADMIN })).json());
let pass = 0, fail = 0;
const check = (n, ok, extra) => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n + (ok || extra === undefined ? '' : '  -> ' + JSON.stringify(extra))); };

(async () => {
  sql("DELETE FROM sales; DELETE FROM queue; DELETE FROM settings WHERE salon_id='s1' AND \\`key\\`='timezone'");
  const tz = 'Europe/Paris';
  // debut du jour de Paris en UTC
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  // 1 passage de la file encaisse (20 EUR) + 1 ticket de comptoir (produit 15 EUR) + 1 cadeau vendu (50 EUR)
  sql("INSERT INTO queue (id,salon_id,client_name,service_id,barber_id,status,checkin_at,end_at,total_price_cents,paid_at) VALUES ('sq1','s1','A','sv1','b1','done',UTC_TIMESTAMP(),UTC_TIMESTAMP(),2000,UTC_TIMESTAMP())");
  sql("INSERT INTO sales (id,salon_id,barber_id,payment_method,total_price_cents,ticket_number,queue_id,created_at) VALUES ('s1a','s1','b1','especes',2000,1,'sq1',UTC_TIMESTAMP()),('s1b','s1','b1','cb',1500,2,NULL,UTC_TIMESTAMP()),('s1c','s1','b2','cb',5000,3,NULL,UTC_TIMESTAMP())");
  sql("INSERT INTO sale_items (id,sale_id,item_type,item_id,item_name,unit_price_cents,quantity) VALUES ('i1','s1a','service','sv1','Coupe',2000,1),('i2','s1b','product','p1','Gel',1500,1)");
  // vente d'il y a 3 jours (comptee dans la semaine, pas aujourd'hui)
  sql("INSERT INTO sales (id,salon_id,barber_id,payment_method,total_price_cents,ticket_number,created_at) VALUES ('s1d','s1','b1','especes',1000,4,UTC_TIMESTAMP() - INTERVAL 3 DAY)");
  let r = await get('/api/queue/stats/today');
  check('encaisse aujourd\'hui = toutes les ventes du jour (20 + 15 + 50 = 85 EUR), plus seulement la file', r.revenue_cents === 8500, r);
  check('passages termines toujours comptes', r.done === 1, r);
  r = await get('/api/queue/stats/week');
  check('7 jours, aujourd\'hui (jour du salon) en dernier', r.days.length === 7 && r.days[6].date === today, r.days.map((d) => d.date));
  check('CA du jour dans la semaine = 85 EUR', r.days[6].revenue_cents === 8500, r.days[6]);
  check('CA de la semaine = 95 EUR', r.days.reduce((a, d) => a + d.revenue_cents, 0) === 9500);
  check('classement du jour base sur les ventes', r.leaderboard.by_revenue.length >= 1 && r.leaderboard.by_revenue[0].revenue_cents > 0, r.leaderboard.by_revenue);
  // vente juste avant minuit (heure de Paris) hier : pas dans aujourd'hui, meme si c'est encore « aujourd'hui » en UTC
  const { parisLocalToUtcDate } = require('../../src/db');
  const startUtc = parisLocalToUtcDate(today, '00:00:00', tz);
  const before = new Date(startUtc.getTime() - 5 * 60000).toISOString().slice(0, 19).replace('T', ' ');
  sql(`INSERT INTO sales (id,salon_id,barber_id,payment_method,total_price_cents,ticket_number,created_at) VALUES ('s1e','s1','b1','especes',700,5,'${before}')`);
  r = await get('/api/queue/stats/today');
  check('une vente d\'hier soir 23h55 (heure du salon) n\'est pas comptee aujourd\'hui', r.revenue_cents === 8500, r);
  require('../../src/db').pool.end();
  sql("DELETE FROM sales; DELETE FROM queue");
  console.log('\nRESULTAT : ' + pass + ' verifications reussies, ' + fail + ' echec(s)');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
