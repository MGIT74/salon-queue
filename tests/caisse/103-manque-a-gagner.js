// Fiche coiffeur > Statistiques : « manque à gagner estimé » = minutes libres x prix moyen à la minute.
// Sans aucun encaissement sur la période, on prend le prix moyen à la minute des prestations qu'il propose
// (ses prix/durées personnalisés, sans celles qu'il ne fait pas) au lieu d'afficher 0 €.
const { execSync } = require('child_process');
const fs = require('fs');
const BASE = 'http://127.0.0.1:3999';
const sql = (q) => execSync(`mariadb -uroot salonq -N -e "${q.replace(/"/g, '\\"')}"`).toString().trim();
const ADMIN = { 'X-Salon-Slug': 'test', 'X-Admin-Password': 'adminpw' };
let pass = 0, fail = 0;
const check = (n, ok, extra) => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n + (ok || extra === undefined ? '' : '  -> ' + JSON.stringify(extra))); };

(async () => {
  const D = new Date(Date.now() + 9 * 86400000).toISOString().slice(0, 10);
  const stats = () => fetch(BASE + '/api/barbers/b1/stats?start=' + D + 'T00:00:00Z&end=' + D + 'T23:59:59Z&start_date=' + D + '&end_date=' + D, { headers: ADMIN }).then((r) => r.json()).then((r) => r.availability);
  const clean = "DELETE FROM barber_service_prices WHERE barber_id='b1'; DELETE FROM barber_service_exclusions WHERE barber_id='b1'; DELETE FROM barber_breaks WHERE barber_id='b1'; DELETE FROM barber_leaves WHERE barber_id='b1'";
  sql(clean);
  sql("UPDATE services SET price_cents=2000, duration_min=30, active=1, deleted_at=NULL WHERE id='sv1'");
  sql("UPDATE services SET active=0 WHERE salon_id='s1' AND id <> 'sv1'");
  sql("DELETE FROM barber_schedules WHERE barber_id='b1'");
  sql("INSERT INTO barber_schedules (id,barber_id,weekday,start_time,end_time,active) SELECT UUID(),'b1',d.n,'09:00','19:00',1 FROM (SELECT 0 n UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5 UNION SELECT 6) d");

  let a = await stats();
  check('journée vide (aucun encaissement) : 600 min libres x 20 € / 30 min = 400 €, d\'après ses prestations', a.free_minutes === 600 && a.potential_revenue_cents === 40000 && a.potential_basis === 'catalog', a);
  sql("INSERT INTO barber_service_prices (barber_id, service_id, price_cents, duration_min) VALUES ('b1','sv1',3000,30)");
  a = await stats();
  check('prix personnalisé du coiffeur pris en compte (30 € / 30 min -> 600 €)', a.potential_revenue_cents === 60000, a);
  sql("INSERT INTO barber_service_exclusions (barber_id, service_id) VALUES ('b1','sv1')");
  a = await stats();
  check('aucune prestation proposée : pas d\'estimation possible (0 €)', a.potential_revenue_cents === 0 && a.potential_basis === 'none', a);

  const dash = fs.readFileSync(__dirname + '/../../public/dashboard.html', 'utf8');
  check('la case précise « d\'après le prix moyen de ses prestations » quand c\'est le cas (et pas sous 0 €)', /potential_basis === 'catalog' && a\.potential_revenue_cents > 0 \? '<br><span[^>]*>d\\'après le prix moyen de ses prestations/.test(dash));
  const src = fs.readFileSync(__dirname + '/../../src/routes/barbers.js', 'utf8');
  check('avec des encaissements, le calcul reste basé sur ce qui a été réellement encaissé', /bookedMinutes > 0 && revenueCents > 0 \? revenueCents \/ bookedMinutes/.test(src));

  sql(clean);
  sql("UPDATE services SET active=1 WHERE salon_id='s1' AND deleted_at IS NULL");
  console.log('\nRESULTAT : ' + pass + ' verifications reussies, ' + fail + ' echec(s)');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
