const crypto = require('crypto');
const { pool } = require('../db');
const { verifyPassword, hashPassword, timingSafeStringEqual } = require('../lib/password');
const { validateToken } = require('../lib/impersonation');
const { isBlocked, recordFailure, recordSuccess } = require('./rateLimiter');

// Protection par mot de passe propre à chaque salon. Trois modes coexistent :
// - Jeton d'assistance (super admin, court terme, pour du dépannage)
// - Compte créé par inscription (email + mot de passe) : vérifié via hash
//   (owners.password_hash), jamais en clair.
// - Ancien mode "mot de passe partagé" (super admin / ajout manuel de
//   salon) : historiquement stocké en CLAIR dans owners.admin_password.
//   Ce stockage en clair n'est plus autorisé : à la première connexion
//   réussie en mode legacy, le mot de passe est haché en password_hash et
//   la colonne en clair est vidée (migration paresseuse, transparente pour
//   l'utilisateur). resolveSalon doit s'exécuter avant ce middleware pour
//   poser req.salon.
//
// Rate limiting : ce middleware protège TOUTES les routes admin (pas
// une simple route /login dédiée) - le mot de passe est donc vérifié à
// chaque appel d'API. Sans limite de tentatives ici, un script pourrait
// deviner le mot de passe en boucle sur n'importe quelle route GET,
// sans jamais être bloqué. Compteur par salon + IP : un salon bloqué ne
// gêne pas les autres.

/**
 * Vérifie le mot de passe fourni contre le hash du owner (prioritaire),
 * sinon contre l'ancien stockage en clair. En cas de succès en mode
 * legacy, hache le mot de passe et purge la valeur en clair — la base
 * converge progressivement vers un stockage 100 % haché, sans migration
 * disruptive ni changement de mot de passe pour personne.
 */
async function verifyOwnerPassword(salon, given) {
  if (salon.owner_password_hash) {
    return verifyPassword(given, salon.owner_password_hash);
  }
  const expected = (salon.owner_admin_password || '').replace(/[\r\n]+$/, '').trim();
  if (!expected || !timingSafeStringEqual(given, expected)) return false;
  try {
    const hash = await hashPassword(expected);
    await pool.query(
      'UPDATE owners SET password_hash = ?, admin_password = NULL WHERE id = ? AND (password_hash IS NULL OR password_hash = \'\')',
      [hash, salon.owner_id]
    );
  } catch (err) {
    // La migration paresseuse ne doit jamais faire échouer une connexion
    // par ailleurs valide - journalisé pour investigation, retenté à la
    // prochaine connexion tant que la colonne en clair n'est pas purgée.
    console.error('[auth] migration paresseuse du mot de passe échouée:', err.message);
  }
  return true;
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

    const ok = await verifyOwnerPassword(req.salon, given);
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
  } catch (err) {
    console.error('[auth]', err);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
};

// Vérification "douce" du mot de passe admin, sans bloquer la requête
// si elle échoue - utilisée pour inclure ou non des informations
// sensibles (email/téléphone client) selon que l'appelant est
// authentifié ou non, sur une route par ailleurs publique (kiosque,
// écran d'affichage en salle).
module.exports.verifyOwnerPassword = verifyOwnerPassword;
