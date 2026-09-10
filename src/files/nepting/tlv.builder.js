'use strict';

/**
 * TLV Builder pour l'API locale Nepting.
 *
 * Format d'une information (tag), tel que documenté :
 *   Type    : 2 caractères alphabétiques (ex: "CZ")
 *   Longueur: 3 caractères numériques (ex: "005"), longueur de la valeur
 *   Valeur  : N caractères alphanumériques
 *
 * Règles documentées respectées ici :
 *  - la longueur doit être > 0 ;
 *  - le tag CZ (protocole) doit toujours être le premier de la trame ;
 *  - un tag ne doit apparaître qu'une seule fois par trame ;
 *  - le tag CF peut contenir des données additionnelles séparées par "§",
 *    l'identifiant de transaction marchand devant rester à gauche du "§".
 *
 * Vérifié contre les exemples unitaires de la doc :
 *   0.01   -> "CB0011"
 *   1.50   -> "CB003150"
 *   235.70 -> "CB00523570"
 * (Les "cadres complets" donnés en exemple dans la doc ne se redécoupent
 * pas proprement selon cette même règle — voir README pour ce point.)
 */

const SEPARATOR_CF = '§';

/**
 * Encode un tag unique : TYPE + LONGUEUR (3 chiffres) + VALEUR
 */
function encodeTag(tag, value) {
  if (typeof tag !== 'string' || !/^[A-Za-z]{2}$/.test(tag)) {
    throw new Error(`Tag invalide : "${tag}" (2 caractères alphabétiques attendus)`);
  }
  const strValue = String(value);
  if (strValue.length === 0) {
    // Doc : "La longueur doit être > 0"
    throw new Error(`Le tag ${tag} a une valeur vide : la longueur doit être > 0`);
  }
  if (strValue.length > 999) {
    throw new Error(`Valeur trop longue pour le tag ${tag} (999 caractères max)`);
  }
  const length = strValue.length.toString().padStart(3, '0');
  return `${tag}${length}${strValue}`;
}

/**
 * Convertit un montant en euros (ex: 123.45) en plus petite unité de la
 * devise (ex: "12345"), comme documenté : "100 pour 1".
 */
function amountToMinorUnits(amountInEuros) {
  if (typeof amountInEuros !== 'number' || !Number.isFinite(amountInEuros) || amountInEuros <= 0) {
    throw new Error(`Montant invalide : ${amountInEuros}`);
  }
  // Arrondi en centimes pour éviter les erreurs de flottant (0.1 + 0.2 ...)
  const minorUnits = Math.round(amountInEuros * 100);
  return String(minorUnits);
}

/**
 * Construit le tag CF (identifiant de transaction marchand), avec gestion
 * du séparateur § pour des données additionnelles.
 * Longueur max documentée côté requête : 1-99 caractères.
 */
function buildMerchantTransactionTag(transactionId, extraData) {
  if (!transactionId) return null;
  let value = String(transactionId);
  if (extraData) {
    value = `${value}${SEPARATOR_CF}${extraData}`;
  }
  if (value.length > 99) {
    throw new Error(
      `Le tag CF dépasse la longueur maximale autorisée en requête (99 caractères), longueur actuelle : ${value.length}`
    );
  }
  return encodeTag('CF', value);
}

/**
 * Construit une trame de requête de paiement complète.
 *
 * @param {object} params
 * @param {string} params.protocolVersion - valeur du tag CZ (ex: "0300")
 * @param {string} params.cashRegisterId - valeur du tag CJ
 * @param {string} params.cashRegisterNumber - valeur du tag CA
 * @param {number} params.amount - montant en euros (ex: 25.00)
 * @param {'debit'|'credit'} params.operation
 * @param {string} [params.currency='978'] - ISO 4217 (978 = EUR, seule valeur documentée)
 * @param {boolean} [params.forceAuthorization] - tag BB (optionnel)
 * @param {string} [params.transactionId] - tag CF (optionnel)
 * @param {string} [params.extraData] - données additionnelles pour CF, après "§"
 * @param {boolean} [params.customerReceipt] - tag CK (optionnel)
 * @param {string} [params.phone] - tag BH (optionnel)
 * @param {string} [params.email] - tag BI (optionnel)
 * @returns {string} trame TLV prête à être envoyée au TPE
 */
function buildPaymentRequest(params) {
  const {
    protocolVersion,
    cashRegisterId,
    cashRegisterNumber,
    amount,
    operation,
    currency = '978',
    forceAuthorization,
    transactionId,
    extraData,
    customerReceipt,
    phone,
    email,
  } = params || {};

  if (!protocolVersion) throw new Error('protocolVersion (tag CZ) est obligatoire');
  if (!cashRegisterId) throw new Error('cashRegisterId (tag CJ) est obligatoire');
  if (!cashRegisterNumber) throw new Error('cashRegisterNumber (tag CA) est obligatoire');
  if (operation !== 'debit' && operation !== 'credit') {
    throw new Error(`operation invalide : "${operation}" (attendu "debit" ou "credit")`);
  }

  // CZ doit être le premier tag de la trame (règle explicite de la doc).
  const parts = [encodeTag('CZ', protocolVersion)];

  parts.push(encodeTag('CJ', cashRegisterId));
  parts.push(encodeTag('CA', cashRegisterNumber));
  parts.push(encodeTag('CB', amountToMinorUnits(amount)));
  parts.push(encodeTag('CD', operation === 'debit' ? '0' : '1'));
  parts.push(encodeTag('CE', currency));

  if (forceAuthorization !== undefined) {
    parts.push(encodeTag('BB', forceAuthorization ? '1' : '0'));
  }

  const cfTag = buildMerchantTransactionTag(transactionId, extraData);
  if (cfTag) parts.push(cfTag);

  if (customerReceipt !== undefined) {
    parts.push(encodeTag('CK', customerReceipt ? '100' : '000'));
  }

  if (phone) parts.push(encodeTag('BH', phone));
  if (email) parts.push(encodeTag('BI', email));

  return parts.join('');
}

module.exports = {
  encodeTag,
  amountToMinorUnits,
  buildMerchantTransactionTag,
  buildPaymentRequest,
};
