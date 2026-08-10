const { pool, utcIso, getOwnerSettings } = require('../db');

// Clé de rapprochement d'un client : email en priorité, sinon téléphone,
// sinon nom — il n'existe pas de fiche client dédiée dans ce modèle,
// donc on rapproche du mieux possible sur ce qui a été saisi au check-in.
function clientKey(row) {
  return String(row.email || row.phone || row.client_name || '').trim().toLowerCase();
}

/**
 * +1 point de fidélité pour ce client, cumulé au niveau du SALON (pas
 * de toute l'enseigne) - un client qui va dans un autre salon de la
 * même enseigne y suit son propre parcours, sans lien avec cet
 * historique-ci. Tous les 10 points, une récompense s'ajoute
 * (utilisable à partir du PROCHAIN passage, pas celui-ci). Appelée à
 * chaque fois qu'un passage est réellement payé (paiement normal ou
 * cadeau utilisé) — jamais pour une simple vente de comptoir sans lien
 * avec un passage.
 *
 * IMPORTANT : ne fait RIEN tant que le client n'a pas explicitement
 * activé sa carte (activated_at) — le coiffeur doit lui avoir demandé
 * son accord au préalable. Un client jamais activé n'accumule jamais
 * le moindre point, même s'il revient plusieurs fois.
 */
async function earnLoyaltyPoint(salonId, row) {
  const key = clientKey(row);
  if (!key) return;

  const [[existing]] = await pool.query(
    'SELECT id, points, rewards_available, activated_at FROM loyalty_accounts WHERE salon_id = ? AND client_key = ?',
    [salonId, key]
  );
  if (!existing || !existing.activated_at) return;

  const [[salon]] = await pool.query('SELECT owner_id FROM salons WHERE id = ?', [salonId]);
  const settings = await getOwnerSettings(salon.owner_id);
  const threshold = Math.max(1, Number(settings.loyalty_threshold) || 10);

  let points = existing.points + 1;
  let rewards = existing.rewards_available;
  if (points >= threshold) { points -= threshold; rewards += 1; }

  await pool.query(
    'UPDATE loyalty_accounts SET points = ?, rewards_available = ?, client_name = ?, updated_at = NOW() WHERE id = ?',
    [points, rewards, row.client_name, existing.id]
  );
}

/**
 * Charge la file d'UN salon pour les statuts demandés (par défaut :
 * attente + en cours) avec leur prestation, leurs suppléments, la durée
 * totale et le prix total. `onlyUnpaid` restreint aux entrées pas
 * encore encaissées (utilisé pour la liste "en attente d'encaissement"
 * de la caisse, sur les entrées 'done').
 */
async function loadQueue(salonId, statuses, onlyUnpaid) {
  statuses = statuses || ['waiting', 'in_progress'];
  const statusPlaceholders = statuses.map(() => '?').join(',');
  const [[rows], [services], [extras], [links], [notes], [svcPrices], [extPrices], [gifts], [loyaltyRows]] = await Promise.all([
    pool.query(
      `SELECT * FROM queue WHERE salon_id = ? AND status IN (${statusPlaceholders})` +
      (onlyUnpaid ? ' AND paid_at IS NULL' : '') +
      ' ORDER BY checkin_at',
      [salonId, ...statuses]
    ),
    pool.query('SELECT * FROM services WHERE salon_id = ?', [salonId]),
    pool.query('SELECT * FROM extras WHERE salon_id = ?', [salonId]),
    pool.query(
      `SELECT qe.* FROM queue_extras qe
       JOIN queue q ON q.id = qe.queue_id
       WHERE q.salon_id = ?`,
      [salonId]
    ),
    pool.query('SELECT client_key, note FROM client_notes WHERE salon_id = ?', [salonId]),
    pool.query(
      `SELECT bsp.barber_id, bsp.service_id, bsp.price_cents, bsp.duration_min FROM barber_service_prices bsp
       JOIN barbers b ON b.id = bsp.barber_id WHERE b.salon_id = ?`,
      [salonId]
    ),
    pool.query(
      `SELECT bep.barber_id, bep.extra_id, bep.price_cents, bep.duration_min FROM barber_extra_prices bep
       JOIN barbers b ON b.id = bep.barber_id WHERE b.salon_id = ?`,
      [salonId]
    ),
    pool.query('SELECT * FROM gift_cards WHERE salon_id = ? AND used_at IS NULL', [salonId]),
    pool.query('SELECT client_key, rewards_available FROM loyalty_accounts WHERE salon_id = ? AND rewards_available > 0', [salonId])
  ]);

  const svcById = Object.fromEntries(services.map((s) => [s.id, s]));
  const extById = Object.fromEntries(extras.map((e) => [e.id, e]));
  const noteByKey = Object.fromEntries(notes.map((n) => [n.client_key, n.note]));

  // Rapprochement cadeau/fidélité — disponible pour QUI QUE CE SOIT qui
  // regarde ce client (Mon poste, dashboard, caisse), pas seulement au
  // moment de payer.
  const giftByKey = {};
  gifts.forEach((g) => {
    const gKey = clientKey({ email: g.recipient_email, phone: g.recipient_phone, client_name: g.recipient_name });
    if (gKey) {
      let giftItems = [];
      try { giftItems = JSON.parse(g.items_json || '[]'); } catch (e) { giftItems = []; }
      giftByKey[gKey] = { id: g.id, amount_cents: g.amount_cents, items: giftItems };
    }
  });
  const loyaltyByKey = Object.fromEntries(loyaltyRows.map((l) => [l.client_key, l.rewards_available]));

  // Prix/durée personnalisés par coiffeur (remplacent le tarif par défaut
  // du catalogue quand définis) — clé "barberId:itemId" pour un accès direct.
  const svcOverrideByKey = Object.fromEntries(svcPrices.map((p) => [p.barber_id + ':' + p.service_id, p]));
  const extOverrideByKey = Object.fromEntries(extPrices.map((p) => [p.barber_id + ':' + p.extra_id, p]));

  return rows.map((r) => {
    const rawChosen = links
      .filter((l) => l.queue_id === r.id)
      .map((l) => extById[l.extra_id])
      .filter(Boolean);

    const service = svcById[r.service_id] || { name: 'Prestation', duration_min: 30, price_cents: 0 };
    const svcOverride = r.barber_id ? svcOverrideByKey[r.barber_id + ':' + service.id] : null;
    const svcPrice = (svcOverride && svcOverride.price_cents !== null) ? svcOverride.price_cents : service.price_cents;
    const svcDuration = (svcOverride && svcOverride.duration_min !== null) ? svcOverride.duration_min : service.duration_min;
    const effectiveService = Object.assign({}, service, { price_cents: svcPrice, duration_min: svcDuration });

    const chosen = rawChosen.map((e) => {
      const extOverride = r.barber_id ? extOverrideByKey[r.barber_id + ':' + e.id] : null;
      const extPrice = (extOverride && extOverride.price_cents !== null) ? extOverride.price_cents : e.price_cents;
      const extDuration = (extOverride && extOverride.duration_min !== null) ? extOverride.duration_min : e.duration_min;
      return Object.assign({}, e, { price_cents: extPrice, duration_min: extDuration });
    });

    const duration = svcDuration + chosen.reduce((a, e) => a + e.duration_min, 0);
    const price = svcPrice + chosen.reduce((a, e) => a + e.price_cents, 0);
    const key = clientKey(r);

    return Object.assign({}, r, {
      position: r.queue_position,
      checkin_at: utcIso(r.checkin_at),
      start_at: utcIso(r.start_at),
      end_at: utcIso(r.end_at),
      service: effectiveService,
      extras: chosen,
      total_duration_min: duration,
      total_price_cents: price,
      note: (key && noteByKey[key]) || ''
    });
  });
}

/**
 * Nombre de coiffeurs réellement en poste maintenant pour CE salon,
 * d'après leurs horaires. Sans horaire, tous les coiffeurs actifs comptent.
 */
async function activeBarberCount(salonId) {
  const [[barbers], [schedules], [leaves]] = await Promise.all([
    pool.query('SELECT id FROM barbers WHERE salon_id = ? AND active = 1', [salonId]),
    pool.query(
      `SELECT bs.* FROM barber_schedules bs
       JOIN barbers b ON b.id = bs.barber_id
       WHERE b.salon_id = ? AND bs.active = 1`,
      [salonId]
    ),
    pool.query(
      `SELECT bl.barber_id FROM barber_leaves bl
       JOIN barbers b ON b.id = bl.barber_id
       WHERE b.salon_id = ? AND CURDATE() BETWEEN bl.start_date AND bl.end_date`,
      [salonId]
    )
  ]);

  const onLeaveIds = new Set(leaves.map((l) => l.barber_id));
  const available = barbers.filter((b) => !onLeaveIds.has(b.id));

  if (available.length === 0) return 1;
  if (schedules.length === 0) return available.length;

  const now = new Date();
  const weekday = now.getDay();
  const hhmm = now.toTimeString().slice(0, 8);

  const onDuty = available.filter((b) =>
    schedules.some((s) =>
      s.barber_id === b.id && s.weekday === weekday && s.start_time <= hhmm && hhmm < s.end_time
    )
  );

  return Math.max(onDuty.length, 1);
}

/**
 * Recalcule position et temps d'attente estimé pour toute la file d'UN
 * salon. Répartit les clients sur la voie (coiffeur) qui se libère le
 * plus tôt.
 */
async function recompute(salonId) {
  const rows = await loadQueue(salonId);
  const lanes = new Array(await activeBarberCount(salonId)).fill(0);
  const now = Date.now();

  // Marge minimale affichée tant qu'une coupe est en cours, même en cas de
  // dépassement de la durée prévue : afficher "0 min" laisserait croire que
  // le coiffeur est déjà libre alors qu'il est encore en train de couper.
  const OVERRUN_BUFFER_MIN = 5;

  rows.filter((r) => r.status === 'in_progress').forEach((r) => {
    const elapsedMin = r.start_at ? (now - new Date(r.start_at).getTime()) / 60000 : 0;
    const remaining = r.total_duration_min - elapsedMin;
    const left = remaining > 0 ? remaining : OVERRUN_BUFFER_MIN;
    const i = lanes.indexOf(Math.min(...lanes));
    lanes[i] += left;
  });

  const waiting = rows.filter((r) => r.status === 'waiting');
  const active = rows.filter((r) => r.status === 'in_progress');
  const updates = [];

  waiting.forEach((r, idx) => {
    const i = lanes.indexOf(Math.min(...lanes));
    updates.push({
      id: r.id,
      position: idx + 1,
      estimated_wait_min: Math.round(lanes[i]),
      total_duration_min: r.total_duration_min,
      total_price_cents: r.total_price_cents
    });
    lanes[i] += r.total_duration_min;
  });

  // Les coupes en cours n'ont pas de position, mais leur durée/prix totaux
  // (prestation + suppléments ajoutés en route) doivent aussi être persistés,
  // sinon les stats du jour et le prix affiché au dashboard restent à zéro.
  active.forEach((r) => {
    updates.push({
      id: r.id,
      position: null,
      estimated_wait_min: null,
      total_duration_min: r.total_duration_min,
      total_price_cents: r.total_price_cents
    });
  });

  for (const u of updates) {
    await pool.query(
      `UPDATE queue SET queue_position = ?, estimated_wait_min = ?,
       total_duration_min = ?, total_price_cents = ? WHERE id = ? AND salon_id = ?`,
      [u.position, u.estimated_wait_min, u.total_duration_min, u.total_price_cents, u.id, salonId]
    );
  }

  return updates;
}

module.exports = { loadQueue, recompute, activeBarberCount, clientKey, earnLoyaltyPoint };
