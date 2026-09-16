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

const DEFAULTS = { max: 8, windowMs: 15 * 60 * 1000, blockMs: 15 * 60 * 1000 };

/**
 * Renvoie le nombre de secondes avant déblocage si `key` est
 * actuellement bloquée, sinon 0. À appeler AVANT de vérifier le mot de
 * passe, pour ne même pas exposer d'oracle de timing sur la
 * vérification elle-même une fois bloqué.
 */
function isBlocked(key) {
  const entry = attemptsByKey.get(key);
  if (entry && entry.blockedUntil && entry.blockedUntil > Date.now()) {
    return Math.ceil((entry.blockedUntil - Date.now()) / 1000);
  }
  return 0;
}

/** À appeler après un échec de mot de passe/code pour `key`. */
function recordFailure(key, opts) {
  const { max, windowMs, blockMs } = Object.assign({}, DEFAULTS, opts);
  const now = Date.now();
  let entry = attemptsByKey.get(key);
  if (entry && !entry.blockedUntil && now - entry.firstAt > windowMs) entry = null;
  if (!entry) entry = { count: 0, firstAt: now };
  entry.count += 1;
  if (entry.count >= max) entry.blockedUntil = now + blockMs;
  attemptsByKey.set(key, entry);
}

/** À appeler après une connexion réussie pour `key` (repart à zéro). */
function recordSuccess(key) {
  attemptsByKey.delete(key);
}

/**
 * Middleware Express pour une route de login dédiée (POST /login) :
 * bloque avant traitement si déjà au-delà du seuil, et observe le
 * code de statut de la réponse pour compter échecs/succès
 * automatiquement. Implémenté au-dessus des mêmes primitives que
 * ci-dessus, pour que les tentatives faites via une route /login et
 * celles faites directement sur une route protégée par
 * requireAdmin/requireSuperAdmin (qui appellent isBlocked/recordFailure
 * directement) comptent dans le même compteur si la clé est la même.
 */
function loginRateLimiter(name, opts) {
  return function (req, res, next) {
    const ip = req.ip || (req.connection && req.connection.remoteAddress) || 'unknown';
    const key = name + ':' + ip;

    const retryAfterSec = isBlocked(key);
    if (retryAfterSec) {
      res.set('Retry-After', String(retryAfterSec));
      return res.status(429).json({
        error: 'Trop de tentatives, réessayez dans ' + Math.ceil(retryAfterSec / 60) + ' min.'
      });
    }

    const originalJson = res.json.bind(res);
    res.json = function (body) {
      if (res.statusCode === 401) recordFailure(key, opts);
      else if (res.statusCode < 400) recordSuccess(key);
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

module.exports = { loginRateLimiter, isBlocked, recordFailure, recordSuccess };
