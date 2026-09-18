const crypto = require('crypto');
const { pool } = require('../db');

/**
 * Enregistre une ligne dans le journal d'activité (Paramètres > Journal
 * d'activité côté dashboard). Volontairement "best effort" : un souci
 * d'écriture du journal ne doit jamais faire échouer l'action métier
 * elle-même - on tente l'insert, une éventuelle erreur est seulement
 * loggée côté serveur, jamais remontée à l'appelant.
 *
 * @param {string} salonId
 * @param {string} action - code court stable (ex: 'catalog_create'),
 *   utile pour un futur filtrage/icône, pas affiché tel quel.
 * @param {string} description - phrase déjà en français, prête à
 *   afficher (ex: 'Prestation "Coupe homme" créée').
 * @param {string} [actor] - qui a fait l'action ; 'Admin' par défaut,
 *   car les routes actuellement journalisées sont toutes protégées par
 *   le mot de passe admin partagé (pas d'identité individuelle).
 */
async function logActivity(salonId, action, description, actor) {
  try {
    await pool.query(
      'INSERT INTO activity_log (id, salon_id, actor, action, description) VALUES (?, ?, ?, ?, ?)',
      [crypto.randomUUID(), salonId, actor || 'Admin', action, description]
    );
  } catch (err) {
    console.error('logActivity a échoué (ignoré, ne bloque pas la requête) :', err.message);
  }
}

module.exports = { logActivity };
