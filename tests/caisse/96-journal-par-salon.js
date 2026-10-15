// Journal d'activite (base et serveur reels, voir README) : isole par salon - un salon ne voit plus
// les actions des autres salons de la meme enseigne.
const { execSync } = require('child_process');
const BASE = 'http://127.0.0.1:3999';
const sql = (q) => execSync(`mariadb -uroot salonq -N -e "${q.replace(/"/g, '\\"')}"`).toString().trim();
const H = (slug) => ({ 'Content-Type': 'application/json', 'X-Salon-Slug': slug, 'X-Admin-Password': 'adminpw' });
const get = async (slug, q) => (await (await fetch(BASE + '/api/owner/activity-log' + (q || ''), { headers: H(slug) })).json());
let pass = 0, fail = 0;
const check = (n, ok, extra) => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n + (ok || extra === undefined ? '' : '  -> ' + JSON.stringify(extra))); };

(async () => {
  sql("DELETE FROM activity_log WHERE salon_id IN ('s1','s2'); DELETE FROM salons WHERE id='s2'");
  sql("INSERT INTO salons (id,owner_id,name,slug,is_default) VALUES ('s2','o1','Salon Deux','deux',0)");
  sql("INSERT INTO activity_log (id,salon_id,actor,action,description) VALUES (UUID(),'s1','admin','x','Action du salon UN'),(UUID(),'s2','admin','x','Action du salon DEUX')");
  let r = await get('test');
  check('salon 1 : uniquement ses propres actions', r.items.length === 1 && r.items[0].description === 'Action du salon UN', r.items);
  r = await get('deux');
  check('salon 2 : uniquement ses propres actions', r.items.length === 1 && r.items[0].description === 'Action du salon DEUX', r.items);
  r = await get('test', '?salon=all');
  check('vue enseigne complete seulement si demandee explicitement (?salon=all)', r.items.length === 2, r.items);
  sql("DELETE FROM activity_log WHERE salon_id IN ('s1','s2'); DELETE FROM salons WHERE id='s2'");
  console.log('\nRESULTAT : ' + pass + ' verifications reussies, ' + fail + ' echec(s)');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
