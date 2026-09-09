'use strict';

/**
 * TLV Parser pour les réponses de l'API locale Nepting.
 *
 * Décode une trame brute en une succession de tags {tag, value}, sans
 * aucune interprétation métier (succès/échec, etc. -> voir payment.service).
 *
 * Reste robuste si le TPE ajoute des tags non prévus dans cette liste :
 * la doc précise explicitement que "des balises supplémentaires pourraient
 * être envoyées par le terminal de paiement POS dans le cadre de réponse".
 */

const KNOWN_RESPONSE_TAGS = [
  'CZ', 'CJ', 'AC', 'AE', 'AF', 'CA', 'CB', 'CC', 'CD', 'CE', 'CF', 'CG', 'CK', 'AK',
];

/**
 * Parse une trame TLV brute.
 * @param {string} raw - trame reçue du TPE
 * @returns {{
 *   tags: Record<string,string>,
 *   order: Array<{tag:string, value:string}>,
 *   unknownTags: string[]
 * }}
 */
function parseTlvFrame(raw) {
  if (typeof raw !== 'string' || raw.length === 0) {
    throw new Error('Trame malformée : réponse vide ou invalide');
  }

  const tags = {};
  const order = [];
  const unknownTags = [];
  const seen = new Set();

  let cursor = 0;
  while (cursor < raw.length) {
    // Il faut au moins 5 caractères (2 tag + 3 longueur) pour lire un en-tête
    if (cursor + 5 > raw.length) {
      throw new Error(
        `Trame malformée : en-tête de tag incomplet à la position ${cursor}`
      );
    }

    const tag = raw.slice(cursor, cursor + 2);
    const lengthStr = raw.slice(cursor + 2, cursor + 5);

    if (!/^[A-Za-z]{2}$/.test(tag)) {
      throw new Error(`Trame malformée : tag invalide "${tag}" à la position ${cursor}`);
    }
    if (!/^\d{3}$/.test(lengthStr)) {
      throw new Error(
        `Trame malformée : longueur invalide "${lengthStr}" pour le tag ${tag} à la position ${cursor}`
      );
    }

    const length = parseInt(lengthStr, 10);
    if (length <= 0) {
      throw new Error(`Trame malformée : longueur nulle pour le tag ${tag} (doit être > 0)`);
    }

    const valueStart = cursor + 5;
    const valueEnd = valueStart + length;
    if (valueEnd > raw.length) {
      throw new Error(
        `Trame malformée : longueur annoncée (${length}) pour le tag ${tag} dépasse les données disponibles`
      );
    }

    const value = raw.slice(valueStart, valueEnd);

    // Doc : "une information (étiquette) ne doit apparaître qu'une seule fois"
    if (seen.has(tag)) {
      throw new Error(`Trame malformée : le tag ${tag} apparaît plusieurs fois`);
    }
    seen.add(tag);

    tags[tag] = value;
    order.push({ tag, value });

    if (!KNOWN_RESPONSE_TAGS.includes(tag)) {
      unknownTags.push(tag);
    }

    cursor = valueEnd;
  }

  return { tags, order, unknownTags };
}

module.exports = { parseTlvFrame, KNOWN_RESPONSE_TAGS };
