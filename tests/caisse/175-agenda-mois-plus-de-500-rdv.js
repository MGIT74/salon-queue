// Agenda (Mon poste, caisse, dashboard) d'un salon chargé : il charge les RDV mois par mois.
// Avant : le serveur s'arrêtait à 500 RDV du mois (annulés et terminés compris, du plus ancien au
// plus récent) -> à Oyonnax plus rien après le 13 novembre dans l'agenda, alors que la liste
// « À venir » montrait bien les RDV du 26 ajoutés par les coiffeurs.
const { execSync } = require('child_process');
const BASE = 'http://127.0.0.1:3999';
const sql = (q) => execSync(`mariadb -uroot salonq -N -e "${q.replace(/"/g, '\\"')}"`).toString().trim();
const ADMIN = { 'X-Salon-Slug': 'test', 'X-Admin-Password': 'adminpw' };
let pass = 0, fail = 0;
const check = (n, ok, extra) => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n + (ok || extra === undefined ? '' : '  -> ' + JSON.stringify(extra))); };

(async () => {
  const M = '2031-03';
  sql("DELETE FROM appointments WHERE id LIKE 't175-%'");
  const rows = [];
  for (let i = 0; i < 600; i++) {
    const d = 1 + Math.floor(i / 25), h = 9 + (i % 25) / 3;   // 25 RDV par jour du 1er au 24
    const hh = String(Math.floor(h)).padStart(2, '0'), mm = String(Math.round((h % 1) * 60) % 60).padStart(2, '0');
    rows.push(`('t175-${i}','s1','b1','Client ${i}','sv1','${M}-${String(d).padStart(2, '0')} ${hh}:${mm}:00','${i % 4 === 0 ? 'cancelled' : 'confirmed'}')`);
  }
  rows.push(`('t175-fin','s1','b2','Thibault','sv1','${M}-26 10:00:00','confirmed')`);
  rows.push(`('t175-avril','s1','b2','Hors mois','sv1','2031-04-01 00:00:00','confirmed')`);
  rows.push(`('t175-fevrier','s1','b2','Hors mois','sv1','2031-02-28 23:59:00','confirmed')`);
  for (let i = 0; i < rows.length; i += 200) sql('INSERT INTO appointments (id,salon_id,barber_id,client_name,service_id,scheduled_at,status) VALUES ' + rows.slice(i, i + 200).join(','));

  const r = await fetch(BASE + '/api/appointments?month=' + M + '&all=1&caisse_view=1', { headers: ADMIN }).then((x) => x.json());
  const ids = (r.items || []).filter((a) => String(a.id).startsWith('t175-')).map((a) => a.id);
  check('les 600 RDV du mois + celui du 26 sont tous renvoyés (plus de coupure à 500)', ids.length === 601, ids.length);
  check('le RDV du 26 ajouté par un coiffeur est dans l\'agenda', ids.includes('t175-fin'));
  check('le mois reste borné : ni le 28 février 23:59 ni le 1er avril 00:00', !ids.includes('t175-avril') && !ids.includes('t175-fevrier'));
  const r2 = await fetch(BASE + '/api/appointments?month=2031-12&all=1&caisse_view=1', { headers: ADMIN }).then((x) => x.json());
  check('décembre (passage à l\'année suivante) répond sans erreur', r2.ok === true && Array.isArray(r2.items), r2);

  sql("DELETE FROM appointments WHERE id LIKE 't175-%'");
  console.log('\n' + pass + ' OK, ' + fail + ' ECHEC');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
