// « Je veux seulement un supplement » : le client ne choisit aucune prestation, seulement des supplements.
// Tout le reste de l'application (creneaux, file, Timer, caisse, stats) est construit autour d'UNE prestation : on utilise
// donc une prestation cachee « Supplement seul » (0 min, 0 EUR), creee automatiquement pour chaque salon et jamais
// affichee dans les listes. Duree et prix = ceux des supplements choisis.
const EXTRAS_ONLY_KIND = 'extras_only';
const EXTRAS_ONLY_NAME = 'Supplément seul';

function extrasOnlyIdFor(salonId) { return 'supplement-seul-' + String(salonId).slice(0, 40); }

/** Identifiant de la prestation cachee du salon (creee au premier besoin). */
async function extrasOnlyServiceId(salonId, db) {
  db = db || require('../db').pool;
  const [[row]] = await db.query('SELECT id FROM services WHERE salon_id = ? AND system_kind = ? LIMIT 1', [salonId, EXTRAS_ONLY_KIND]);
  if (row) {
    // Toujours utilisable, meme si quelqu'un l'a archivee par erreur.
    await db.query('UPDATE services SET active = 1, deleted_at = NULL, duration_min = 0, price_cents = 0 WHERE id = ? AND (active = 0 OR deleted_at IS NOT NULL OR duration_min <> 0 OR price_cents <> 0)', [row.id]);
    return row.id;
  }
  const id = extrasOnlyIdFor(salonId);
  await db.query(
    'INSERT IGNORE INTO services (id, salon_id, name, duration_min, price_cents, active, sort_order, system_kind) VALUES (?, ?, ?, 0, 0, 1, 9999, ?)',
    [id, salonId, EXTRAS_ONLY_NAME, EXTRAS_ONLY_KIND]
  );
  return id;
}

/**
 * Prestation demandee : celle envoyee, ou - aucune prestation mais au moins un supplement - la prestation cachee.
 * Renvoie { id } ou { error } (ni prestation ni supplement).
 */
async function resolveServiceId(salonId, serviceId, extraIds, db) {
  const extras = Array.isArray(extraIds) ? extraIds.filter(Boolean) : [];
  if (serviceId === '__extras__') serviceId = '';   // repere « seulement un supplement » envoye par les pages
  if (serviceId) return { id: String(serviceId) };
  if (!extras.length) return { error: 'Choisissez une prestation, ou au moins un supplément.' };
  return { id: await extrasOnlyServiceId(salonId, db) };
}

/** Libelle lisible : « Soin visage » pour un supplement seul, sinon « Coupe + Soin visage ». */
function serviceLabel(serviceName, extraNames, extrasOnly) {
  const ex = (extraNames || []).filter(Boolean);
  if ((extrasOnly || serviceName === EXTRAS_ONLY_NAME) && ex.length) return ex.join(', ');
  return String(serviceName || '') + (ex.length ? ' + ' + ex.join(', ') : '');
}

// Nom de prestation pour l'agenda (SQL) : la liste des supplements pour un « Supplement seul ».
// alias : table de la prestation (s) ; appt : table du RDV (a).
function serviceNameSql(s = 's', appt = 'a') {
  return `IF(${s}.system_kind IS NULL, ${s}.name, COALESCE((SELECT GROUP_CONCAT(xe.name ORDER BY xe.name SEPARATOR ', ') FROM appointment_extras xae JOIN extras xe ON xe.id = xae.extra_id WHERE xae.appointment_id = ${appt}.id), ${s}.name))`;
}

module.exports = { EXTRAS_ONLY_KIND, EXTRAS_ONLY_NAME, extrasOnlyServiceId, resolveServiceId, serviceLabel, serviceNameSql };
