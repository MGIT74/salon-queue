const crypto = require('crypto');
const { pool } = require('../db');

/**
 * Clé(s) d'API dédiée(s) à l'automatisation (n8n, projets futurs...) -
 * totalement séparées du mot de passe humain SUPER_ADMIN_PASSWORD.
 * Plusieurs clés actives possibles (une par intégration), chacune
 * révocable indépendamment sans affecter les autres. Jamais la valeur
 * en clair stockée : seule une empreinte SHA-256 est comparée.
 */
async function requireAutomationKey(req, res, next) {
  const given = (req.get('X-Automation-Key') || '').replace(/[\r\n]+$/, '').trim();
  if (!given) return res.status(401).json({ error: "Clé d'automatisation manquante" });

  const hash = crypto.createHash('sha256').update(given).digest('hex');

  try {
    const [[row]] = await pool.query(
      'SELECT id FROM api_keys WHERE key_hash = ? AND revoked_at IS NULL',
      [hash]
    );
    if (!row) return res.status(401).json({ error: "Clé d'automatisation invalide" });

    // Horodatage du dernier usage - purement informatif pour le super
    // admin, jamais bloquant si ça échoue.
    pool.query('UPDATE api_keys SET last_used_at = NOW() WHERE id = ?', [row.id]).catch(() => {});

    next();
  } catch (err) {
    console.error('[automationAuth]', err);
    res.status(500).json({ error: 'Erreur de vérification de la clé' });
  }
}

module.exports = requireAutomationKey;
