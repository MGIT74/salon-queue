const { pool } = require('../db');

/**
 * Charge la file complète (clients en attente et en cours) avec leur
 * prestation, leurs suppléments, la durée totale et le prix total.
 */
async function loadQueue() {
  const [[rows], [services], [extras], [links]] = await Promise.all([
    pool.query(
      "SELECT * FROM queue WHERE status IN ('waiting','in_progress') ORDER BY checkin_at"
    ),
    pool.query('SELECT * FROM services'),
    pool.query('SELECT * FROM extras'),
    pool.query('SELECT * FROM queue_extras')
  ]);

  const svcById = Object.fromEntries(services.map((s) => [s.id, s]));
  const extById = Object.fromEntries(extras.map((e) => [e.id, e]));

  return rows.map((r) => {
    const chosen = links
      .filter((l) => l.queue_id === r.id)
      .map((l) => extById[l.extra_id])
      .filter(Boolean);

    const service = svcById[r.service_id] || { name: 'Prestation', duration_min: 30, price_cents: 0 };
    const duration = service.duration_min + chosen.reduce((a, e) => a + e.duration_min, 0);
    const price = service.price_cents + chosen.reduce((a, e) => a + e.price_cents, 0);

    return Object.assign({}, r, {
      position: r.queue_position,
      service,
      extras: chosen,
      total_duration_min: duration,
      total_price_cents: price
    });
  });
}

/**
 * Nombre de coiffeurs réellement en poste maintenant, d'après les horaires.
 * Si aucun horaire n'est défini, on considère tous les coiffeurs actifs.
 */
async function activeBarberCount() {
  const [[barbers], [schedules]] = await Promise.all([
    pool.query('SELECT id FROM barbers WHERE active = 1'),
    pool.query('SELECT * FROM barber_schedules WHERE active = 1')
  ]);

  if (barbers.length === 0) return 1;
  if (schedules.length === 0) return barbers.length;

  const now = new Date();
  const weekday = now.getDay();
  const hhmm = now.toTimeString().slice(0, 8);

  const onDuty = barbers.filter((b) =>
    schedules.some((s) =>
      s.barber_id === b.id && s.weekday === weekday && s.start_time <= hhmm && hhmm < s.end_time
    )
  );

  return Math.max(onDuty.length, 1);
}

/**
 * Recalcule position et temps d'attente estimé pour toute la file.
 * Répartit les clients sur la voie (coiffeur) qui se libère le plus tôt.
 */
async function recompute() {
  const rows = await loadQueue();
  const lanes = new Array(await activeBarberCount()).fill(0);
  const now = Date.now();

  rows.filter((r) => r.status === 'in_progress').forEach((r) => {
    const elapsedMin = r.start_at ? (now - new Date(r.start_at).getTime()) / 60000 : 0;
    const left = Math.max(r.total_duration_min - elapsedMin, 0);
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
       total_duration_min = ?, total_price_cents = ? WHERE id = ?`,
      [u.position, u.estimated_wait_min, u.total_duration_min, u.total_price_cents, u.id]
    );
  }

  return updates;
}

module.exports = { loadQueue, recompute, activeBarberCount };
