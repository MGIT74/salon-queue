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
      ? `SELECT s.*, o.admin_password AS owner_admin_password, o.password_hash AS owner_password_hash,
                o.name AS owner_name, o.email_verified AS owner_email_verified
         FROM salons s JOIN owners o ON o.id = s.owner_id
         WHERE s.slug = ? AND s.active = 1 AND o.active = 1 LIMIT 1`
      : `SELECT s.*, o.admin_password AS owner_admin_password, o.password_hash AS owner_password_hash,
                o.name AS owner_name, o.email_verified AS owner_email_verified
         FROM salons s JOIN owners o ON o.id = s.owner_id
         WHERE s.is_default = 1 AND s.active = 1 AND o.active = 1 LIMIT 1`;
    const params = slug ? [slug] : [];
    const [[salon]] = await pool.query(sql, params);

    if (!salon) {
      return res.status(404).json({
        error: slug ? 'Salon introuvable' : "Aucun salon par défaut configuré"
      });
    }

    // req.salon expose déjà owner_admin_password directement (issu de
    // la requête SQL) - inutile et risqué de le recopier sous un autre
    // nom sur req.salon, un objet partagé par de nombreuses routes qui
    // pourrait un jour le sérialiser par erreur dans une réponse.
    req.salon = salon;
    req.ownerId = salon.owner_id;
    next();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};
