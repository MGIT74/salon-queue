const crypto = require('crypto');

// Jetons d'assistance : permettent au super admin d'ouvrir le dashboard
// d'une enseigne cliente sans connaître son mot de passe, pour du
// dépannage. Stockage en mémoire (pas de table dédiée) : ces jetons sont
// volontairement éphémères (10 min) et perdus si le serveur redémarre —
// c'est un outil de support ponctuel, pas un mécanisme d'accès durable.
const store = new Map(); // token -> { salonId, expires }
const TTL_MS = 10 * 60 * 1000;

function createToken(salonId) {
  const token = crypto.randomBytes(24).toString('hex');
  store.set(token, { salonId, expires: Date.now() + TTL_MS });
  return token;
}

function validateToken(token, salonId) {
  const entry = store.get(token);
  if (!entry) return false;
  if (Date.now() > entry.expires) {
    store.delete(token);
    return false;
  }
  return entry.salonId === salonId;
}

module.exports = { createToken, validateToken };
