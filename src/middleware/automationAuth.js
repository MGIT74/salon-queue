/**
 * Clé d'API dédiée à l'automatisation (n8n, IA...) - totalement
 * séparée du mot de passe humain SUPER_ADMIN_PASSWORD utilisé pour se
 * connecter au tableau de bord super admin. Si cette clé fuit ou doit
 * être changée, ça n'affecte jamais le mot de passe humain, et
 * inversement.
 */
function requireAutomationKey(req, res, next) {
  const expected = (process.env.AUTOMATION_API_KEY || '').replace(/[\r\n]+$/, '').trim();
  if (!expected) return res.status(500).json({ error: 'AUTOMATION_API_KEY non défini côté serveur' });
  const given = req.get('X-Automation-Key') || '';
  if (given !== expected) return res.status(401).json({ error: 'Clé d\'automatisation invalide' });
  next();
}

module.exports = requireAutomationKey;
