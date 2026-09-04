const net = require('net');

// Intégration TPE (terminal de paiement carte), protocole Nepting - trames
// TLV type "Protocole Caisse". Basé sur la documentation publique de l'API
// locale Nepting (partenaire HiPay), faute de doc officielle Nepting
// accessible sans compte partenaire. Testé contre notre simulateur
// (tools/tpe-simulator/) ; à valider avec le vrai terminal dès que possible.
//
// Deux comportements possibles selon le matériel, tous les deux supportés
// ici (voir replyMode) :
//  - "same"     : le TPE répond sur la même connexion TCP que la demande
//  - "callback" : le TPE ouvre une nouvelle connexion vers un port dédié
//                 de la caisse pour livrer sa réponse. Dans ce mode, il
//                 faut qu'un serveur TCP tourne déjà côté caisse pour
//                 recevoir cette connexion (voir registerCallbackServer).

/** Construit un tag TLV : "CZ" + longueur sur 3 chiffres + valeur. */
function tlv(tag, value) {
  const str = String(value);
  const len = String(str.length).padStart(3, '0');
  return `${tag}${len}${str}`;
}

/** Parse une trame TLV en objet { TAG: valeur }. */
function parseFrame(frame) {
  const tags = {};
  let i = 0;
  while (i < frame.length) {
    const tag = frame.slice(i, i + 2);
    const lenStr = frame.slice(i + 2, i + 5);
    const len = parseInt(lenStr, 10);
    if (tag.length < 2 || isNaN(len)) break;
    tags[tag] = frame.slice(i + 5, i + 5 + len);
    i += 5 + len;
  }
  return tags;
}

function buildChargeFrame({ cashRegisterId, cashRegisterNumber, amountCents, merchantTxId }) {
  if (!cashRegisterId) throw new Error('cashRegisterId (identifiant de caisse, tag CJ) est requis');
  if (!cashRegisterNumber) throw new Error('cashRegisterNumber (numéro de caisse, tag CA) est requis');
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    throw new Error(`amountCents doit être un entier positif (reçu : ${amountCents})`);
  }

  const parts = [
    tlv('CZ', '0300'),
    tlv('CJ', String(cashRegisterId).padEnd(12, '0').slice(0, 12)),
    tlv('CA', String(cashRegisterNumber).padStart(2, '0').slice(0, 2)),
    tlv('CB', String(amountCents)),
    tlv('CD', '0'), // 0 = débit
    tlv('CE', '978') // EUR
  ];
  if (merchantTxId) parts.push(tlv('CF', String(merchantTxId).slice(0, 32)));
  return parts.join('');
}

/** Interprète une trame de réponse en résultat exploitable. */
function interpretResponse(tags) {
  const success = tags.AE === '10';
  return {
    success,
    authNumber: tags.AC || null,
    failureCode: success ? null : (tags.AF || null),
    merchantTxId: tags.CF || null,
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
          const tags = parseFrame(buffer.trim());
          const result = interpretResponse(tags);
          const pending = result.merchantTxId && pendingCallbacks.get(result.merchantTxId);
          if (pending) {
            pendingCallbacks.delete(result.merchantTxId);
            clearTimeout(pending.timeoutHandle);
            pending.resolve(result);
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

    socket.on('connect', () => socket.write(frame));

    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutHandle);
        const tags = parseFrame(buffer.trim());
        resolve(interpretResponse(tags));
        socket.end();
      }, 80);
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
    socket.on('connect', () => { socket.write(frame); socket.end(); });
    socket.on('error', (err) => {
      pendingCallbacks.delete(merchantTxId);
      clearTimeout(timeoutHandle);
      reject(err);
    });
  }));
}

module.exports = { buildChargeFrame, parseFrame, interpretResponse, chargeCard, ensureCallbackServer };
