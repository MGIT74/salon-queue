const express = require('express');
const crypto = require('crypto');
const { pool, utcIso } = require('../db');
const { clientKey, earnLoyaltyPoint } = require('../lib/queueMath');
const { sendGiftConfirmation } = require('../lib/mailer');
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

// Alphabet sans caractères ambigus à l'oral/à l'écrit (pas de 0/O, 1/I).
const GIFT_CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function generateGiftCode() {
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += GIFT_CODE_CHARS[crypto.randomInt(GIFT_CODE_CHARS.length)];
  }
  return code;
}

/**
 * Enregistre une vente en caisse — indépendante de la file d'attente,
 * pour les prestations réglées directement au comptoir et les produits
 * vendus à emporter (boissons, cosmétiques...). Accessible aux coiffeurs
 * connectés par PIN (n'importe qui de service peut encaisser), pas
 * seulement l'admin.
 */
router.post('/', requireAdminOrBarber, wrap(async (req, res) => {
  const { payment_method, items, queue_id, gift, loyalty_redeem } = req.body;
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
  // Le marquage "payé" se fait ICI, de façon ATOMIQUE et AVANT toute
  // création de vente — si deux requêtes arrivent en même temps (double
  // clic, deux appareils), une seule doit réussir à marquer paid_at :
  // la condition "AND paid_at IS NULL" dans le WHERE garantit que seule
  // la première requête peut effectivement le faire, la seconde reçoit
  // 0 ligne affectée et est refusée avant même de créer quoi que ce soit.
  let queueRow = null;
  if (queue_id) {
    const [[row]] = await pool.query(
      'SELECT barber_id, status, paid_at, client_name, email, phone FROM queue WHERE id = ? AND salon_id = ?',
      [queue_id, req.salon.id]
    );
    if (!row) return res.status(404).json({ error: 'Client introuvable' });
    if (req.barberId && row.barber_id !== req.barberId) {
      return res.status(403).json({ error: "Ce n'est pas votre client." });
    }
    if (row.paid_at) return res.status(409).json({ error: 'Ce client a déjà été encaissé.' });

    const [markResult] = await pool.query(
      'UPDATE queue SET paid_at = NOW() WHERE id = ? AND salon_id = ? AND paid_at IS NULL',
      [queue_id, req.salon.id]
    );
    if (markResult.affectedRows === 0) {
      return res.status(409).json({ error: 'Ce client vient d\'être encaissé (probablement par un autre appareil).' });
    }
    queueRow = row;
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
    // Ce passage vient d'être réellement payé : +1 point de fidélité.
    await earnLoyaltyPoint(req.ownerId, queueRow);
    // Une récompense de fidélité était appliquée à ce ticket (gagnée à
    // un passage précédent) — on la consomme maintenant.
    if (loyalty_redeem) {
      const key = clientKey(queueRow);
      if (key) {
        await pool.query(
          `UPDATE loyalty_accounts SET rewards_available = GREATEST(rewards_available - 1, 0), updated_at = NOW()
           WHERE owner_id = ? AND client_key = ? AND rewards_available > 0`,
          [req.ownerId, key]
        );
      }
    }
  }

  if (gift) {
    const itemsSnapshot = items.map((it) => ({
      item_type: it.item_type || 'product',
      item_id: it.item_id || null,
      item_name: it.item_name || 'Article',
      unit_price_cents: Math.round(Number(it.unit_price_cents) || 0),
      quantity: Math.max(1, Number(it.quantity) || 1)
    }));
    const giftId = crypto.randomUUID();
    const code = generateGiftCode();
    await pool.query(
      `INSERT INTO gift_cards (id, salon_id, sale_id, recipient_name, recipient_phone, recipient_email, amount_cents, items_json, code)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [giftId, req.salon.id, saleId, gift.recipient_name, gift.recipient_phone, gift.recipient_email, total, JSON.stringify(itemsSnapshot), code]
    );

    try {
      await sendGiftConfirmation(req.salon.id, gift.recipient_email, {
        recipientName: gift.recipient_name,
        amountEur: (total / 100).toFixed(2).replace('.', ',') + ' €',
        items: itemsSnapshot,
        code
      });
    } catch (err) {
      // N'empêche jamais la vente si l'email échoue (ex. SMTP salon pas
      // configuré) — le code reste consultable par le super admin/admin
      // si besoin, juste journalisé pour investigation.
      console.error('[gift] envoi email de confirmation échoué:', err.message);
    }
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
    'SELECT barber_id, paid_at, client_name, email, phone FROM queue WHERE id = ? AND salon_id = ?',
    [queue_id, req.salon.id]
  );
  if (!queueRow) return res.status(404).json({ error: 'Client introuvable' });
  if (req.barberId && queueRow.barber_id !== req.barberId) {
    return res.status(403).json({ error: "Ce n'est pas votre client." });
  }
  if (queueRow.paid_at) return res.status(409).json({ error: 'Ce client a déjà été encaissé.' });

  // Deux marquages ATOMIQUES (WHERE ... IS NULL + vérification des
  // lignes affectées) — si deux requêtes arrivent en même temps (double
  // clic, ou tentative d'utiliser le même cadeau sur deux clients
  // différents simultanément), une seule peut effectivement réussir.
  const [giftResult] = await pool.query(
    'UPDATE gift_cards SET used_at = NOW(), used_queue_id = ? WHERE id = ? AND used_at IS NULL',
    [queue_id, req.params.id]
  );
  if (giftResult.affectedRows === 0) {
    return res.status(409).json({ error: 'Ce bon cadeau vient d\'être utilisé (probablement par un autre appareil).' });
  }

  const [queueResult] = await pool.query(
    'UPDATE queue SET paid_at = NOW() WHERE id = ? AND paid_at IS NULL',
    [queue_id]
  );
  if (queueResult.affectedRows === 0) {
    // Le client vient d'être payé autrement entre-temps — on annule la
    // consommation du cadeau qu'on venait de marquer, pour ne pas le
    // perdre pour rien.
    await pool.query('UPDATE gift_cards SET used_at = NULL, used_queue_id = NULL WHERE id = ?', [req.params.id]);
    return res.status(409).json({ error: 'Ce client vient d\'être encaissé autrement.' });
  }

  // Ce passage vient d'être réglé (via le cadeau) : compte aussi comme
  // un vrai passage payé pour la fidélité.
  await earnLoyaltyPoint(req.ownerId, queueRow);

  res.json({ ok: true });
}));

/**
 * Consultation d'un cadeau par son code (public — utilisé par le
 * kiosk). Ne marque RIEN comme utilisé, juste une consultation : c'est
 * toujours la caisse qui encaisse réellement le cadeau.
 */
router.get('/gift-cards/lookup', wrap(async (req, res) => {
  const code = String(req.query.code || '').trim().toUpperCase();
  if (!code) return res.status(400).json({ error: 'Code requis' });

  const [[gift]] = await pool.query(
    'SELECT * FROM gift_cards WHERE salon_id = ? AND code = ?',
    [req.salon.id, code]
  );
  if (!gift) return res.status(404).json({ error: 'Code introuvable pour ce salon' });
  if (gift.used_at) return res.status(409).json({ error: 'Ce cadeau a déjà été utilisé' });

  let items = [];
  try { items = JSON.parse(gift.items_json || '[]'); } catch (e) { items = []; }

  res.json({
    ok: true,
    gift: {
      id: gift.id,
      recipient_name: gift.recipient_name,
      recipient_email: gift.recipient_email,
      recipient_phone: gift.recipient_phone,
      amount_cents: gift.amount_cents,
      items
    }
  });
}));

module.exports = router;
