const crypto = require('crypto');

// Jetons d'assistance : permettent au super admin d'ouvrir le dashboard
// d'une enseigne cliente sans connaître son mot de passe, pour du
// dépannage. Scopés par ENSEIGNE (owner), pas par salon précis — sinon
// changer de salon via le sélecteur pendant une session d'assistance
// invaliderait le jeton, alors que le vrai mot de passe, lui, est
// partagé par tous les salons de l'enseigne. Stockage en mémoire (pas
// de table dédiée) : ces jetons sont volontairement éphémères (10 min)
// et perdus si le serveur redémarre — c'est un outil de support
// ponctuel, pas un mécanisme d'accès durable.
const store = new Map(); // token -> { ownerId, expires }
const TTL_MS = 10 * 60 * 1000;

function createToken(ownerId) {
  const token = crypto.randomBytes(24).toString('hex');
  store.set(token, { ownerId, expires: Date.now() + TTL_MS });
  return token;
}

function validateToken(token, ownerId) {
  const entry = store.get(token);
  if (!entry) return false;
  if (Date.now() > entry.expires) {
    store.delete(token);
    return false;
  }
  return entry.ownerId === ownerId;
}

module.exports = { createToken, validateToken };
