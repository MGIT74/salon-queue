/**
 * Tickets imprimés (Z, reçus...) : texte SANS accents, lisible sur toutes les imprimantes thermiques.
 *
 * Chaque salon a sa marque d'imprimante, et chacune range les lettres accentuées à sa façon (table de caractères) :
 * un « é » envoyé à la mauvaise table sortait en lettre russe « В » (« Bquipe » au lieu de « équipe »). On remplace
 * donc avant l'envoi au pont : é -> e, À -> A, ç -> c, œ -> oe, € -> EUR, guillemets et tirets typographiques -> leurs
 * équivalents simples. Il ne reste que des caractères ASCII, imprimés pareil partout. Le pont n'a pas à être mis à jour.
 */
const SPECIAL = {
  'œ': 'oe', 'Œ': 'OE', 'æ': 'ae', 'Æ': 'AE', 'ß': 'ss', 'ø': 'o', 'Ø': 'O', 'ł': 'l', 'Ł': 'L', 'đ': 'd', 'Đ': 'D',
  '€': 'EUR', '£': 'GBP', '’': "'", '‘': "'", '‚': "'", '´': "'", '`': "'", '“': '"', '”': '"', '„': '"', '«': '"', '»': '"',
  '–': '-', '—': '-', '−': '-', '…': '...', '•': '-', '·': '.', '×': 'x', '°': 'o', ' ': ' ', ' ': ' ', ' ': ' '
};

function asciiTicket(text) {
  let out = '';
  for (const ch of String(text || '')) {
    if (ch.charCodeAt(0) < 128) { out += ch; continue; }
    if (SPECIAL[ch] !== undefined) { out += SPECIAL[ch]; continue; }
    // Lettre accentuée : la lettre de base (é -> e + accent, on garde e).
    const base = ch.normalize('NFD').replace(/[̀-ͯ]/g, '');
    out += /^[\x00-\x7F]+$/.test(base) ? base : '?';
  }
  return out;
}

module.exports = { asciiTicket };
