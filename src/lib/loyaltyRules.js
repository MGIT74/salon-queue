'use strict';

// Fidélité à DEUX paliers séparés : un nombre de points pour une remise PRESTATION, un autre pour une
// remise PRODUIT (ex. 10 et 15). Le client gagne 1 point par passage payé ; ses points s'accumulent.
// Dès qu'il atteint un palier, la remise correspondante est disponible ; l'utiliser retire les points
// de CE palier (une remise prestation à 10 points fait passer de 16 à 6 points).
//
// Avant : un seul palier (loyalty_threshold) qui transformait les points en « récompenses » à utiliser
// au choix. Ces anciennes récompenses sont reconverties en points une seule fois (convertLegacyRewards).

const { pool, getOwnerSettings } = require('../db');

function thresholdsFrom(settings) {
  const s = settings || {};
  const legacy = Math.max(1, Number(s.loyalty_threshold) || 10);
  const pick = (v) => { const n = Number(v); return Number.isFinite(n) && n >= 1 ? Math.round(n) : legacy; };
  return { service: pick(s.loyalty_service_threshold), product: pick(s.loyalty_product_threshold) };
}

async function thresholdsForOwner(ownerId) {
  return thresholdsFrom(await getOwnerSettings(ownerId));
}

async function thresholdsForSalon(salonId) {
  const [[salon]] = await pool.query('SELECT owner_id FROM salons WHERE id = ?', [salonId]);
  return salon ? thresholdsForOwner(salon.owner_id) : thresholdsFrom({});
}

/** Ce que ce nombre de points débloque. */
function rewardsFor(points, t) {
  const p = Number(points) || 0;
  return { service: p >= t.service, product: p >= t.product };
}

/**
 * Reconversion unique des anciennes « récompenses » en points (récompenses × ancien palier), pour que
 * personne ne perde ce qu'il avait gagné. Sans effet une fois faite (plus aucune récompense en attente).
 */
async function convertLegacyRewards() {
  const [rows] = await pool.query(
    'SELECT la.id, la.points, la.rewards_available, s.owner_id FROM loyalty_accounts la JOIN salons s ON s.id = la.salon_id WHERE la.rewards_available > 0'
  );
  const cache = {};
  for (const r of rows) {
    if (!cache[r.owner_id]) cache[r.owner_id] = await getOwnerSettings(r.owner_id);
    const legacy = Math.max(1, Number(cache[r.owner_id].loyalty_threshold) || 10);
    await pool.query(
      'UPDATE loyalty_accounts SET points = points + ?, rewards_available = 0 WHERE id = ? AND rewards_available = ?',
      [r.rewards_available * legacy, r.id, r.rewards_available]
    );
  }
  return rows.length;
}

module.exports = { thresholdsFrom, thresholdsForOwner, thresholdsForSalon, rewardsFor, convertLegacyRewards };
