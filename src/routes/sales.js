const express = require('express');
const crypto = require('crypto');
const { pool, utcIso } = require('../db');
const requireAdmin = require('../middleware/auth');
const requireAdminOrBarber = require('../middleware/barberAuth');

const router = express.Router();

function wrap(fn) {
  return function (req, res) {
    fn(req, res).catch((err) => {
      console.error(err);
      res.status(500).json({ error: err.message });
    });
  };
}

const PAYMENT_METHODS = ['especes', 'cb', 'cheque', 'cheque_cadeau', 'autre'];

/**
 * Enregistre une vente en caisse — indépendante de la file d'attente,
 * pour les prestations réglées directement au comptoir et les produits
 * vendus à emporter (boissons, cosmétiques...). Accessible aux coiffeurs
 * connectés par PIN (n'importe qui de service peut encaisser), pas
 * seulement l'admin.
 */
router.post('/', requireAdminOrBarber, wrap(async (req, res) => {
  const { payment_method, items } = req.body;
  if (!PAYMENT_METHODS.includes(payment_method)) {
    return res.status(400).json({ error: 'Moyen de paiement invalide' });
  }
  if (!Array.isArray(items) || !items.length) {
    return res.status(400).json({ error: 'Le ticket est vide' });
  }

  const barberId = req.barberId || (req.body.barber_id || null);
  const saleId = crypto.randomUUID();
  let total = 0;

  const itemRows = items.map((it) => {
    const qty = Math.max(1, Number(it.quantity) || 1);
    const unitPrice = Math.round(Number(it.unit_price_cents) || 0);
    total += qty * unitPrice;
    return [crypto.randomUUID(), saleId, it.item_type || 'product', it.item_id || null, it.item_name || 'Article', unitPrice, qty];
  });

  await pool.query(
    'INSERT INTO sales (id, salon_id, barber_id, payment_method, total_price_cents) VALUES (?, ?, ?, ?, ?)',
    [saleId, req.salon.id, barberId, payment_method, total]
  );
  await pool.query(
    'INSERT INTO sale_items (id, sale_id, item_type, item_id, item_name, unit_price_cents, quantity) VALUES ?',
    [itemRows]
  );

  res.json({ ok: true, sale: { id: saleId, total_price_cents: total, payment_method, barber_id: barberId } });
}));

/**
 * Historique des ventes (admin uniquement) — pour le suivi/reporting,
 * avec filtre par plage de dates optionnel.
 */
router.get('/', requireAdmin, wrap(async (req, res) => {
  const conditions = ['s.salon_id = ?'];
  const params = [req.salon.id];
  if (req.query.date_from) { conditions.push('s.created_at >= ?'); params.push(req.query.date_from + ' 00:00:00'); }
  if (req.query.date_to) { conditions.push('s.created_at <= ?'); params.push(req.query.date_to + ' 23:59:59'); }

  const [sales] = await pool.query(
    `SELECT s.*, b.name AS barber_name FROM sales s LEFT JOIN barbers b ON b.id = s.barber_id
     WHERE ${conditions.join(' AND ')} ORDER BY s.created_at DESC LIMIT 500`,
    params
  );
  const ids = sales.map((s) => s.id);
  let itemsBySale = {};
  if (ids.length) {
    const [items] = await pool.query('SELECT * FROM sale_items WHERE sale_id IN (?)', [ids]);
    items.forEach((it) => { (itemsBySale[it.sale_id] = itemsBySale[it.sale_id] || []).push(it); });
  }

  res.json({
    ok: true,
    items: sales.map((s) => Object.assign({}, s, {
      created_at: utcIso(s.created_at),
      items: itemsBySale[s.id] || []
    })),
    total_revenue_cents: sales.reduce((a, s) => a + s.total_price_cents, 0)
  });
}));

module.exports = router;
