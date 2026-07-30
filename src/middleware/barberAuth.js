const { pool } = require('../db');
const { verifyPassword } = require('../lib/password');
const { validateToken } = require('../lib/impersonation');

// Autorise soit le mot de passe admin du salon courant (contrôle total),
// soit une authentification coiffeur par code PIN — limitée à son propre
// périmètre, utilisée depuis "Mon poste" sur le téléphone du coiffeur.
// resolveSalon doit s'exécuter avant ce middleware pour poser req.salon.
// Pose req.barberId quand c'est une session coiffeur (pas admin).
module.exports = async function requireAdminOrBarber(req, res, next) {
  if (!req.salon) {
    return res.status(500).json({ error: 'Salon non résolu (resolveSalon manquant en amont)' });
  }

  const impersonateToken = req.get('X-Impersonate-Token');
  if (impersonateToken && validateToken(impersonateToken, req.ownerId)) {
    return next();
  }

  const given = req.get('X-Admin-Password') || req.query.pw || '';

  if (req.salon.owner_password_hash) {
    if (await verifyPassword(given, req.salon.owner_password_hash)) return next();
  } else {
    const adminPw = (req.salon.admin_password || '').replace(/[\r\n]+$/, '').trim();
    if (adminPw && given === adminPw) return next();
  }

  const barberId = req.get('X-Barber-Id');
  const barberPin = req.get('X-Barber-Pin');
  if (barberId && barberPin) {
    try {
      const [[barber]] = await pool.query(
        'SELECT id FROM barbers WHERE id = ? AND salon_id = ? AND pin_code = ? AND active = 1 LIMIT 1',
        [barberId, req.salon.id, barberPin]
      );
      if (barber) {
        req.barberId = barber.id;
        return next();
      }
    } catch (err) {
      console.error(err);
    }
  }

  return res.status(401).json({ error: 'Authentification requise' });
};
