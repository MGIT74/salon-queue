const express = require('express');
const crypto = require('crypto');
const { pool, utcIso } = require('../db');
const { clientKey } = require('../lib/queueMath');
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

const PAYMENT_METHODS = ['especes', 'cb', 'autre'];

/**
 * Enregistre une vente en caisse — indépendante de la file d'attente,
 * pour les prestations réglées directement au comptoir et les produits
 * vendus à emporter (boissons, cosmétiques...). Accessible aux coiffeurs
 * connectés par PIN (n'importe qui de service peut encaisser), pas
 * seulement l'admin.
 */
router.post('/', requireAdminOrBarber, wrap(async (req, res) => {
  const { payment_method, items, queue_id, gift } = req.body;
  if (!PAYMENT_METHODS.includes(payment_method)) {
    return res.status(400).json({ error: 'Moyen de paiement invalide' });
  }
  if (!Array.isArray(items) || !items.length) {
    return res.status(400).json({ error: 'Le ticket est vide' });
  }

  // Un ticket "cadeau" ne peut pas venir d'un encaissement en attente
  // (ça n'aurait pas de sens : un client déjà en train de se faire
  // servir n'est pas un cadeau à l'avance pour quelqu'un d'autre), et
  // exige le nom + téléphone + email du bénéficiaire pour un
  // rapprochement fiable plus tard.
  if (gift) {
    if (queue_id) return res.status(400).json({ error: "Un cadeau ne peut pas venir d'un encaissement en attente" });
    if (!gift.recipient_name || !gift.recipient_phone || !gift.recipient_email) {
      return res.status(400).json({ error: 'Nom, téléphone et email du bénéficiaire sont requis pour un cadeau' });
    }
  }

  // Si la vente correspond à une coupe terminée précise (venant de "En
  // attente d'encaissement"), on vérifie qu'elle appartient bien à ce
  // coiffeur et qu'elle n'est pas déjà réglée, avant de l'encaisser.
  if (queue_id) {
    const [[row]] = await pool.query(
      'SELECT barber_id, status, paid_at FROM queue WHERE id = ? AND salon_id = ?',
      [queue_id, req.salon.id]
    );
    if (!row) return res.status(404).json({ error: 'Client introuvable' });
    if (req.barberId && row.barber_id !== req.barberId) {
      return res.status(403).json({ error: "Ce n'est pas votre client." });
    }
    if (row.paid_at) return res.status(409).json({ error: 'Ce client a déjà été encaissé.' });
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

  if (queue_id) {
    await pool.query('UPDATE queue SET paid_at = NOW() WHERE id = ? AND salon_id = ?', [queue_id, req.salon.id]);
  }

  if (gift) {
    await pool.query(
      `INSERT INTO gift_cards (id, salon_id, sale_id, recipient_name, recipient_phone, recipient_email, amount_cents)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [crypto.randomUUID(), req.salon.id, saleId, gift.recipient_name, gift.recipient_phone, gift.recipient_email, total]
    );
  }

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

/**
 * Utilise un bon cadeau pour régler une coupe en attente d'encaissement
 * — ne crée AUCUNE nouvelle vente (l'argent a déjà été compté le jour
 * de l'achat du cadeau), marque juste le cadeau consommé et la coupe
 * payée.
 */
router.post('/gift-cards/:id/redeem', requireAdminOrBarber, wrap(async (req, res) => {
  const { queue_id } = req.body;
  if (!queue_id) return res.status(400).json({ error: 'queue_id requis' });

  const [[gift]] = await pool.query(
    'SELECT id, used_at FROM gift_cards WHERE id = ? AND salon_id = ?',
    [req.params.id, req.salon.id]
  );
  if (!gift) return res.status(404).json({ error: 'Bon cadeau introuvable' });
  if (gift.used_at) return res.status(409).json({ error: 'Ce bon cadeau a déjà été utilisé' });

  const [[queueRow]] = await pool.query(
    'SELECT barber_id, paid_at FROM queue WHERE id = ? AND salon_id = ?',
    [queue_id, req.salon.id]
  );
  if (!queueRow) return res.status(404).json({ error: 'Client introuvable' });
  if (req.barberId && queueRow.barber_id !== req.barberId) {
    return res.status(403).json({ error: "Ce n'est pas votre client." });
  }
  if (queueRow.paid_at) return res.status(409).json({ error: 'Ce client a déjà été encaissé.' });

  await pool.query('UPDATE gift_cards SET used_at = NOW(), used_queue_id = ? WHERE id = ?', [queue_id, req.params.id]);
  await pool.query('UPDATE queue SET paid_at = NOW() WHERE id = ?', [queue_id]);

  res.json({ ok: true });
}));

module.exports = router;
