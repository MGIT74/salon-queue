// Protection simple par mot de passe partagé, envoyé dans l'en-tête X-Admin-Password.
// Suffisant pour une tablette posée dans le salon ; pour du multi-utilisateur
// avec traçabilité, passer à un système d'authentification par compte.
module.exports = function requireAdmin(req, res, next) {
  const expected = (process.env.ADMIN_PASSWORD || '').replace(/[\r\n]+$/, '').trim();
  if (!expected) {
    return res.status(500).json({ error: 'ADMIN_PASSWORD non défini côté serveur' });
  }
  const given = req.get('X-Admin-Password') || req.query.pw;
  if (given !== expected) {
    return res.status(401).json({ error: 'Mot de passe incorrect' });
  }
  next();
};
