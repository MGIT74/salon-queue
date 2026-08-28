const crypto = require('crypto');
const { pool } = require('../db');

// Jetons d'assistance : permettent au super admin d'ouvrir le dashboard
// d'une enseigne cliente sans connaître son mot de passe, pour du
// dépannage. Scopés par ENSEIGNE (owner), pas par salon précis — sinon
// changer de salon via le sélecteur pendant une session d'assistance
// invaliderait le jeton, alors que le vrai mot de passe, lui, est
// partagé par tous les salons de l'enseigne.
//
// Stockés en BASE DE DONNÉES (pas en mémoire du process Node) : un
// jeton doit rester valide 10 minutes même si le serveur redémarre ou
// est redéployé entre-temps - ce qui arrive fréquemment en phase de
// développement actif. Un stockage en mémoire perdait silencieusement
// les jetons à chaque redémarrage, rendant l'assistance intermittente
// sans erreur visible.
const TTL_MS = 10 * 60 * 1000;

async function createToken(ownerId) {
  const token = crypto.randomBytes(24).toString('hex');
  const expiresAt = new Date(Date.now() + TTL_MS);
  await pool.query(
    'INSERT INTO impersonation_tokens (token, owner_id, expires_at) VALUES (?, ?, ?)',
    [token, ownerId, expiresAt]
  );
  return token;
}

async function validateToken(token, ownerId) {
  if (!token) return false;
  const [[row]] = await pool.query(
    'SELECT owner_id FROM impersonation_tokens WHERE token = ? AND expires_at > NOW()',
    [token]
  );
  if (!row) return false;
  return row.owner_id === ownerId;
}

module.exports = { createToken, validateToken };
