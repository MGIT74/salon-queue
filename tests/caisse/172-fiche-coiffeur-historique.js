// Fiche d'un coiffeur (admin) : profil en haut, puis son historique (prestations + encaissements) sur la période des
// statistiques ; paiements d'avance / reste à payer marqués, ici et dans l'historique de la caisse.
// Vraie base + vrai serveur (port 3999) pour la partie API.
process.env.DB_HOST = process.env.DB_HOST || '127.0.0.1';
process.env.DB_USER = process.env.DB_USER || 'sq';
process.env.DB_PASSWORD = process.env.DB_PASSWORD || 'sqpass';
process.env.DB_NAME = process.env.DB_NAME || 'salonq';
process.env.SETTINGS_ENCRYPTION_KEY = process.env.SETTINGS_ENCRYPTION_KEY || 'testkeytestkeytestkeytestkey123456';
const path = require('path'), fs = require('fs');
const { pool } = require(path.join(__dirname, '../../src/db'));
const BASE = 'http://127.0.0.1:3999';
const ADMIN = { 'Content-Type': 'application/json', 'X-Salon-Slug': 'test', 'X-Admin-Password': 'adminpw' };
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n + (x ? '  [' + String(x).slice(0, 220) + ']' : '')); };
const call = async (method, p, body) => { const r = await fetch(BASE + p, { method, headers: ADMIN, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, data: await r.json().catch(() => ({})) }; };
const read = (f) => fs.readFileSync(path.join(__dirname, '../../public/' + f), 'utf8');

(async () => {
  const saleIds = [];
  try {
    let r = await call('POST', '/api/queue/checkin', { client_name: 'T172 Avance', service_id: 'sv1', barber_id: 'b2' });
    const qid = r.data.entry && r.data.entry.id;
    check('client dans la file (en attente)', !!qid, JSON.stringify(r.data).slice(0, 120));
    const line = { item_type: 'service', item_id: 'sv1', item_name: 'Coupe', unit_price_cents: 2000, quantity: 1, barber_id: 'b2' };
    r = await call('POST', '/api/sales', { payment_method: 'cb', queue_id: qid, barber_id: 'b2', items: [Object.assign({ queue_id: qid }, line)] });
    if (r.data.sale) saleIds.push(r.data.sale.id);
    r = await call('POST', '/api/sales', { payment_method: 'especes', barber_id: 'b2', items: [line] });
    if (r.data.sale) saleIds.push(r.data.sale.id);
    r = await call('GET', '/api/sales?today=1&barber_id=b2');
    const adv = (r.data.items || []).find((s) => s.id === saleIds[0]), normal = (r.data.items || []).find((s) => s.id === saleIds[1]);
    check('API ventes : « advance » sur le paiement fait avant la coupe, avec le prénom du client', adv && adv.advance === true && adv.balance === false && adv.client_name === 'T172 Avance', JSON.stringify(adv || {}).slice(0, 160));
    check('API ventes : vente normale sans marque', normal && normal.advance === false && normal.balance === false);
    const h = await call('GET', '/api/queue/history?per_page=100&barber_id=b1');
    check('API historique des passages : filtre par coiffeur', (h.data.items || []).every((x) => x.barber_id === 'b1'));
  } finally {
    if (saleIds.length) { await pool.query('DELETE FROM sale_items WHERE sale_id IN (?)', [saleIds]); await pool.query('DELETE FROM sales WHERE id IN (?)', [saleIds]); }
    await pool.query("DELETE FROM queue WHERE client_name = 'T172 Avance'");
  }
  const d = read('dashboard.html'), c = read('caisse.html');
  check('fiche : profil en haut, historique juste dessous (Prestations / Encaissements), même période que les stats', d.includes('<div class="bp-hist" id="bp-hist-') && d.includes("loadBarberHistory(id, localDateStr(range.start), localDateStr(endInclusive), range.label);") && /justify-content: flex-start; align-items: center;/.test(d));
  check('fiche : badges « Payé d\'avance » / « Reste à payer réglé », total des encaissements', d.includes("✓ Payé d\\'avance") && d.includes('Reste à payer réglé') && /bp-hist-tot/.test(d));
  check('caisse > historique : mêmes badges', c.includes("hs-badge green\">✓ Payé d\\'avance") && c.includes('hs-badge blue">Reste à payer'));
  console.log('\n' + pass + ' OK, ' + fail + ' ECHEC');
  await pool.end(); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
