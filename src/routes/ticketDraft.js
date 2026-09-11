const express = require('express');
const { pool } = require('../db');
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

/**
 * Ticket en cours de construction en Caisse, sauvegardé côté serveur par
 * coiffeur (req.actingBarberId = la bulle sélectionnée) - même principe
 * que les coupes en attente d'encaissement : peu importe le rechargement
 * de page ou l'appareil, le coiffeur retrouve exactement son ticket en
 * cliquant sur sa bulle. GET renvoie un ticket vide (pas d'erreur) s'il
 * n'a rien en cours - évite à la caisse de gérer un cas "404" à part.
 */
router.get('/', requireAdminOrBarber, wrap(async (req, res) => {
  if (!req.actingBarberId) return res.json({ ok: true, draft: null });

  const [[row]] = await pool.query(
    'SELECT ticket_json, ticket_queue_id, loyalty_discount_json, loyalty_rewards_available FROM ticket_drafts WHERE barber_id = ?',
    [req.actingBarberId]
  );
  if (!row) return res.json({ ok: true, draft: null });

  res.json({
    ok: true,
    draft: {
      ticket: row.ticket_json ? JSON.parse(row.ticket_json) : [],
      ticketQueueId: row.ticket_queue_id,
      loyaltyDiscount: row.loyalty_discount_json ? JSON.parse(row.loyalty_discount_json) : null,
      loyaltyRewardsAvailable: row.loyalty_rewards_available || 0
    }
  });
}));

/**
 * Enregistre (ou remplace) le brouillon du coiffeur agissant. Un ticket
 * vide efface simplement la ligne plutôt que de garder une ligne vide
 * en base indéfiniment.
 */
router.put('/', requireAdminOrBarber, wrap(async (req, res) => {
  if (!req.actingBarberId) return res.status(400).json({ error: 'Aucun coiffeur sélectionné' });

  const ticket = Array.isArray(req.body.ticket) ? req.body.ticket : [];
  if (!ticket.length) {
    await pool.query('DELETE FROM ticket_drafts WHERE barber_id = ?', [req.actingBarberId]);
    return res.json({ ok: true });
  }

  await pool.query(
    `INSERT INTO ticket_drafts (barber_id, salon_id, ticket_json, ticket_queue_id, loyalty_discount_json, loyalty_rewards_available)
     VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       ticket_json = VALUES(ticket_json), ticket_queue_id = VALUES(ticket_queue_id),
       loyalty_discount_json = VALUES(loyalty_discount_json), loyalty_rewards_available = VALUES(loyalty_rewards_available)`,
    [
      req.actingBarberId,
      req.salon.id,
      JSON.stringify(ticket),
      req.body.ticketQueueId || null,
      req.body.loyaltyDiscount ? JSON.stringify(req.body.loyaltyDiscount) : null,
      req.body.loyaltyRewardsAvailable || 0
    ]
  );
  res.json({ ok: true });
}));

/** Efface le brouillon (paiement finalisé, ou "Vider le ticket"). */
router.delete('/', requireAdminOrBarber, wrap(async (req, res) => {
  if (req.actingBarberId) {
    await pool.query('DELETE FROM ticket_drafts WHERE barber_id = ?', [req.actingBarberId]);
  }
  res.json({ ok: true });
}));

module.exports = router;
