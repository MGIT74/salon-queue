/**
 * Offre réelle d'un coiffeur pour une prestation (+ suppléments) : c'est LA source de vérité pour réserver.
 *  - la prestation et les suppléments doivent exister dans le salon, être actifs et non supprimés ;
 *  - un coiffeur qui ne réalise pas la prestation (ou un supplément) est refusé ;
 *  - prix et durée = tarif personnalisé du coiffeur (barber_service_prices / barber_extra_prices) quand il
 *    existe, sinon le tarif du catalogue — exactement la règle de queueMath (file d'attente, caisse).
 * Sans coiffeur (« premier disponible »), on renvoie le tarif du catalogue : l'appelant doit refaire le calcul
 * pour chaque coiffeur candidat avec offerFor().
 */
const { pool } = require('../db');

function fail(status, error) { return { ok: false, status, error }; }

async function loadCatalog(salonId, serviceId, extraIds, db) {
  db = db || pool;
  const ids = Array.isArray(extraIds) ? extraIds.map(String).filter(Boolean) : [];
  if (new Set(ids).size !== ids.length) return fail(400, 'Supplément en double');
  const [[service]] = await db.query(
    'SELECT id, name, duration_min, price_cents FROM services WHERE id = ? AND salon_id = ? AND active = 1 AND deleted_at IS NULL',
    [serviceId, salonId]
  );
  if (!service) return fail(404, 'Prestation introuvable ou plus proposée');
  let extras = [];
  if (ids.length) {
    const [rows] = await db.query(
      'SELECT id, name, duration_min, price_cents FROM extras WHERE id IN (?) AND salon_id = ? AND active = 1 AND deleted_at IS NULL',
      [ids, salonId]
    );
    if (rows.length !== ids.length) return fail(400, 'Supplément invalide ou indisponible dans ce salon');
    const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
    extras = ids.map((id) => byId[id]);
  }
  return { ok: true, service, extras };
}

/** Applique les règles d'UN coiffeur à un catalogue déjà chargé. */
async function offerFor(barberId, cat, db) {
  db = db || pool;
  const extraIds = cat.extras.map((e) => e.id);
  const [[svcExcl]] = await db.query(
    'SELECT 1 AS x FROM barber_service_exclusions WHERE barber_id = ? AND service_id = ?', [barberId, cat.service.id]
  );
  if (svcExcl) return fail(409, 'Ce coiffeur ne réalise pas cette prestation');
  if (extraIds.length) {
    const [extExcl] = await db.query(
      'SELECT extra_id FROM barber_extra_exclusions WHERE barber_id = ? AND extra_id IN (?)', [barberId, extraIds]
    );
    if (extExcl.length) return fail(409, 'Ce coiffeur ne réalise pas un des suppléments choisis');
  }
  const [[svcOvr]] = await db.query(
    'SELECT price_cents, duration_min FROM barber_service_prices WHERE barber_id = ? AND service_id = ?', [barberId, cat.service.id]
  );
  const [extOvr] = extraIds.length
    ? await db.query('SELECT extra_id, price_cents, duration_min FROM barber_extra_prices WHERE barber_id = ? AND extra_id IN (?)', [barberId, extraIds])
    : [[]];
  const ovrById = Object.fromEntries(extOvr.map((o) => [o.extra_id, o]));
  const pick = (o, k, dflt) => (o && o[k] !== null && o[k] !== undefined ? Number(o[k]) : Number(dflt));
  const svcDuration = pick(svcOvr, 'duration_min', cat.service.duration_min);
  const svcPrice = pick(svcOvr, 'price_cents', cat.service.price_cents);
  const extras = cat.extras.map((e) => Object.assign({}, e, {
    duration_min: pick(ovrById[e.id], 'duration_min', e.duration_min),
    price_cents: pick(ovrById[e.id], 'price_cents', e.price_cents)
  }));
  return {
    ok: true,
    service: cat.service,
    extras,
    durationMin: svcDuration + extras.reduce((a, e) => a + e.duration_min, 0),
    priceCents: svcPrice + extras.reduce((a, e) => a + e.price_cents, 0)
  };
}

/** Catalogue + règles du coiffeur en un appel (barberId facultatif). */
async function resolveOffer(salonId, barberId, serviceId, extraIds, db) {
  const cat = await loadCatalog(salonId, serviceId, extraIds, db);
  if (!cat.ok) return cat;
  if (!barberId) {
    return Object.assign({}, cat, {
      durationMin: Number(cat.service.duration_min) + cat.extras.reduce((a, e) => a + Number(e.duration_min), 0),
      priceCents: Number(cat.service.price_cents) + cat.extras.reduce((a, e) => a + Number(e.price_cents), 0)
    });
  }
  return offerFor(barberId, cat, db);
}

module.exports = { loadCatalog, offerFor, resolveOffer };
