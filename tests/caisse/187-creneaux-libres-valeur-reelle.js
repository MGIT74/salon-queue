// Manque à gagner -> créneaux libres : chaque VRAI trou est valorisé par ce qui aurait pu y entrer (prestations du
// coiffeur, un supplément seul au plus), le déplacement magique (±5 min d'un RDV) pouvant faire passer 5 min d'un trou
// à l'autre. Plus de « prix moyen à la minute ». Vraie base + vrai serveur (port 3999) pour le câblage.
process.env.DB_HOST = process.env.DB_HOST || '127.0.0.1';
process.env.DB_USER = process.env.DB_USER || 'sq';
process.env.DB_PASSWORD = process.env.DB_PASSWORD || 'sqpass';
process.env.DB_NAME = process.env.DB_NAME || 'salonq';
process.env.SETTINGS_ENCRYPTION_KEY = process.env.SETTINGS_ENCRYPTION_KEY || 'testkeytestkeytestkeytestkey123456';
const path = require('path');
const g = require(path.join(__dirname, '../../src/lib/freeGapValue'));
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n + (x ? '  [' + String(x).slice(0, 220) + ']' : '')); };

console.log('\n[A] Valeur d\'un trou');
const items = [{ kind: 'service', duration_min: 30, price_cents: 2000 }, { kind: 'service', duration_min: 45, price_cents: 2800 },
  { kind: 'service', duration_min: 20, price_cents: 1500 }, { kind: 'extra', duration_min: 5, price_cents: 400 }];
const best = g.bestFillTable(items, 600);
check('3 min : rien ne rentre -> 0 €', best[3] === 0);
check('5 min : un supplément seul -> 4 €', best[5] === 400);
check('10 min : UN supplément seul au plus par trou -> 4 € (pas 2 × 4 €)', best[10] === 400);
check('30 min : une coupe -> 20 €', best[30] === 2000);
check('35 min : coupe + supplément -> 24 €', best[35] === 2400);

console.log('\n[B] Trous d\'une journée et déplacement magique');
const day = [[540, 720]];   // 09:00 - 12:00
const busy = [{ start: 565, end: 595, nudgeable: true }, { start: 605, end: 720, nudgeable: false }];   // trous 25 et 10 min
const withNudge = g.dayFreeValue(day, busy, best);
const noNudge = g.dayFreeValue(day, busy.map((b) => Object.assign({}, b, { nudgeable: false })), best);
check('trous trouvés : 25 + 10 = 35 min', withNudge.minutes === 35, JSON.stringify(withNudge));
check('sans décalage : 19 € + 4 € = 23 €', noNudge.cents === 2300, JSON.stringify(noNudge));
check('RDV reculé de 5 min : 30 + 5 min -> 20 € + 4 € = 24 €', withNudge.cents === 2400, JSON.stringify(withNudge));
const twoClients = g.dayGaps(day, [{ start: 600, end: 630, nudgeable: true }, { start: 620, end: 650, nudgeable: true }]);
check('deux clients qui se chevauchent : un seul bloc, pas décalable', twoClients[0].gaps.length === 2 && twoClients[0].links[0] === false, JSON.stringify(twoClients));
check('pause : les trous s\'arrêtent à la pause', g.dayFreeValue([[540, 600], [660, 720]], [], best).minutes === 120);

(async () => {
  console.log('\n[C] Dashboard (câblage)');
  const { pool } = require(path.join(__dirname, '../../src/db'));
  const BASE = 'http://127.0.0.1:3999';
  const ADMIN = { 'Content-Type': 'application/json', 'X-Salon-Slug': 'test', 'X-Admin-Password': 'adminpw' };
  const P = new Date(Date.now() - 4 * 864e5).toISOString().slice(0, 10);
  const [oldS] = await pool.query("SELECT * FROM barber_schedules WHERE barber_id = 'b2'");
  const [oldB] = await pool.query("SELECT * FROM barber_breaks WHERE barber_id = 'b2'");
  const [oldL] = await pool.query("SELECT * FROM barber_leaves WHERE barber_id = 'b2'");
  const clean = () => pool.query("DELETE FROM queue WHERE client_name LIKE 'T187%'");
  try {
    await clean();
    await pool.query("DELETE FROM barber_schedules WHERE barber_id = 'b2'"); await pool.query("DELETE FROM barber_breaks WHERE barber_id = 'b2'"); await pool.query("DELETE FROM barber_leaves WHERE barber_id = 'b2'");
    for (let w = 0; w <= 6; w++) await pool.query("INSERT INTO barber_schedules (id, barber_id, weekday, start_time, end_time, active) VALUES (UUID(), 'b2', ?, '09:00:00', '19:00:00', 1)", [w]);
    // Heure de Paris -> UTC pour start_at.
    const utc = (hm) => { const guess = new Date(P + 'T' + hm + ':00Z'); const off = new Date(guess.toLocaleString('en-US', { timeZone: 'Europe/Paris' })) - new Date(guess.toLocaleString('en-US', { timeZone: 'UTC' })); return new Date(guess - off).toISOString().slice(0, 19).replace('T', ' '); };
    // Bob occupé 09:00-10:00 et 10:25-19:00 : un seul trou de 25 min.
    await pool.query("INSERT INTO queue (id, salon_id, client_name, barber_id, service_id, status, start_at, end_at, total_duration_min) VALUES ('t187a','s1','T187 a','b2','sv1','done',?,?,60), ('t187b','s1','T187 b','b2','sv1','done',?,?,515)",
      [utc('09:00'), utc('10:00'), utc('10:25'), utc('19:00')]);
    const [sv] = await pool.query("SELECT COALESCE(p.price_cents, s.price_cents) AS price_cents, COALESCE(p.duration_min, s.duration_min) AS duration_min FROM services s LEFT JOIN barber_service_prices p ON p.service_id = s.id AND p.barber_id = 'b2' WHERE s.salon_id = 's1' AND s.active = 1 AND s.deleted_at IS NULL AND s.system_kind IS NULL AND s.id NOT IN (SELECT service_id FROM barber_service_exclusions WHERE barber_id = 'b2')");
    const [ex] = await pool.query("SELECT COALESCE(p.price_cents, e.price_cents) AS price_cents, COALESCE(p.duration_min, e.duration_min) AS duration_min FROM extras e LEFT JOIN barber_extra_prices p ON p.extra_id = e.id AND p.barber_id = 'b2' WHERE e.salon_id = 's1' AND e.active = 1 AND e.deleted_at IS NULL AND e.id NOT IN (SELECT extra_id FROM barber_extra_exclusions WHERE barber_id = 'b2')");
    const t = g.bestFillTable(sv.map((x) => ({ kind: 'service', price_cents: +x.price_cents, duration_min: +x.duration_min })).concat(ex.map((x) => ({ kind: 'extra', price_cents: +x.price_cents, duration_min: +x.duration_min }))), 600);
    const start = utc('00:00').replace(' ', 'T') + 'Z', end = new Date(new Date(start).getTime() + 864e5).toISOString();
    const r = await (await fetch(BASE + '/api/barbers/salon-stats?start=' + start + '&end=' + end + '&start_date=' + P + '&end_date=' + P, { headers: ADMIN })).json();
    const bob = r;   // le salon = Bob + Alice ; on compare le détail de Bob via sa fiche
    const rb = await (await fetch(BASE + '/api/barbers/b2/stats?start=' + start + '&end=' + end + '&start_date=' + P + '&end_date=' + P, { headers: ADMIN })).json().catch(() => ({}));
    const a = (rb && rb.availability) || null;
    if (a) {
      check('Bob : 25 min libres trouvées', a.free_minutes === 25, JSON.stringify(a));
      check('Bob : valeur = ce qui rentre en 25 min (' + t[25] + ' c)', a.free_revenue_cents === t[25], JSON.stringify(a));
    } else check('dashboard salon : créneaux libres calculés', typeof bob.free_revenue_cents === 'number', JSON.stringify(bob).slice(0, 200));
  } finally {
    await clean();
    await pool.query("DELETE FROM barber_schedules WHERE barber_id = 'b2'");
    for (const s of oldS) await pool.query('INSERT INTO barber_schedules SET ?', [s]);
    for (const b of oldB) await pool.query('INSERT INTO barber_breaks SET ?', [b]);
    for (const l of oldL) await pool.query('INSERT IGNORE INTO barber_leaves SET ?', [l]);
    await pool.end();
  }
  console.log('\n' + pass + ' OK, ' + fail + ' ECHEC');
  process.exit(fail ? 1 : 0);
})();
