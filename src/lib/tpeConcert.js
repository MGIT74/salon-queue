const net = require('net');

// Protocole Concert version 3, variante "IP" — le dialogue caisse <-> TPE
// historique français (Crédit Agricole / E-Transactions, aujourd'hui
// mutualisé par les passerelles monétiques type Nepting). C'est le
// protocole annoncé par les tickets de configuration des terminaux
// ("PROTOCOL: ConcertV3 IP") et supporté par les Ingenico DESK/MOVE 5000,
// AXIUM et PAX A920Pro fléchés "Concert".
//
// Principe (mode réseau) : la caisse ouvre une connexion TCP vers le TPE
// (port 8888 en usage courant) et lui envoie UNE trame de demande ; le
// TPE affiche le montant, traite la carte, puis répond sur la MÊME
// connexion avec une trame de résultat. Pas d'ENQ/ACK/EOT en mode IP :
// ces poignées de main ne concernent que la variante série (RS232/USB).
//
// Trame de demande (33 caractères exactement, plus le cadre ASCII) :
//   STX (0x02) + message + ETX (0x03) + LRC
//   message = pos_number(1) + amount(8) + answer_flag(1) + payment_mode(1)
//           + transaction_type(1) + currency(3) + private(10)
//           + delay(4) + auto(4)
// En mode réseau, pos_number tient sur UN caractère (2 en série) — c'est
// la principale divergence entre les deux variantes, d'où un total de 33
// caractères ici.
//
// Trame de résultat (21 caractères) :
//   pos_number(1) + transaction_result(1) + amount(8) + payment_mode(1)
//   + currency(3) + private(10), encadrée de la même façon.
// transaction_result : '0' = accepté ; '1' appel, '2' forçage, '3' refusé,
// '4' carte interdite, '5' annulé (client ou banque), '6' échec,
// '7' impossible, '8' erreur inconnue.
//
// Le LRC est un XOR de tous les octets du message + ETX.

const STX = 0x02;
const ETX = 0x03;

/** XOR de tous les octets (octet de contrôle LRC de la trame). */
function computeLrc(buf) {
  let lrc = 0;
  for (const b of buf) lrc ^= b;
  return lrc;
}

/** Montant en centimes -> 8 caractères zéro-padded (Concert parle en centimes). */
function amountField(amountCents) {
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    throw new Error(`amountCents doit être un entier positif (reçu : ${amountCents})`);
  }
  return String(amountCents).padStart(8, '0');
}

/**
 * Construit la trame complète de demande de paiement (STX + message + ETX + LRC).
 * options : { posNumber, amountCents, transactionType ('debit'|'credit'), private }
 */
function buildConcertFrame({ posNumber = '1', amountCents, transactionType = 'debit', private: priv = '' }) {
  const amount = amountField(amountCents);
  // private : 10 caractères libres (écho dans la réponse) - on y met la
  // référence transaction si fournie, tronquée à 10, sinon des espaces.
  const privField = String(priv || '').slice(0, 10).padEnd(10, ' ');
  const msg =
    String(posNumber || '1').slice(0, 1) +   // n° de caisse (1 caractère en réseau)
    amount +                                  // montant en centimes, 8 chars
    '0' +                                     // answer_flag : pas d'info supplémentaire demandée
    '1' +                                     // payment_mode : '1' = carte bancaire
    (transactionType === 'credit' ? '1' : '0') + // 0 = débit (paiement), 1 = crédit (remboursement)
    '978' +                                   // devise EUR (ISO 4217 numérique)
    privField +                               // 10 chars libres
    'A010' +                                  // délai : réponse à la fin effective de la transaction
    'B010';                                   // autorisation : demande automatique
  if (msg.length !== 33) {
    throw new Error(`Trame Concert invalide (${msg.length} caractères au lieu de 33)`);
  }
  const body = Buffer.concat([Buffer.from(msg, 'ascii'), Buffer.from([ETX])]);
  return Buffer.concat([Buffer.from([STX]), body, Buffer.from([computeLrc(body)])]);
}

/**
 * Parse la trame de résultat du TPE (sans le STX/LRC). Volontairement
 * strict : longueur inattendue = erreur explicite, jamais une
 * interprétation approximative d'un paiement.
 */
function parseConcertResponse(frame) {
  if (typeof frame !== 'string' || frame.length < 14) {
    throw new Error(`Trame de réponse Concert trop courte (${frame ? frame.length : 0} caractères)`);
  }
  const RATIONALE_LENGTH = 24; // 1+1+8+1+3+10
  const trimmed = frame.replace(/\r/g, '');
  if (trimmed.length !== RATIONALE_LENGTH) {
    throw new Error(`Trame de réponse Concert de longueur inattendue (${trimmed.length} au lieu de ${RATIONALE_LENGTH})`);
  }
  return {
    posNumber: trimmed.charAt(0),
    resultCode: trimmed.charAt(1),
    amountCents: parseInt(trimmed.slice(2, 10), 10),
    paymentMode: trimmed.charAt(10),
    currency: trimmed.slice(11, 14),
    private: trimmed.slice(14, 24)
  };
}

const RESULT_LABELS = {
  '0': 'Accepté',
  '1': 'Appel autorisation requis',
  '2': 'Forçage',
  '3': 'Refusé',
  '4': 'Carte interdite',
  '5': 'Annulé',
  '6': 'Transaction non effectuée',
  '7': 'Transaction impossible',
  '8': 'Erreur inconnue'
};

/** Traduit une trame de réponse en résultat exploitable par la route /charge. */
function interpretConcertResponse(frame) {
  const parsed = parseConcertResponse(frame);
  const success = parsed.resultCode === '0';
  return {
    success,
    resultCode: parsed.resultCode,
    failureReason: success ? null : (RESULT_LABELS[parsed.resultCode] || 'Échec (code ' + parsed.resultCode + ')'),
    amountCents: parsed.amountCents,
    private: parsed.private,
    raw: parsed
  };
}

/**
 * Envoie une demande de paiement Concert v3 au TPE et attend la réponse
 * sur la même connexion TCP (comportement standard du mode IP).
 * config : { host, port, posNumber, transactionType, private }
 * opts   : { amountCents, timeoutMs }
 */
function concertCharge(config, { amountCents, timeoutMs = 120000 }) {
  return new Promise((resolve, reject) => {
    let frame;
    try {
      frame = buildConcertFrame({
        posNumber: config.posNumber || '1',
        amountCents,
        transactionType: config.transactionType || 'debit',
        private: config.private || ''
      });
    } catch (err) {
      return reject(err);
    }

    const socket = net.createConnection({ host: config.host, port: config.port });
    let buffer = Buffer.alloc(0);
    let settled = false;

    const timeoutHandle = setTimeout(() => {
      if (settled) return;
      settled = true;
      socket.destroy();
      reject(new Error("Le TPE n'a pas répondu à temps (terminal en veille, hors ligne, ou paiement abandonné)"));
    }, timeoutMs);

    const settle = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutHandle);
      socket.destroy();
      fn(value);
    };

    socket.on('connect', () => socket.write(frame));

    socket.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      // La réponse est complète dès qu'on a un STX suivi d'au moins
      // 1 + 21 + 1 + 1 octets (trame résultat + ETX + LRC).
      const start = buffer.indexOf(STX);
      if (start === -1) return;
      if (buffer.length - start < 24) return;
      const end = buffer.indexOf(ETX, start + 1);
      if (end === -1) return;
      const payload = buffer.subarray(start + 1, end).toString('ascii');
      try {
        settle(resolve, interpretConcertResponse(payload));
      } catch (err) {
        settle(reject, err);
      }
    });

    // Certains firmwares ferment la connexion juste après avoir écrit la
    // réponse - on traite ce qui a déjà été reçu plutôt que de perdre la
    // réponse en attendant un timeout.
    socket.once('close', () => {
      if (settled) return;
      const start = buffer.indexOf(STX);
      const end = buffer.indexOf(ETX, start + 1);
      if (start !== -1 && end !== -1) {
        const payload = buffer.subarray(start + 1, end).toString('ascii');
        try {
          settle(resolve, interpretConcertResponse(payload));
        } catch (err) {
          settle(reject, err);
        }
      }
    });

    socket.on('error', (err) => settle(reject, err));
  });
}

module.exports = { buildConcertFrame, parseConcertResponse, interpretConcertResponse, concertCharge, computeLrc, RESULT_LABELS };