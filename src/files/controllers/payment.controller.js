'use strict';

const paymentService = require('../services/payment.service');

/**
 * POST /payments
 * Body attendu : { amount: number, transactionId: string, operation?, customerReceipt?, terminalId? }
 */
async function createPayment(req, res) {
  const { amount, transactionId, operation, customerReceipt, terminalId } = req.body || {};

  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
    return res
      .status(400)
      .json({ error: 'INVALID_AMOUNT', message: 'Le montant doit être un nombre positif' });
  }
  if (!transactionId) {
    return res
      .status(400)
      .json({ error: 'MISSING_TRANSACTION_ID', message: 'transactionId est requis' });
  }
  if (operation !== undefined && operation !== 'debit' && operation !== 'credit') {
    return res
      .status(400)
      .json({ error: 'INVALID_OPERATION', message: 'operation doit être "debit" ou "credit"' });
  }

  try {
    const result = await paymentService.requestPayment({
      amount,
      transactionId,
      operation,
      customerReceipt,
      terminalId,
    });

    if (result.success) {
      return res.status(200).json(result);
    }

    // Le TPE a bien traité la demande mais le paiement est refusé/échoué :
    // ce n'est pas une erreur serveur, on renvoie 402 avec le détail.
    return res.status(402).json(result);
  } catch (err) {
    const message = err.message || 'Erreur inconnue';

    if (message.includes('Timeout')) {
      return res.status(504).json({ error: 'TPE_TIMEOUT', message });
    }
    if (message.includes('Erreur réseau')) {
      return res.status(502).json({ error: 'TPE_UNREACHABLE', message });
    }
    if (message.includes('Trame malformée')) {
      return res.status(502).json({ error: 'MALFORMED_FRAME', message });
    }
    if (message.includes('Configuration')) {
      return res.status(500).json({ error: 'CONFIGURATION_ERROR', message });
    }

    return res.status(500).json({ error: 'UNKNOWN_ERROR', message });
  }
}

module.exports = { createPayment };
