const crypto = require('crypto');

// Chiffrement/déchiffrement AES-256-GCM des secrets stockés en base
// (mots de passe SMTP par salon et de la plateforme). Une fuite de la
// base ne doit pas exposer les accès email en clair - seule une lecture
// du process (et de SETTINGS_ENCRYPTION_KEY) permet de les déchiffrer.
//
// Format stocké : "enc:v1:<iv hex>:<tag hex>:<ciphertext hex>"
// Tout ce qui ne commence pas par "enc:v1:" est considéré comme une
// valeur legacy en clair (lues telles quelles ; elles sont re-chiffrées
// au moment où elles sont réécrites).
//
// Clé : process.env.SETTINGS_ENCRYPTION_KEY, passée dans scrypt avec un
// sel fixe applicatif. Si la variable est absente, une clé est dérivée
// du mot de passe de la base (DB_PASSWORD) : moins sûr qu'une clé
// dédiée, mais ne laisse jamais le chiffrement silencieusement désactivé
// et fonctionne sans nouvelle configuration chez les hébergements
// existants. Renseigner SETTINGS_ENCRYPTION_KEY est fortement
// recommandé (le changer invaliderait les secrets chiffrés, il suffit
// alors de re-sauvegarder les réglages SMTP).

const ALGO = 'aes-256-gcm';

let cachedKey = null;
function getKey() {
  if (cachedKey) return cachedKey;
  const secret = process.env.SETTINGS_ENCRYPTION_KEY || process.env.DB_PASSWORD || 'salon-queue-fallback-key';
  cachedKey = crypto.scryptSync(secret, 'salon-queue-settings-v1', 32);
  return cachedKey;
}

/** Chiffre une valeur en clair, ou renvoie la valeur telle quelle si vide. */
function encryptSecret(plain) {
  if (plain === undefined || plain === null || plain === '') return plain;
  if (typeof plain !== 'string') plain = String(plain);
  if (isEncrypted(plain)) return plain; // déjà chiffrée, ne pas double-chiffrer
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, getKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `enc:v1:${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`;
}

/** Déchiffre une valeur ; les valeurs legacy en clair sont renvoyées telles quelles. */
function decryptSecret(value) {
  if (value === undefined || value === null || value === '') return value;
  if (!isEncrypted(value)) return value; // legacy en clair - lu tel quel
  try {
    const [, , ivHex, tagHex, dataHex] = value.split(':');
    const decipher = crypto.createDecipheriv(ALGO, getKey(), Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    return Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]).toString('utf8');
  } catch (err) {
    // Jamais de levée d'exception ici : une clé changée par erreur ne
    // doit pas planter tout l'envoi d'emails, juste échouer à envoyer
    // (message d'erreur SMTP explicite côté envoi).
    console.error('[crypto] déchiffrement d\'un secret impossible (clé changée ?):', err.message);
    return '';
  }
}

function isEncrypted(value) {
  return typeof value === 'string' && value.startsWith('enc:v1:');
}

module.exports = { encryptSecret, decryptSecret, isEncrypted };