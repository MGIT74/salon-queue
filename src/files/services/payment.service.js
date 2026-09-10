'use strict';

const NeptingClient = require('../nepting/nepting.client');
const config = require('../config/nepting.config');

// Codes AE documentés par Nepting.
const RESULT_SUCCESS = '10';
const RESULT_FAILURE = '01';

/**
 * Codes AF (raison d'échec), repris tels quels de la doc Nepting.
 * Note : la doc liste "01 = Transaction autorisée" comme raison d'échec,
 * ce qui semble contradictoire — mais c'est la valeur documentée, donc
 * elle est conservée telle quelle plutôt que réinterprétée.
 */
const FAILURE_REASONS = {
  '00': 'Inconnu',
  '01': 'Transaction autorisée',
  '02': 'Appel téléphonique',
  '03': 'Forçage',
  '04': 'Refusé',
  '05': 'Interdit',
  '06': 'Abandon',
  '07': 'Non terminé',
  '08': "Fonctionnement non effectué : temps d'entrée utilisateur",
  '09': 'Opération non effectuée : mauvais format de message',
  '10': 'Opération non réalisée : mauvaise sélection',
  '11': "Opération non effectuée : abandon de l'acquéreur",
  '12': "Opération non effectuée : type d'opération inconnu",
  '13': 'Monnaie non supportée',
};

function minorUnitsToAmount(minorUnitsStr) {
  const n = parseInt(minorUnitsStr, 10);
  if (Number.isNaN(n)) return null;
  return n / 100;
}

/**
 * Transforme une réponse TLV déjà parsée en résultat métier exploitable
 * par l'application de gestion de coiffure.
 */
function toBusinessResult(parsedResponse, requestedTransactionId) {
  const { tags, unknownTags } = parsedResponse;

  const success = tags.AE === RESULT_SUCCESS;
  const failure = tags.AE === RESULT_FAILURE;

  if (!success && !failure) {
    // Valeur AE non prévue par la doc : on ne masque pas l'anomalie.
    throw new Error(`Code résultat AE inattendu reçu du TPE : "${tags.AE}"`);
  }

  return {
    success,
    status: success ? 'PAID' : 'FAILED',
    transactionId: tags.CF ? tags.CF.split('§')[0] : requestedTransactionId || null,
    extraData: tags.CF && tags.CF.includes('§') ? tags.CF.split('§').slice(1).join('§') : null,
    amount: tags.CB !== undefined ? minorUnitsToAmount(tags.CB) : null,
    currency: tags.CE || null,
    operation: tags.CD === '0' ? 'debit' : tags.CD === '1' ? 'credit' : null,
    authorizationCode: tags.AC || null,
    paymentApplication: tags.CC || null,
    merchantContract: tags.CG || null,
    failureReasonCode: tags.AF || null,
    failureReason: tags.AF ? FAILURE_REASONS[tags.AF] || 'Code inconnu' : null,
    // Le tag AK (reçu client) est documenté comme du base64, mais les
    // exemples fournis dans la doc source ne sont pas du base64 valide.
    // On le transmet donc brut, sans décodage, à valider avec le vrai TPE.
    receiptRaw: tags.AK || null,
    unknownTags,
  };
}

/**
 * Déclenche un paiement sur le TPE configuré.
 *
 * @param {object} params
 * @param {number} params.amount - montant en euros
 * @param {string} params.transactionId - identifiant transaction (tag CF)
 * @param {'debit'|'credit'} [params.operation='debit']
 * @param {boolean} [params.customerReceipt]
 * @param {string} [params.terminalId='default'] - clé dans config.terminals
 * @returns {Promise<object>} résultat métier (voir toBusinessResult)
 */
async function requestPayment(params) {
  const {
    amount,
    transactionId,
    operation = 'debit',
    customerReceipt,
    terminalId = 'default',
  } = params || {};

  const terminalConfig = config.terminals[terminalId];
  if (!terminalConfig) {
    throw new Error(`Configuration introuvable pour le terminal "${terminalId}"`);
  }
  if (!config.cashRegisterId || !config.cashRegisterNumber) {
    throw new Error(
      'Configuration incomplète : cashRegisterId (CJ) et cashRegisterNumber (CA) doivent être définis'
    );
  }

  const client = new NeptingClient(terminalConfig, config.connection);

  const parsedResponse = await client.requestPayment({
    protocolVersion: config.protocolVersion,
    cashRegisterId: config.cashRegisterId,
    cashRegisterNumber: config.cashRegisterNumber,
    amount,
    operation,
    currency: config.currency,
    transactionId,
    customerReceipt,
  });

  return toBusinessResult(parsedResponse, transactionId);
}

module.exports = { requestPayment, toBusinessResult, FAILURE_REASONS };
