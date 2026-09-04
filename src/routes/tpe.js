const express = require('express');
const crypto = require('crypto');
const { getSettings } = require('../db');
const requireAdminOrBarber = require('../middleware/barberAuth');
const { chargeCard } = require('../lib/tpeNepting');

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
 * Déclenche un paiement carte sur le TPE configuré pour ce salon.
 * Ne crée PAS la vente elle-même (voir /api/sales) - le front n'appelle
 * /api/sales qu'une fois que cette route a répondu succès, pour ne
 * jamais enregistrer une vente dont le paiement carte a en réalité
 * échoué ou n'a pas eu lieu.
 */
router.post('/charge', requireAdminOrBarber, wrap(async (req, res) => {
  const amountCents = Number(req.body.amount_cents);
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    return res.status(400).json({ error: 'Montant invalide' });
  }

  const s = await getSettings(req.salon.id);
  if (!s.tpe_ip) {
    return res.status(400).json({ error: 'Aucun terminal de paiement configuré (Réglages > Terminal de paiement)' });
  }
  if (!s.tpe_cash_register_id) {
    return res.status(400).json({ error: 'Identifiant de caisse manquant (Réglages > Terminal de paiement)' });
  }

  const merchantTxId = crypto.randomBytes(8).toString('hex');

  try {
    const result = await chargeCard({
      host: s.tpe_ip,
      port: Number(s.tpe_port) || 20002,
      replyMode: s.tpe_reply_mode === 'callback' ? 'callback' : 'same',
      callbackPort: Number(s.tpe_callback_port) || 20006,
      cashRegisterId: s.tpe_cash_register_id,
      cashRegisterNumber: s.tpe_cash_register_number || '01'
    }, { amountCents, merchantTxId });

    res.json({
      ok: true,
      success: result.success,
      auth_number: result.authNumber,
      failure_code: result.failureCode,
      merchant_tx_id: merchantTxId
    });
  } catch (err) {
    res.status(502).json({ error: `Impossible de joindre le terminal de paiement : ${err.message}` });
  }
}));

module.exports = router;
