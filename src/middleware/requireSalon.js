const { pool } = require('../db');

// Combien de salons actifs la plateforme heberge-t-elle ? Des qu'il y en a plusieurs, une adresse SANS nom de salon
// est ambigue : sans cette precaution elle retombait sur le salon "par defaut" (celui que la base cree toute seule
// au premier demarrage, affiche "Le Salon") et permettait d'y creer un compte client - ou d'y reserver - sans que
// la personne sache dans quel salon.
async function countActiveSalons() {
  const [[r]] = await pool.query(
    'SELECT COUNT(*) AS n FROM salons s JOIN owners o ON o.id = s.owner_id WHERE s.active = 1 AND o.active = 1'
  );
  return r.n;
}

/**
 * Refuse un appel qui ne precise pas son salon (en-tete X-Salon-Slug, pose par les pages d'apres ?salon=...) quand
 * la plateforme en heberge plusieurs. Une installation a UN seul salon garde le comportement historique (salon par
 * defaut) : rien ne change pour elle.
 */
async function requireExplicitSalon(req, res, next) {
  try {
    if ((req.get('X-Salon-Slug') || '').trim()) return next();
    if ((await countActiveSalons()) <= 1) return next();
    res.status(400).json({
      error: "Salon non précisé : utilisez le lien fourni par votre salon.",
      needs_salon: true
    });
  } catch (err) {
    console.error('[requireExplicitSalon]', err);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
}

module.exports = { requireExplicitSalon, countActiveSalons };
