const crypto = require('crypto');
const { verifyPassword } = require('../lib/password');
const { validateToken } = require('../lib/impersonation');
const { isBlocked, recordFailure, recordSuccess } = require('./rateLimiter');

// Protection par mot de passe propre à chaque salon. Trois modes coexistent :
// - Jeton d'assistance (super admin, court terme, pour du dépannage)
// - Compte créé par inscription (email + mot de passe) : vérifié via hash
//   (owners.password_hash), jamais en clair.
// - Ancien mode "mot de passe partagé" (super admin / ajout manuel de
//   salon) : comparaison directe à owners.admin_password, conservé pour
//   compatibilité avec les comptes déjà provisionnés ainsi.
// resolveSalon doit s'exécuter avant ce middleware pour poser req.salon.
//
// Rate limiting : ce middleware protège TOUTES les routes admin (pas
// une simple route /login dédiée) - le mot de passe est donc vérifié à
// chaque appel d'API. Sans limite de tentatives ici, un script pourrait
// deviner le mot de passe en boucle sur n'importe quelle route GET,
// sans jamais être bloqué. Compteur par salon + IP : un salon bloqué ne
// gêne pas les autres.
function timingSafeStringEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) {
    // Comparaison quand même effectuée (contre bufA elle-même) pour ne
    // pas révéler la longueur via une sortie anticipée mesurable au timing.
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

module.exports = async function requireAdmin(req, res, next) {
  try {
    if (!req.salon) {
      return res.status(500).json({ error: 'Salon non résolu (resolveSalon manquant en amont)' });
    }

    const impersonateToken = req.get('X-Impersonate-Token');
    if (impersonateToken && await validateToken(impersonateToken, req.ownerId)) {
      return next();
    }

    const ip = req.ip || (req.connection && req.connection.remoteAddress) || 'unknown';
    const rlKey = 'admin:' + req.salon.owner_id + ':' + ip;
    const retryAfterSec = isBlocked(rlKey);
    if (retryAfterSec) {
      res.set('Retry-After', String(retryAfterSec));
      return res.status(429).json({
        error: 'Trop de tentatives, réessayez dans ' + Math.ceil(retryAfterSec / 60) + ' min.'
      });
    }

    // Le mot de passe n'est plus accepté via ?pw= dans l'URL : une
    // chaîne de requête finit dans les logs d'accès du serveur,
    // l'historique du navigateur et l'en-tête Referer envoyé à des
    // ressources tierces (polices, scripts...) - uniquement l'en-tête
    // dédié désormais.
    const given = req.get('X-Admin-Password') || '';

    if (req.salon.owner_password_hash) {
      const ok = await verifyPassword(given, req.salon.owner_password_hash);
      if (!ok) {
        recordFailure(rlKey);
        return res.status(401).json({ error: 'Mot de passe incorrect' });
      }
      // Uniquement pour les comptes créés par inscription (email_verified
      // n'a pas de sens pour les comptes provisionnés à l'ancienne, qui
      // n'ont pas de password_hash).
      if (req.salon.owner_email_verified === 0) {
        return res.status(403).json({
          error: 'Merci de confirmer votre email avant de vous connecter (vérifiez votre boîte de réception, et vos spams).'
        });
      }
      recordSuccess(rlKey);
      return next();
    }

    const expected = (req.salon.owner_admin_password || '').replace(/[\r\n]+$/, '').trim();
    if (!expected || !timingSafeStringEqual(given, expected)) {
      recordFailure(rlKey);
      return res.status(401).json({ error: 'Mot de passe incorrect' });
    }
    recordSuccess(rlKey);
    next();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};
