const { pool } = require('../db');
const { verifyPassword, timingSafeStringEqual } = require('../lib/password');
const { validateToken } = require('../lib/impersonation');
const { isBlocked, recordFailure, recordSuccess } = require('./rateLimiter');

// Autorise soit le mot de passe admin du salon courant (contrôle total),
// soit une authentification coiffeur par code PIN — limitée à son propre
// périmètre, utilisée depuis "Mon poste" sur le téléphone du coiffeur.
// resolveSalon doit s'exécuter avant ce middleware pour poser req.salon.
// Pose req.barberId quand c'est une session coiffeur (pas admin).
//
// Rate limiting : le PIN est court (4-8 chiffres) et se vérifie sur
// chaque appel d'API de cette famille de routes — sans compteur, un
// script pouvait deviner un PIN en boucle sur n'importe quelle route
// GET (seul POST /api/barbers/login était protégé). Même mécanisme que
// auth.js : compteur par salon + IP, blocage temporaire au-delà du
// seuil. Une authentification réussie (PIN ou mot de passe) remet le
// compteur à zéro.
module.exports = async function requireAdminOrBarber(req, res, next) {
  if (!req.salon) {
    return res.status(500).json({ error: 'Salon non résolu (resolveSalon manquant en amont)' });
  }

  const impersonateToken = req.get('X-Impersonate-Token');
  if (impersonateToken && await validateToken(impersonateToken, req.ownerId)) {
    return next();
  }

  const ip = req.ip || (req.connection && req.connection.remoteAddress) || 'unknown';
  const rlKey = 'barber-or-admin:' + req.salon.owner_id + ':' + ip;
  const retryAfterSec = isBlocked(rlKey);
  if (retryAfterSec) {
    res.set('Retry-After', String(retryAfterSec));
    return res.status(429).json({
      error: 'Trop de tentatives, réessayez dans ' + Math.ceil(retryAfterSec / 60) + ' min.'
    });
  }

  // Plus de fallback ?pw= dans l'URL (fuite dans les logs serveur,
  // l'historique navigateur et l'en-tête Referer) - en-tête dédié
  // uniquement, comme sur les routes requireAdmin depuis longtemps.
  const given = req.get('X-Admin-Password') || '';

  if (req.salon.owner_password_hash) {
    if (await verifyPassword(given, req.salon.owner_password_hash)) {
      recordSuccess(rlKey);
      return next();
    }
  } else {
    const adminPw = (req.salon.owner_admin_password || '').replace(/[\r\n]+$/, '').trim();
    if (adminPw && timingSafeStringEqual(given, adminPw)) {
      recordSuccess(rlKey);
      return next();
    }
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
        recordSuccess(rlKey);
        req.barberId = barber.id;
        // Sélecteur par bulle (caisse partagée) : une fois qu'UN coiffeur
        // s'est authentifié par son propre code PIN (ci-dessus), la
        // tablette reste "ouverte" pour la journée - n'importe quel autre
        // coiffeur peut ensuite se désigner comme agissant "pour lui"
        // sans retaper de code, en envoyant son id dans cet en-tête. On
        // vérifie seulement qu'il existe bien et appartient à ce salon
        // (pas son PIN - la sécurité vient du fait que la session
        // d'origine, elle, a bien été authentifiée par un PIN valide).
        // Par défaut (en-tête absent - toutes les pages qui n'ont pas ce
        // sélecteur, comme "Mon poste"), on retombe sur le coiffeur
        // authentifié lui-même : aucun changement de comportement pour
        // elles.
        const actingAsId = req.get('X-Acting-As-Barber-Id');
        if (actingAsId && actingAsId !== barber.id) {
          const [[actingAs]] = await pool.query(
            'SELECT id FROM barbers WHERE id = ? AND salon_id = ? AND active = 1 LIMIT 1',
            [actingAsId, req.salon.id]
          );
          req.actingBarberId = actingAs ? actingAs.id : barber.id;
        } else {
          req.actingBarberId = barber.id;
        }
        return next();
      }
    } catch (err) {
      console.error(err);
    }
  }

  // Ni mot de passe admin, ni couple id/PIN coiffeur valide : échec
  // d'authentification, comptabilisé pour le blocage progressif.
  recordFailure(rlKey);
  return res.status(401).json({ error: 'Authentification requise' });
};