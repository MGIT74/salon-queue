const { pool } = require('../db');

/**
 * Un identifiant de salon est-il deja pris ? Il l'est s'il est l'identifiant ACTUEL d'un salon OU l'ANCIEN identifiant
 * d'un salon (alias) : un ancien identifiant reste reserve, sinon un nouveau salon pourrait le reprendre et detourner
 * tous les liens deja distribues. `exceptSalonId` : ignorer ce salon (changer l'identifiant de CE salon, y compris
 * revenir a l'un de ses anciens identifiants).
 */
async function slugTaken(slug, exceptSalonId) {
  const except = exceptSalonId || null;
  const [[current]] = await pool.query(
    'SELECT id FROM salons WHERE slug = ? AND (? IS NULL OR id <> ?) LIMIT 1', [slug, except, except]
  );
  if (current) return true;
  const [[alias]] = await pool.query(
    'SELECT salon_id FROM salon_slug_aliases WHERE slug = ? AND (? IS NULL OR salon_id <> ?) LIMIT 1', [slug, except, except]
  );
  return Boolean(alias);
}

module.exports = { slugTaken };
