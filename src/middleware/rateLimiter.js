// Limiteur de tentatives de connexion, en mémoire (un seul process
// Node, pas de cluster ni de Redis nécessaire pour l'instant). Compte
// les échecs (mot de passe/code incorrect) par IP + par point de
// connexion protégé - au-delà d'un seuil, bloque temporairement les
// nouvelles tentatives, même avec le bon mot de passe (protection
// contre le "brute force" par essais automatisés).
//
// Une connexion réussie efface l'historique de tentatives pour cette
// IP sur ce point de connexion, pour ne jamais gêner un utilisateur
// légitime qui a fini par retrouver le bon mot de passe.

const attemptsByKey = new Map(); // "name:ip" -> { count, firstAt, blockedUntil }

function loginRateLimiter(name, opts) {
  const max = (opts && opts.max) || 8;
  const windowMs = (opts && opts.windowMs) || 15 * 60 * 1000;
  const blockMs = (opts && opts.blockMs) || 15 * 60 * 1000;

  return function (req, res, next) {
    const ip = req.ip || (req.connection && req.connection.remoteAddress) || 'unknown';
    const key = name + ':' + ip;
    const now = Date.now();
    let entry = attemptsByKey.get(key);

    if (entry && entry.blockedUntil && entry.blockedUntil > now) {
      const retryAfterSec = Math.ceil((entry.blockedUntil - now) / 1000);
      res.set('Retry-After', String(retryAfterSec));
      return res.status(429).json({
        error: 'Trop de tentatives, réessayez dans ' + Math.ceil(retryAfterSec / 60) + ' min.'
      });
    }

    // Fenêtre glissante expirée : on repart d'un compteur propre.
    if (entry && !entry.blockedUntil && now - entry.firstAt > windowMs) {
      entry = null;
    }

    const originalJson = res.json.bind(res);
    res.json = function (body) {
      if (res.statusCode === 401) {
        if (!entry) entry = { count: 0, firstAt: now };
        entry.count += 1;
        if (entry.count >= max) entry.blockedUntil = now + blockMs;
        attemptsByKey.set(key, entry);
      } else if (res.statusCode < 400) {
        attemptsByKey.delete(key);
      }
      return originalJson(body);
    };

    next();
  };
}

// Purge périodique pour ne pas laisser grossir la Map indéfiniment.
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of attemptsByKey) {
    const stale = (!entry.blockedUntil || entry.blockedUntil < now) && now - entry.firstAt > 60 * 60 * 1000;
    if (stale) attemptsByKey.delete(key);
  }
}, 10 * 60 * 1000).unref();

module.exports = { loginRateLimiter };
