const net = require('net');

// Intégration TPE (terminal de paiement carte), protocole Nepting - trames
// TLV type "Protocole Caisse". Basé à l'origine sur la documentation
// publique de l'API locale Nepting (partenaire HiPay), puis complété et
// durci suite à la relecture d'une documentation HiPay officielle
// (logiciel de caisse utilisant Nepting) trouvée par ailleurs - voir
// notamment le parseur, la gestion de la fermeture de connexion, et les
// tags optionnels ci-dessous. Testé contre notre simulateur
// (tools/tpe-simulator/) ; toujours à valider avec le vrai terminal dès
// que possible : la version de protocole (tag CZ) et la règle de fin de
// trame de réponse ne sont pas garanties par la documentation.
//
// Deux comportements possibles selon le matériel, tous les deux supportés
// ici (voir replyMode) :
//  - "same"     : le TPE répond sur la même connexion TCP que la demande
//  - "callback" : le TPE ouvre une nouvelle connexion vers un port dédié
//                 de la caisse pour livrer sa réponse. Dans ce mode, il
//                 faut qu'un serveur TCP tourne déjà côté caisse pour
//                 recevoir cette connexion (voir registerCallbackServer).

/** Construit un tag TLV : type (2 lettres) + longueur sur 3 chiffres + valeur. */
function tlv(tag, value) {
  if (!/^[A-Za-z]{2}$/.test(tag)) {
    throw new Error(`Tag invalide : "${tag}" (2 caractères alphabétiques attendus)`);
  }
  const str = String(value);
  if (str.length === 0) {
    // Doc : "la longueur doit être > 0"
    throw new Error(`Le tag ${tag} a une valeur vide : la longueur doit être > 0`);
  }
  if (str.length > 999) {
    throw new Error(`Valeur trop longue pour le tag ${tag} (999 caractères max)`);
  }
  const len = String(str.length).padStart(3, '0');
  return `${tag}${len}${str}`;
}

/**
 * Parse une trame TLV en objet { TAG: valeur }. Volontairement strict :
 * une trame corrompue (en-tête tronqué, tag ou longueur mal formés,
 * longueur annoncée dépassant les données disponibles, tag dupliqué) fait
 * échouer l'appel plutôt que de renvoyer un résultat partiel silencieux -
 * mieux vaut un échec propre côté caisse qu'une interprétation erronée
 * d'un paiement. Tout appelant de cette fonction doit être entouré d'un
 * try/catch (voir chargeCardSameMode et ensureCallbackServer ci-dessous).
 */
function parseFrame(frame) {
  if (typeof frame !== 'string' || frame.length === 0) {
    throw new Error('Trame malformée : réponse vide ou invalide');
  }

  const tags = {};
  let i = 0;
  while (i < frame.length) {
    if (i + 5 > frame.length) {
      throw new Error(`Trame malformée : en-tête de tag incomplet à la position ${i}`);
    }
    const tag = frame.slice(i, i + 2);
    const lenStr = frame.slice(i + 2, i + 5);
    if (!/^[A-Za-z]{2}$/.test(tag)) {
      throw new Error(`Trame malformée : tag invalide "${tag}" à la position ${i}`);
    }
    if (!/^\d{3}$/.test(lenStr)) {
      throw new Error(`Trame malformée : longueur invalide "${lenStr}" pour le tag ${tag} à la position ${i}`);
    }
    const len = parseInt(lenStr, 10);
    if (len <= 0) {
      throw new Error(`Trame malformée : longueur nulle pour le tag ${tag} (doit être > 0)`);
    }
    const valueStart = i + 5;
    const valueEnd = valueStart + len;
    if (valueEnd > frame.length) {
      throw new Error(`Trame malformée : longueur annoncée (${len}) pour le tag ${tag} dépasse les données disponibles`);
    }
    if (tags[tag] !== undefined) {
      throw new Error(`Trame malformée : le tag ${tag} apparaît plusieurs fois`);
    }
    tags[tag] = frame.slice(valueStart, valueEnd);
    i = valueEnd;
  }
  return tags;
}

function buildChargeFrame({ cashRegisterId, cashRegisterNumber, amountCents, merchantTxId, operation, customerReceipt, phone, email }) {
  if (!cashRegisterId) throw new Error('cashRegisterId (identifiant de caisse, tag CJ) est requis');
  if (!cashRegisterNumber) throw new Error('cashRegisterNumber (numéro de caisse, tag CA) est requis');
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    throw new Error(`amountCents doit être un entier positif (reçu : ${amountCents})`);
  }
  if (operation !== undefined && operation !== 'debit' && operation !== 'credit') {
    throw new Error(`operation invalide : "${operation}" (attendu "debit" ou "credit")`);
  }

  const parts = [
    tlv('CZ', '0300'),
    tlv('CJ', String(cashRegisterId).padEnd(12, '0').slice(0, 12)),
    tlv('CA', String(cashRegisterNumber).padStart(2, '0').slice(0, 2)),
    tlv('CB', String(amountCents)),
    tlv('CD', operation === 'credit' ? '1' : '0'), // 0 = débit (défaut), 1 = crédit
    tlv('CE', '978') // EUR, seule devise documentée
  ];
  if (merchantTxId) parts.push(tlv('CF', String(merchantTxId).slice(0, 99)));
  // Tags optionnels (documentés côté HiPay, non utilisés aujourd'hui par
  // notre route /api/tpe/charge mais supportés ici pour un usage futur).
  if (customerReceipt !== undefined) parts.push(tlv('CK', customerReceipt ? '100' : '000'));
  if (phone) parts.push(tlv('BH', String(phone)));
  if (email) parts.push(tlv('BI', String(email)));
  return parts.join('');
}

/**
 * Raisons d'échec (tag AF), reprises telles quelles de la documentation -
 * y compris "01 = Transaction autorisée", qui semble contradictoire avec
 * son usage comme code d'échec mais correspond à la valeur documentée.
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
  '13': 'Monnaie non supportée'
};

/** Interprète une trame de réponse en résultat exploitable. */
function interpretResponse(tags) {
  const success = tags.AE === '10';
  return {
    success,
    authNumber: tags.AC || null,
    failureCode: success ? null : (tags.AF || null),
    failureReason: !success && tags.AF ? (FAILURE_REASONS[tags.AF] || 'Code inconnu') : null,
    merchantTxId: tags.CF ? tags.CF.split('§')[0] : null,
    paymentApplication: tags.CC || null,
    merchantContract: tags.CG || null,
    // Tag AK (reçu client) documenté comme du base64, mais les exemples
    // fournis dans certaines docs ne sont pas du base64 valide - transmis
    // brut, sans décodage, à valider avec le vrai TPE.
    receiptRaw: tags.AK || null,
    raw: tags
  };
}

/**
 * Callbacks en attente, indexées par identifiant de transaction marchand
 * (tag CF). Utilisé uniquement en mode "callback" : quand le serveur de
 * callback reçoit une trame, il cherche ici la promesse à résoudre.
 *
 * En mémoire process (pas en base) : une transaction TPE dure au maximum
 * quelques dizaines de secondes, pas la peine de survivre à un redémarrage
 * du serveur - si le process redémarre pendant un paiement en cours, il
 * vaut mieux que ça échoue proprement (timeout côté caisse) plutôt que de
 * essayer de faire survivre cet état entre deux process différents.
 */
const pendingCallbacks = new Map();

let callbackServer = null;
let callbackServerPort = null;

/**
 * Démarre (une seule fois) le serveur TCP qui reçoit les rappels du TPE en
 * mode callback. Idempotent : appeler plusieurs fois avec le même port ne
 * redémarre rien. Doit être appelé au démarrage de l'app si un salon utilise
 * le mode callback.
 */
function ensureCallbackServer(port) {
  if (callbackServer && callbackServerPort === port) return Promise.resolve();
  if (callbackServer) {
    // Un salon avec un port différent : on ne gère qu'un seul port de
    // callback pour l'instant (limitation connue - à revoir si plusieurs
    // salons utilisent des ports de callback différents en même temps).
    return Promise.reject(new Error(
      `Serveur de callback TPE déjà démarré sur le port ${callbackServerPort}, impossible d'en démarrer un second sur ${port}`
    ));
  }

  return new Promise((resolve, reject) => {
    const server = net.createServer((socket) => {
      let buffer = '';
      let idleTimer = null;
      socket.on('error', () => {}); // fermeture brutale du TPE après envoi : sans intérêt
      socket.on('data', (chunk) => {
        buffer += chunk.toString('utf8');
        clearTimeout(idleTimer);
        idleTimer = setTimeout(() => {
          // parseFrame est volontairement strict (voir plus haut) - une
          // trame corrompue ne doit jamais faire planter ce process, on
          // l'ignore proprement (le paiement en attente finira par
          // expirer via son propre timeout côté chargeCardCallbackMode).
          try {
            const tags = parseFrame(buffer.trim());
            const result = interpretResponse(tags);
            const pending = result.merchantTxId && pendingCallbacks.get(result.merchantTxId);
            if (pending) {
              pendingCallbacks.delete(result.merchantTxId);
              clearTimeout(pending.timeoutHandle);
              pending.resolve(result);
            }
          } catch (err) {
            console.error('[tpeNepting] trame de callback ignorée :', err.message);
          }
          socket.end();
        }, 80);
      });
    });
    server.on('error', reject);
    server.listen(port, () => {
      callbackServer = server;
      callbackServerPort = port;
      resolve();
    });
  });
}

/**
 * Déclenche un paiement carte sur le TPE et résout avec le résultat une
 * fois la réponse reçue (ou rejette en cas d'échec réseau / timeout).
 *
 * config attendus : { host, port, replyMode, callbackPort, cashRegisterId,
 * cashRegisterNumber }
 */
function chargeCard(config, { amountCents, merchantTxId, timeoutMs = 60000 }) {
  let frame;
  try {
    frame = buildChargeFrame({
      cashRegisterId: config.cashRegisterId,
      cashRegisterNumber: config.cashRegisterNumber,
      amountCents,
      merchantTxId
    });
  } catch (err) {
    return Promise.reject(err);
  }

  if (config.replyMode === 'callback') {
    return chargeCardCallbackMode(config, frame, merchantTxId, timeoutMs);
  }
  return chargeCardSameMode(config, frame, timeoutMs);
}

function chargeCardSameMode(config, frame, timeoutMs) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: config.host, port: config.port });
    let buffer = '';
    let idleTimer = null;
    let settled = false;

    const timeoutHandle = setTimeout(() => {
      if (settled) return;
      settled = true;
      socket.destroy();
      reject(new Error('Le TPE n\'a pas répondu à temps'));
    }, timeoutMs);

    // parseFrame est strict : une trame corrompue est renvoyée comme une
    // erreur explicite (au lieu de planter le process) - à ce stade on
    // sait déjà que la connexion TCP a fonctionné, donc c'est un vrai
    // problème de contenu à faire remonter à l'appelant.
    const settleWithBuffer = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutHandle);
      try {
        const tags = parseFrame(buffer.trim());
        resolve(interpretResponse(tags));
      } catch (err) {
        reject(err);
      }
      socket.destroy();
    };

    socket.on('connect', () => socket.write(frame, 'ascii'));

    socket.on('data', (chunk) => {
      buffer += chunk.toString('ascii');
      clearTimeout(idleTimer);
      idleTimer = setTimeout(settleWithBuffer, 80);
    });

    // Si le TPE ferme la connexion juste avant l'expiration du délai
    // d'inactivité ci-dessus, on ne doit pas perdre la réponse déjà
    // reçue - on la traite immédiatement dès la fermeture plutôt que
    // d'attendre un délai qui ne se déclenchera jamais.
    socket.once('close', () => {
      if (settled || buffer.length === 0) return;
      clearTimeout(idleTimer);
      settleWithBuffer();
    });

    socket.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutHandle);
      reject(err);
    });
  });
}

function chargeCardCallbackMode(config, frame, merchantTxId, timeoutMs) {
  if (!merchantTxId) {
    return Promise.reject(new Error('Un identifiant de transaction (merchantTxId) est requis en mode callback'));
  }

  return ensureCallbackServer(config.callbackPort).then(() => new Promise((resolve, reject) => {
    const timeoutHandle = setTimeout(() => {
      pendingCallbacks.delete(merchantTxId);
      reject(new Error('Le TPE n\'a pas rappelé à temps'));
    }, timeoutMs);

    pendingCallbacks.set(merchantTxId, { resolve, timeoutHandle });

    const socket = net.createConnection({ host: config.host, port: config.port });
    socket.on('connect', () => { socket.write(frame, 'ascii'); socket.end(); });
    socket.on('error', (err) => {
      pendingCallbacks.delete(merchantTxId);
      clearTimeout(timeoutHandle);
      reject(err);
    });
  }));
}

module.exports = { buildChargeFrame, parseFrame, interpretResponse, chargeCard, ensureCallbackServer, FAILURE_REASONS };
