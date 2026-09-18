'use strict';

/**
 * Configuration du service Nepting / HiPay POS.
 *
 * ⚠️ Points NON documentés explicitement par Nepting, à valider avec le
 * vrai terminal ou avec Nepting/HiPay avant mise en production :
 *
 * - protocolVersion (tag CZ) : la doc donne "CZ0040320" en exemple de
 *   réponse et "CZ0040300" dans les exemples de requête. Aucune section
 *   n'indique clairement quelle valeur envoyer en requête pour votre
 *   déploiement. Valeur par défaut ci-dessous choisie arbitrairement à
 *   partir des exemples de requête ("0300") — À CONFIRMER.
 *
 * - connection.framingStrategy / idleTimeoutMs : la doc dit seulement,
 *   dans le dépannage, de ne PAS attendre de CR/LF pour détecter la fin
 *   d'une réponse. Elle ne fournit aucune règle fiable de fin de trame
 *   (pas de longueur totale annoncée, pas de délimiteur documenté).
 *   La stratégie "idle" (attendre que le flux de données du TPE se taise
 *   pendant idleTimeoutMs) est une solution de secours de notre côté,
 *   pas une règle du protocole. Si vous observez, avec le vrai TPE, que
 *   celui-ci ferme systématiquement la connexion après sa réponse, passez
 *   framingStrategy à "close", ce qui est plus fiable.
 */

module.exports = {
  // Une entrée par TPE (une caisse peut avoir son propre terminal).
  terminals: {
    default: {
      host: process.env.NEPTING_TPE_HOST || '192.168.1.50',
      port: parseInt(process.env.NEPTING_TPE_PORT || '8888', 10),
    },
  },

  // ⚠️ À CONFIRMER (voir note ci-dessus)
  protocolVersion: process.env.NEPTING_PROTOCOL_VERSION || '0300',

  // Obligatoires selon la doc (tags CJ / CA), à renseigner par déploiement.
  cashRegisterId: process.env.NEPTING_CASH_REGISTER_ID || null, // tag CJ
  cashRegisterNumber: process.env.NEPTING_CASH_REGISTER_NUMBER || null, // tag CA

  // Seule devise documentée par Nepting.
  currency: '978', // EUR

  connection: {
    // Timeout de connexion TCP (non documenté par Nepting, choix de notre côté)
    connectTimeoutMs: parseInt(process.env.NEPTING_CONNECT_TIMEOUT_MS || '5000', 10),

    // Timeout global d'attente d'une réponse de paiement (non documenté)
    responseTimeoutMs: parseInt(process.env.NEPTING_RESPONSE_TIMEOUT_MS || '60000', 10),

    // 'idle' (par défaut) ou 'close' — voir note ci-dessus. NON documenté.
    framingStrategy: process.env.NEPTING_FRAMING_STRATEGY || 'idle',

    // Utilisé uniquement si framingStrategy === 'idle'
    idleTimeoutMs: parseInt(process.env.NEPTING_IDLE_TIMEOUT_MS || '800', 10),
  },
};
