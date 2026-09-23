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
// auth.js, mais avec DEUX compteurs distincts par IP :
// - "pin:{salon}:{ip}"    : échecs de code PIN, compteur PAR SALON —
//   c'est le PIN qui est propre à chaque salon, donc un blocage ne
//   doit jamais gêner un autre salon de la même enseigne ;
// - "admin:{owner}:{ip}"  : échecs de mot de passe admin, compteur par
//   ENSEIGNE (le mot de passe est partagé par tous les salons).
// Un échec PIN ne nourrit que le compteur PIN du salon concerné, et
// réciproquement pour le mot de passe : les deux risques sont isolés.
module.exports = async function requireAdminOrBarber(req, res, next) {
  if (!req.salon) {
    return res.status(500).json({ error: 'Salon non résolu (resolveSalon manquant en amont)' });
  }

  const impersonateToken = req.get('X-Impersonate-Token');
  if (impersonateToken && await validateToken(impersonateToken, req.ownerId)) {
    return next();
  }

  const ip = req.ip || (req.connection && req.connection.remoteAddress) || 'unknown';
  const pinRlKey = 'pin:' + req.salon.id + ':' + ip;
  const adminRlKey = 'admin:' + req.salon.owner_id + ':' + ip;

  // Le mot de passe admin donne le contrôle total sur toute l'enseigne :
  // si son compteur est bloqué (tentatives répétées du mauvais mot de
  // passe), on refuse tout de suite, même si un PIN valide est fourni.
  // En revanche un blocage du compteur PIN n'empêche PAS une connexion
  // admin par mot de passe (le PIN est un secret plus faible, son
  // compteur ne doit pas pouvoir bloquer le propriétaire).
  const adminBlockedFor = isBlocked(adminRlKey);
  if (adminBlockedFor) {
    res.set('Retry-After', String(adminBlockedFor));
    return res.status(429).json({
      error: 'Trop de tentatives, réessayez dans ' + Math.ceil(adminBlockedFor / 60) + ' min.'
    });
  }

  // Plus de fallback ?pw= dans l'URL (fuite dans les logs serveur,
  // l'historique navigateur et l'en-tête Referer) - en-tête dédié
  // uniquement, comme sur les routes requireAdmin depuis longtemps.
  const given = req.get('X-Admin-Password') || '';

  if (req.salon.owner_password_hash) {
    if (await verifyPassword(given, req.salon.owner_password_hash)) {
      recordSuccess(adminRlKey);
      recordSuccess(pinRlKey);
      return next();
    }
  } else {
    const adminPw = (req.salon.owner_admin_password || '').replace(/[\r\n]+$/, '').trim();
    if (adminPw && timingSafeStringEqual(given, adminPw)) {
      recordSuccess(adminRlKey);
      recordSuccess(pinRlKey);
      return next();
    }
  }

  const barberId = req.get('X-Barber-Id');
  const barberPin = req.get('X-Barber-Pin');
  if (barberId && barberPin) {
    // Tentative PIN : bloquée uniquement si le compteur PIN de CE salon
    // est lui-même au-delà du seuil (pas le compteur admin).
    const pinBlockedFor = isBlocked(pinRlKey);
    if (pinBlockedFor) {
      res.set('Retry-After', String(pinBlockedFor));
      return res.status(429).json({
        error: 'Trop de tentatives, réessayez dans ' + Math.ceil(pinBlockedFor / 60) + ' min.'
      });
    }
    try {
      const [[barber]] = await pool.query(
        'SELECT id FROM barbers WHERE id = ? AND salon_id = ? AND pin_code = ? AND active = 1 LIMIT 1',
        [barberId, req.salon.id, barberPin]
      );
      if (barber) {
        recordSuccess(pinRlKey);
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

  // Ni mot de passe admin, ni couple id/PIN coiffeur valide. On nourrit
  // le compteur du secret effectivement testé : un PIN fourni ne compte
  // que pour le salon concerné (le blocage reste local à ce salon), un
  // échec "mot de passe admin" seul compte pour l'enseigne.
  if (barberId && barberPin) {
    recordFailure(pinRlKey);
  } else {
    recordFailure(adminRlKey);
  }
  return res.status(401).json({ error: 'Authentification requise' });
};