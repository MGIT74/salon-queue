const { pool } = require('../db');

// Résout le salon courant à partir de l'en-tête X-Salon-Slug (envoyé par
// le navigateur d'après le paramètre ?salon=... de l'URL). Sans en-tête,
// on retombe sur le salon marqué "par défaut" — rétro-compatibilité avec
// les bornes déjà configurées avant l'ajout du multi-salon.
//
// Le mot de passe admin est celui du PROPRIÉTAIRE (chaîne de salons),
// pas du salon individuellement : plusieurs salons d'une même enseigne
// partagent le même accès.
module.exports = async function resolveSalon(req, res, next) {
  try {
    const slug = (req.get('X-Salon-Slug') || '').trim();
    const sql = slug
      ? `SELECT s.*, o.admin_password AS owner_admin_password, o.name AS owner_name
         FROM salons s JOIN owners o ON o.id = s.owner_id
         WHERE s.slug = ? AND s.active = 1 LIMIT 1`
      : `SELECT s.*, o.admin_password AS owner_admin_password, o.name AS owner_name
         FROM salons s JOIN owners o ON o.id = s.owner_id
         WHERE s.is_default = 1 AND s.active = 1 LIMIT 1`;
    const params = slug ? [slug] : [];
    const [[salon]] = await pool.query(sql, params);

    if (!salon) {
      return res.status(404).json({
        error: slug ? 'Salon introuvable' : "Aucun salon par défaut configuré"
      });
    }

    // requireAdmin lit req.salon.admin_password : on le fait pointer vers
    // le mot de passe partagé du propriétaire, sans toucher requireAdmin.
    salon.admin_password = salon.owner_admin_password;
    req.salon = salon;
    req.ownerId = salon.owner_id;
    next();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};
