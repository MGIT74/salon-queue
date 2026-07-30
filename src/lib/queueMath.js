const { pool, utcIso } = require('../db');

// Clé de rapprochement d'un client : email en priorité, sinon téléphone,
// sinon nom — il n'existe pas de fiche client dédiée dans ce modèle,
// donc on rapproche du mieux possible sur ce qui a été saisi au check-in.
function clientKey(row) {
  return String(row.email || row.phone || row.client_name || '').trim().toLowerCase();
}

/**
 * Charge la file complète d'UN salon (attente + en cours) avec leur
 * prestation, leurs suppléments, la durée totale et le prix total.
 */
async function loadQueue(salonId) {
  const [[rows], [services], [extras], [links], [notes]] = await Promise.all([
    pool.query(
      "SELECT * FROM queue WHERE salon_id = ? AND status IN ('waiting','in_progress') ORDER BY checkin_at",
      [salonId]
    ),
    pool.query('SELECT * FROM services WHERE salon_id = ?', [salonId]),
    pool.query('SELECT * FROM extras WHERE salon_id = ?', [salonId]),
    pool.query(
      `SELECT qe.* FROM queue_extras qe
       JOIN queue q ON q.id = qe.queue_id
       WHERE q.salon_id = ?`,
      [salonId]
    ),
    pool.query('SELECT client_key, note FROM client_notes WHERE salon_id = ?', [salonId])
  ]);

  const svcById = Object.fromEntries(services.map((s) => [s.id, s]));
  const extById = Object.fromEntries(extras.map((e) => [e.id, e]));
  const noteByKey = Object.fromEntries(notes.map((n) => [n.client_key, n.note]));

  return rows.map((r) => {
    const chosen = links
      .filter((l) => l.queue_id === r.id)
      .map((l) => extById[l.extra_id])
      .filter(Boolean);

    const service = svcById[r.service_id] || { name: 'Prestation', duration_min: 30, price_cents: 0 };
    const duration = service.duration_min + chosen.reduce((a, e) => a + e.duration_min, 0);
    const price = service.price_cents + chosen.reduce((a, e) => a + e.price_cents, 0);
    const key = clientKey(r);

    return Object.assign({}, r, {
      position: r.queue_position,
      checkin_at: utcIso(r.checkin_at),
      start_at: utcIso(r.start_at),
      end_at: utcIso(r.end_at),
      service,
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

module.exports = { loadQueue, recompute, activeBarberCount, clientKey };
