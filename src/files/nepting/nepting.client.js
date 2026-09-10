'use strict';

const net = require('net');
const { buildPaymentRequest } = require('./tlv.builder');
const { parseTlvFrame } = require('./tlv.parser');

/**
 * Client TCP pour l'API locale Nepting / HiPay POS.
 *
 * ⚠️ POINT LE PLUS SENSIBLE DE CE MODULE :
 * la documentation Nepting NE PRÉCISE PAS comment déterminer qu'une trame
 * de réponse est complète. Elle indique uniquement, dans la section
 * dépannage, qu'il ne faut PAS attendre un CR/LF. Aucune longueur totale
 * de trame n'est annoncée, aucun délimiteur n'est documenté.
 *
 * Ce module implémente donc DEUX stratégies de secours, choisies via
 * config.connection.framingStrategy ('idle' par défaut) :
 *
 *  - 'idle'  : on considère la réponse complète après idleTimeoutMs sans
 *              nouvelle donnée reçue. Fonctionne même si le TPE garde la
 *              connexion ouverte, mais introduit un délai artificiel.
 *  - 'close' : on attend que le TPE ferme lui-même la connexion après
 *              avoir envoyé sa réponse. Plus fiable SI le TPE se comporte
 *              ainsi, mais ce comportement n'est pas garanti par la doc.
 *
 * -> À valider empiriquement avec le vrai terminal avant mise en
 *    production, et à ajuster via la configuration si besoin.
 */

class NeptingClient {
  /**
   * @param {{host: string, port: number}} terminalConfig
   * @param {object} connectionConfig - config.connection (voir nepting.config.js)
   */
  constructor(terminalConfig, connectionConfig) {
    if (!terminalConfig || !terminalConfig.host || !terminalConfig.port) {
      throw new Error('Configuration du TPE invalide (host/port manquants)');
    }
    this.host = terminalConfig.host;
    this.port = terminalConfig.port;
    this.connectionConfig = connectionConfig;
  }

  /**
   * Envoie une trame TLV déjà construite et résout avec la trame de
   * réponse brute (string). Aucune interprétation métier ici.
   *
   * @param {string} rawFrame
   * @returns {Promise<string>}
   */
  sendFrame(rawFrame) {
    const { connectTimeoutMs, responseTimeoutMs, framingStrategy, idleTimeoutMs } =
      this.connectionConfig;

    return new Promise((resolve, reject) => {
      const socket = new net.Socket();
      const responseChunks = [];
      let settled = false;
      let idleTimer = null;
      let responseTimer = null;

      const cleanup = () => {
        if (idleTimer) clearTimeout(idleTimer);
        if (responseTimer) clearTimeout(responseTimer);
        socket.removeAllListeners();
        socket.destroy();
      };

      const finish = (err, data) => {
        if (settled) return;
        settled = true;
        cleanup();
        if (err) reject(err);
        else resolve(data);
      };

      // Timeout de connexion (avant que 'connect' ne se déclenche)
      socket.setTimeout(connectTimeoutMs);
      socket.once('timeout', () => {
        finish(new Error(`Timeout de connexion au TPE (${this.host}:${this.port})`));
      });

      socket.once('error', (err) => {
        finish(
          new Error(`Erreur réseau avec le TPE (${this.host}:${this.port}) : ${err.message}`)
        );
      });

      socket.connect(this.port, this.host, () => {
        // Connexion établie : on désactive le timeout de connexion et on
        // démarre le timeout global d'attente de réponse.
        socket.setTimeout(0);
        responseTimer = setTimeout(() => {
          finish(new Error('Timeout : aucune réponse complète reçue du TPE'));
        }, responseTimeoutMs);

        socket.write(rawFrame, 'ascii');
      });

      socket.on('data', (chunk) => {
        responseChunks.push(chunk);

        if (framingStrategy === 'idle') {
          if (idleTimer) clearTimeout(idleTimer);
          idleTimer = setTimeout(() => {
            finish(null, Buffer.concat(responseChunks).toString('ascii'));
          }, idleTimeoutMs);
        }
        // Si framingStrategy === 'close', on ne fait rien ici : on attend
        // que le TPE ferme la connexion (voir 'close' ci-dessous).
      });

      socket.once('close', () => {
        if (settled) return;
        // Que la stratégie soit 'close' (comportement attendu) ou 'idle'
        // (le TPE a fermé avant l'expiration de idleTimeoutMs), on renvoie
        // ce qui a été reçu plutôt que de perdre la réponse.
        finish(null, Buffer.concat(responseChunks).toString('ascii'));
      });
    });
  }

  /**
   * Construit une trame de paiement, l'envoie, et retourne la réponse déjà
   * décodée en tags (mais sans interprétation métier).
   * @param {object} paymentParams - voir tlv.builder.buildPaymentRequest
   */
  async requestPayment(paymentParams) {
    const rawFrame = buildPaymentRequest(paymentParams);
    const rawResponse = await this.sendFrame(rawFrame);
    if (!rawResponse || rawResponse.length === 0) {
      throw new Error('Réponse vide reçue du TPE');
    }
    return parseTlvFrame(rawResponse);
  }
}

module.exports = NeptingClient;
