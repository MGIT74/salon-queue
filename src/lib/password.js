const crypto = require('crypto');
const { promisify } = require('util');
const scrypt = promisify(crypto.scrypt);

// scrypt plutôt que bcrypt : disponible nativement dans Node, aucune
// dépendance à ajouter/compiler.
async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = await scrypt(password, salt, 64);
  return salt + ':' + derived.toString('hex');
}

async function verifyPassword(password, stored) {
  if (!stored || !stored.includes(':')) return false;
  const [salt, hashHex] = stored.split(':');
  const derived = await scrypt(password, salt, 64);
  const storedBuf = Buffer.from(hashHex, 'hex');
  if (derived.length !== storedBuf.length) return false;
  return crypto.timingSafeEqual(derived, storedBuf);
}

// Comparaison en temps constant de deux chaînes (anti-oracle de timing).
// Longueurs différentes : une comparaison est quand même effectuée (contre
// bufA elle-même) pour ne pas révéler la longueur via une sortie anticipée
// mesurable au timing.
function timingSafeStringEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) {
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

module.exports = { hashPassword, verifyPassword, timingSafeStringEqual };
