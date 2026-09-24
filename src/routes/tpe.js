const express = require('express');
const crypto = require('crypto');
const { getSettings } = require('../db');
const requireAdminOrBarber = require('../middleware/barberAuth');
const { chargeCard } = require('../lib/tpeNepting');
const { concertCharge } = require('../lib/tpeConcert');
const { wrap } = require('../lib/wrap');

const router = express.Router();

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

  // Deux protocoles supportés selon la configuration du terminal :
  // - "nepting" (défaut)  : trames TLV "Protocole Caisse" (API locale
  //   Nepting, cf. lib/tpeNepting.js)
  // - "concert"           : Concert version 3 IP — le protocole historique
  //   annoncé "PROTOCOL: ConcertV3 IP" sur les tickets de config
  //   (Crédit Agricole / Nepting, PAX A920Pro, Ingenico...).
  try {
    let result;
    if (s.tpe_protocol === 'concert') {
      result = await concertCharge({
        host: s.tpe_ip,
        port: Number(s.tpe_port) || 8888,
        posNumber: String(s.tpe_cash_register_number || '1').slice(0, 1),
        transactionType: 'debit',
        private: merchantTxId.slice(0, 10)
      }, { amountCents, timeoutMs: 120000 });
    } else {
      result = await chargeCard({
        host: s.tpe_ip,
        port: Number(s.tpe_port) || 20002,
        replyMode: s.tpe_reply_mode === 'callback' ? 'callback' : 'same',
        callbackPort: Number(s.tpe_callback_port) || 20006,
        cashRegisterId: s.tpe_cash_register_id,
        cashRegisterNumber: s.tpe_cash_register_number || '01'
      }, { amountCents, merchantTxId });
    }

    res.json({
      ok: true,
      success: result.success,
      auth_number: result.authNumber || null,
      failure_code: result.failureCode || result.resultCode || null,
      failure_reason: result.failureReason || null,
      merchant_tx_id: merchantTxId
    });
  } catch (err) {
    res.status(502).json({ error: `Impossible de joindre le terminal de paiement : ${err.message}` });
  }
}));

module.exports = router;
