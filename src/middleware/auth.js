// Protection par mot de passe propre à chaque salon (stocké en base,
// table salons.admin_password), envoyé dans l'en-tête X-Admin-Password.
// resolveSalon doit s'exécuter avant ce middleware pour poser req.salon.
module.exports = function requireAdmin(req, res, next) {
  if (!req.salon) {
    return res.status(500).json({ error: 'Salon non résolu (resolveSalon manquant en amont)' });
  }
  const expected = (req.salon.admin_password || '').replace(/[\r\n]+$/, '').trim();
  const given = req.get('X-Admin-Password') || req.query.pw;
  if (!expected || given !== expected) {
    return res.status(401).json({ error: 'Mot de passe incorrect' });
  }
  next();
};
