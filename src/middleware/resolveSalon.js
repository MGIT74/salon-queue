const { pool } = require('../db');

// Résout le salon courant à partir de l'en-tête X-Salon-Slug (envoyé par
// le navigateur d'après le paramètre ?salon=... de l'URL). Sans en-tête,
// on retombe sur le salon marqué "par défaut" — rétro-compatibilité avec
// les bornes déjà configurées avant l'ajout du multi-salon.
module.exports = async function resolveSalon(req, res, next) {
  try {
    const slug = (req.get('X-Salon-Slug') || '').trim();
    const sql = slug
      ? 'SELECT * FROM salons WHERE slug = ? AND active = 1 LIMIT 1'
      : 'SELECT * FROM salons WHERE is_default = 1 AND active = 1 LIMIT 1';
    const params = slug ? [slug] : [];
    const [[salon]] = await pool.query(sql, params);

    if (!salon) {
      return res.status(404).json({
        error: slug ? 'Salon introuvable' : "Aucun salon par défaut configuré"
      });
    }
    req.salon = salon;
    next();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};
