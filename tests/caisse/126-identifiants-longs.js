// Prestations / supplements au nom long : leur identifiant (fabrique a partir du nom) peut faire jusqu'a 60 caracteres.
// Les RDV, leurs supplements, les tarifs par coiffeur et les lignes de vente n'en acceptaient que 36 : « Erreur interne
// du serveur » (Data too long for column 'service_id'), y compris pour « Seulement un supplement » en production.
const { execSync } = require('child_process');
const BASE = 'http://127.0.0.1:3999';
const sql = (q) => execSync(`mariadb -uroot salonq -N -e "${q.replace(/"/g, '\\"')}"`).toString().trim();
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n + (x ? '  [' + (typeof x === 'string' ? x : JSON.stringify(x)).slice(0, 160) + ']' : '')); };
const ADMIN = { 'Content-Type': 'application/json', 'X-Salon-Slug': 'test', 'X-Admin-Password': 'adminpw' };
const call = async (m, u, h, b) => { const r = await fetch(BASE + u, { method: m, headers: h, body: b ? JSON.stringify(b) : undefined }); let j = null; try { j = await r.json(); } catch (e) {} return { status: r.status, body: j }; };

(async () => {
  const SV = 'coupe-barber-shampoing-soin-complet-premium-du-samedi', EX = 'soin-visage-serviette-chaude-gommage-mask-creme-hydrat';
  const d = new Date(Date.now() + 13 * 86400000), DAY = d.toISOString().slice(0, 10), wd = d.getUTCDay();
  sql(`DELETE FROM appointments WHERE client_name LIKE 'T126%';
       INSERT IGNORE INTO services (id, salon_id, name, duration_min, price_cents, active, sort_order) VALUES ('${SV}','s1','T126 Coupe longue',30,2200,1,98);
       INSERT IGNORE INTO extras (id, salon_id, name, duration_min, price_cents, active, sort_order) VALUES ('${EX}','s1','T126 Soin long',20,1200,1,98);
       DELETE FROM barber_schedules WHERE barber_id = 'b1' AND weekday = ${wd};
       INSERT INTO barber_schedules (id, barber_id, weekday, start_time, end_time, active) VALUES (UUID(),'b1',${wd},'09:00','19:00',1);
       DELETE FROM salon_closures WHERE salon_id = 's1'; DELETE FROM barber_walkin_days WHERE barber_id = 'b1';
       UPDATE barbers SET kiosk_hidden = 1, accepts_appointments = 1 WHERE id = 'b1';`);
  check('identifiants de 55 caracteres (comme un nom long)', SV.length > 36 && EX.length > 36);

  let r = await call('POST', '/api/appointments/admin-create', ADMIN, { client_name: 'T126 Da Silva', barber_id: 'b1', service_id: SV, extras: [EX], date: DAY, time: '10:00' });
  check('RDV avec prestation + supplement au nom long : enregistre', r.status === 200, r.body);
  r = await call('POST', '/api/appointments/admin-create', ADMIN, { client_name: 'T126 Seul', barber_id: 'b1', service_id: '__extras__', extras: [EX], date: DAY, time: '14:00' });
  check('« Seulement un supplement » au nom long : enregistre', r.status === 200, r.body);
  sql(`INSERT INTO barber_service_prices (barber_id, service_id, price_cents) VALUES ('b1','${SV}',2500) ON DUPLICATE KEY UPDATE price_cents = 2500;
       INSERT INTO barber_extra_prices (barber_id, extra_id, price_cents) VALUES ('b1','${EX}',1500) ON DUPLICATE KEY UPDATE price_cents = 1500;`);
  check('tarifs propres a un coiffeur pour ces articles', sql(`SELECT COUNT(*) FROM barber_service_prices WHERE service_id = '${SV}'`) === '1' && sql(`SELECT COUNT(*) FROM barber_extra_prices WHERE extra_id = '${EX}'`) === '1');
  const cols = sql(`SELECT GROUP_CONCAT(CONCAT(table_name, '.', column_name, '=', CHARACTER_MAXIMUM_LENGTH) ORDER BY table_name) FROM information_schema.columns WHERE table_schema = DATABASE()
    AND ((table_name IN ('appointments','barber_service_prices') AND column_name = 'service_id') OR (table_name IN ('appointment_extras','barber_extra_prices') AND column_name = 'extra_id') OR (table_name = 'sale_items' AND column_name = 'item_id'))`);
  check('les 5 colonnes acceptent 60 caracteres', (cols.match(/=60/g) || []).length === 5, cols);
  const fks = sql(`SELECT COUNT(*) FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA = DATABASE() AND REFERENCED_TABLE_NAME IS NOT NULL
    AND ((TABLE_NAME IN ('appointments','barber_service_prices') AND COLUMN_NAME = 'service_id') OR (TABLE_NAME IN ('appointment_extras','barber_extra_prices') AND COLUMN_NAME = 'extra_id'))`);
  check('les liens vers le catalogue sont toujours en place (suppression en cascade)', fks === '4', fks);

  sql(`DELETE FROM appointments WHERE client_name LIKE 'T126%'; DELETE FROM barber_service_prices WHERE service_id = '${SV}'; DELETE FROM barber_extra_prices WHERE extra_id = '${EX}';
       DELETE FROM services WHERE id = '${SV}'; DELETE FROM extras WHERE id = '${EX}';`);
  console.log(`\n${pass} OK, ${fail} ECHEC`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
