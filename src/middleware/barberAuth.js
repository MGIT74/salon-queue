const { pool } = require('../db');

// Autorise soit le mot de passe admin classique (contrôle total), soit une
// authentification coiffeur par code PIN — limitée à son propre périmètre,
// utilisée depuis "Mon poste" sur le téléphone du coiffeur. Pose
// req.barberId quand c'est une session coiffeur (pas admin), pour que la
// route puisse restreindre l'action à ses propres clients.
module.exports = async function requireAdminOrBarber(req, res, next) {
  const adminPw = (process.env.ADMIN_PASSWORD || '').replace(/[\r\n]+$/, '').trim();
  const given = req.get('X-Admin-Password') || req.query.pw;
  if (adminPw && given === adminPw) {
    return next();
  }

  const barberId = req.get('X-Barber-Id');
  const barberPin = req.get('X-Barber-Pin');
  if (barberId && barberPin) {
    try {
      const [[barber]] = await pool.query(
        'SELECT id FROM barbers WHERE id = ? AND pin_code = ? AND active = 1 LIMIT 1',
        [barberId, barberPin]
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
