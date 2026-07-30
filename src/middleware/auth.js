const { verifyPassword } = require('../lib/password');
const { validateToken } = require('../lib/impersonation');

// Protection par mot de passe propre à chaque salon. Trois modes coexistent :
// - Jeton d'assistance (super admin, court terme, pour du dépannage)
// - Compte créé par inscription (email + mot de passe) : vérifié via hash
//   (owners.password_hash), jamais en clair.
// - Ancien mode "mot de passe partagé" (super admin / ajout manuel de
//   salon) : comparaison directe à owners.admin_password, conservé pour
//   compatibilité avec les comptes déjà provisionnés ainsi.
// resolveSalon doit s'exécuter avant ce middleware pour poser req.salon.
module.exports = async function requireAdmin(req, res, next) {
  try {
    if (!req.salon) {
      return res.status(500).json({ error: 'Salon non résolu (resolveSalon manquant en amont)' });
    }

    const impersonateToken = req.get('X-Impersonate-Token');
    if (impersonateToken && validateToken(impersonateToken, req.ownerId)) {
      return next();
    }

    const given = req.get('X-Admin-Password') || req.query.pw || '';

    if (req.salon.owner_password_hash) {
      const ok = await verifyPassword(given, req.salon.owner_password_hash);
      if (!ok) return res.status(401).json({ error: 'Mot de passe incorrect' });
      return next();
    }

    const expected = (req.salon.admin_password || '').replace(/[\r\n]+$/, '').trim();
    if (!expected || given !== expected) {
      return res.status(401).json({ error: 'Mot de passe incorrect' });
    }
    next();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};
