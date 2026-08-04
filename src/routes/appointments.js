const express = require('express');
const crypto = require('crypto');
const { pool, utcIso } = require('../db');
const requireAdmin = require('../middleware/auth');
const { sendAppointmentConfirmation } = require('../lib/mailer');

const router = express.Router();

function wrap(fn) {
  return function (req, res) {
    fn(req, res).catch((err) => {
      console.error(err);
      res.status(500).json({ error: err.message });
    });
  };
}

const SLOT_STEP_MIN = 15;

function timeToMinutes(t) {
  const [h, m] = String(t).split(':').map(Number);
  return h * 60 + m;
}
function minutesToTime(mins) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
}

/**
 * Calcule les créneaux disponibles d'UN coiffeur pour une date et une
 * durée données — à partir de ses horaires (barber_schedules), ses
 * congés (barber_leaves), et les RDV déjà pris ce jour-là. Ne tient
 * PAS compte de la file d'attente en temps réel (les passages sans
 * RDV sont par nature imprévisibles).
 */
async function computeSlotsForBarber(barberId, dateStr, durationMin) {
  const date = new Date(dateStr + 'T00:00:00Z');
  const weekday = date.getUTCDay(); // 0=dimanche ... 6=samedi

  const [[schedule]] = await pool.query(
    'SELECT start_time, end_time FROM barber_schedules WHERE barber_id = ? AND weekday = ? AND active = 1',
    [barberId, weekday]
  );
  if (!schedule) return [];

  const [[onLeave]] = await pool.query(
    'SELECT id FROM barber_leaves WHERE barber_id = ? AND ? BETWEEN start_date AND end_date',
    [barberId, dateStr]
  );
  if (onLeave) return [];

  const [existing] = await pool.query(
    `SELECT a.scheduled_at, s.duration_min AS svc_duration,
            COALESCE(SUM(e.duration_min), 0) AS extras_duration
     FROM appointments a
     JOIN services s ON s.id = a.service_id
     LEFT JOIN appointment_extras ae ON ae.appointment_id = a.id
     LEFT JOIN extras e ON e.id = ae.extra_id
     WHERE a.barber_id = ? AND a.status = 'confirmed' AND DATE(a.scheduled_at) = ?
     GROUP BY a.id`,
    [barberId, dateStr]
  );
  const busyRanges = existing.map((a) => {
    const start = timeToMinutes(a.scheduled_at.split(' ')[1].slice(0, 5));
    return [start, start + a.svc_duration + Number(a.extras_duration)];
  });

  const startMin = timeToMinutes(schedule.start_time);
  const endMin = timeToMinutes(schedule.end_time);
  const isToday = dateStr === new Date().toISOString().slice(0, 10);
  const nowMin = isToday ? new Date().getUTCHours() * 60 + new Date().getUTCMinutes() : -1;

  const slots = [];
  for (let t = startMin; t + durationMin <= endMin; t += SLOT_STEP_MIN) {
    if (isToday && t <= nowMin) continue;
    const overlaps = busyRanges.some(([bStart, bEnd]) => t < bEnd && t + durationMin > bStart);
    if (!overlaps) slots.push(minutesToTime(t));
  }
  return slots;
}

/**
 * Disponibilité — un coiffeur précis, ou "n'importe lequel" (union
 * des créneaux de tous les coiffeurs en mode RDV).
 */
router.get('/availability', wrap(async (req, res) => {
  const { date, service_id, barber_id } = req.query;
  if (!date || !service_id) return res.status(400).json({ error: 'date et service_id requis' });

  const [[service]] = await pool.query(
    'SELECT duration_min FROM services WHERE id = ? AND salon_id = ?', [service_id, req.salon.id]
  );
  if (!service) return res.status(404).json({ error: 'Prestation introuvable' });

  let extraDuration = 0;
  if (req.query.extras) {
    const extraIds = String(req.query.extras).split(',').filter(Boolean);
    if (extraIds.length) {
      const [rows] = await pool.query('SELECT duration_min FROM extras WHERE id IN (?)', [extraIds]);
      extraDuration = rows.reduce((a, r) => a + r.duration_min, 0);
    }
  }
  const durationMin = service.duration_min + extraDuration;

  if (barber_id) {
    const slots = await computeSlotsForBarber(barber_id, date, durationMin);
    return res.json({ ok: true, slots: slots.map((s) => ({ time: s, barber_id })) });
  }

  const [barbers] = await pool.query(
    'SELECT id FROM barbers WHERE salon_id = ? AND active = 1 AND accepts_appointments = 1', [req.salon.id]
  );
  const allSlots = {};
  for (const b of barbers) {
    const slots = await computeSlotsForBarber(b.id, date, durationMin);
    slots.forEach((s) => { if (!allSlots[s]) allSlots[s] = b.id; });
  }
  const merged = Object.keys(allSlots).sort().map((time) => ({ time, barber_id: allSlots[time] }));
  res.json({ ok: true, slots: merged });
}));

/**
 * Liste des rendez-vous à venir (admin) — pour une future vue
 * "Rendez-vous du jour" dans le dashboard.
 */
router.get('/', requireAdmin, wrap(async (req, res) => {
  const [rows] = await pool.query(
    `SELECT a.*, s.name AS service_name, b.name AS barber_name FROM appointments a
     LEFT JOIN services s ON s.id = a.service_id LEFT JOIN barbers b ON b.id = a.barber_id
     WHERE a.salon_id = ? AND a.status = 'confirmed' ORDER BY a.scheduled_at ASC LIMIT 200`,
    [req.salon.id]
  );
  res.json({
    ok: true,
    items: rows.map((r) => Object.assign({}, r, {
      scheduled_at: utcIso(r.scheduled_at),
      created_at: utcIso(r.created_at)
    }))
  });
}));

/**
 * Création d'un rendez-vous — public, comme le check-in kiosk. Si
 * pour AUJOURD'HUI, promeut immédiatement en entrée de file.
 */
router.post('/', wrap(async (req, res) => {
  const { client_name, email, phone, service_id, barber_id, extras, date, time } = req.body;
  if (!client_name) return res.status(400).json({ error: 'Le nom est requis' });
  if (!email) return res.status(400).json({ error: "L'email est requis pour la confirmation" });
  if (!service_id || !date || !time) return res.status(400).json({ error: 'Prestation, date et créneau requis' });

  const [[service]] = await pool.query(
    'SELECT name, duration_min FROM services WHERE id = ? AND salon_id = ?', [service_id, req.salon.id]
  );
  if (!service) return res.status(404).json({ error: 'Prestation introuvable' });

  let extraIds = Array.isArray(extras) ? extras : [];
  let extraDuration = 0;
  let extraNames = [];
  if (extraIds.length) {
    const [rows] = await pool.query('SELECT id, name, duration_min FROM extras WHERE id IN (?)', [extraIds]);
    extraDuration = rows.reduce((a, r) => a + r.duration_min, 0);
    extraNames = rows.map((r) => r.name);
  }
  const durationMin = service.duration_min + extraDuration;

  // Détermine le coiffeur final (précis, ou le premier disponible
  // parmi ceux en mode RDV pour ce créneau precis).
  let finalBarberId = barber_id || null;
  if (!finalBarberId) {
    const [barbers] = await pool.query(
      'SELECT id FROM barbers WHERE salon_id = ? AND active = 1 AND accepts_appointments = 1', [req.salon.id]
    );
    for (const b of barbers) {
      const slots = await computeSlotsForBarber(b.id, date, durationMin);
      if (slots.includes(time)) { finalBarberId = b.id; break; }
    }
    if (!finalBarberId) return res.status(409).json({ error: "Ce créneau n'est plus disponible" });
  } else {
    const slots = await computeSlotsForBarber(finalBarberId, date, durationMin);
    if (!slots.includes(time)) return res.status(409).json({ error: "Ce créneau n'est plus disponible" });
  }

  const id = crypto.randomUUID();
  const cancelToken = crypto.randomBytes(24).toString('hex');
  const scheduledAt = date + ' ' + time + ':00';

  await pool.query(
    `INSERT INTO appointments (id, salon_id, barber_id, client_name, email, phone, service_id, scheduled_at, status, cancel_token)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'confirmed', ?)`,
    [id, req.salon.id, finalBarberId, client_name, email, phone || null, service_id, scheduledAt, cancelToken]
  );
  if (extraIds.length) {
    await pool.query(
      'INSERT INTO appointment_extras (appointment_id, extra_id) VALUES ?',
      [extraIds.map((eid) => [id, eid])]
    );
  }

  const [[barber]] = finalBarberId
    ? await pool.query('SELECT name FROM barbers WHERE id = ?', [finalBarberId])
    : [[null]];

  const when = new Date(scheduledAt.replace(' ', 'T')).toLocaleString('fr-FR', {
    weekday: 'long', day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit'
  });

  try {
    await sendAppointmentConfirmation(req.salon.id, email, {
      clientName: client_name,
      when,
      serviceName: service.name + (extraNames.length ? ' + ' + extraNames.join(', ') : ''),
      barberName: barber ? barber.name : null,
      cancelUrl: String(req.body.base_url || '').replace(/\/$/, '') + '/rdv.html?cancel=' + cancelToken
    });
  } catch (err) {
    console.error('[rdv] envoi email de confirmation échoué:', err.message);
  }

  // Si c'est pour aujourd'hui, on le fait apparaître tout de suite
  // dans la file (verrouillé jusqu'à l'heure prévue côté interface).
  const today = new Date().toISOString().slice(0, 10);
  if (date === today) {
    await promoteAppointment({ id, salon_id: req.salon.id, barber_id: finalBarberId, client_name, email, phone, service_id, scheduled_at: scheduledAt }, extraIds);
  }

  res.json({ ok: true, id });
}));

/**
 * Annulation publique via le lien envoyé par email — retrouvé
 * uniquement par le token (le lien ne contient que ça, pas l'id).
 */
router.post('/cancel', wrap(async (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: 'Token requis' });

  const [[appt]] = await pool.query(
    'SELECT id, status, promoted_queue_id FROM appointments WHERE cancel_token = ?', [token]
  );
  if (!appt) return res.status(404).json({ error: 'Rendez-vous introuvable' });
  if (appt.status === 'cancelled') return res.status(409).json({ error: 'Ce rendez-vous est déjà annulé' });

  await pool.query('UPDATE appointments SET status = ? WHERE id = ?', ['cancelled', appt.id]);
  if (appt.promoted_queue_id) {
    await pool.query(
      "UPDATE queue SET status = 'cancelled' WHERE id = ? AND status IN ('waiting','in_progress')",
      [appt.promoted_queue_id]
    );
  }
  res.json({ ok: true });
}));

/**
 * Promeut une entrée d'appointment en vraie ligne de file — checkin_at
 * fixé à l'heure PREVUE (pas la date de création), ce qui la classe
 * naturellement au bon endroit dans la file (ni trop tôt, ni trop
 * tard) et verrouille "Commencer" côté interface tant que cette heure
 * n'est pas encore là.
 */
async function promoteAppointment(appt, extraIds) {
  const queueId = crypto.randomUUID();
  await pool.query(
    `INSERT INTO queue (id, salon_id, client_name, email, phone, service_id, barber_id, status, checkin_at, is_appointment)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'waiting', ?, 1)`,
    [queueId, appt.salon_id, appt.client_name, appt.email, appt.phone || null, appt.service_id, appt.barber_id, appt.scheduled_at]
  );
  if (extraIds && extraIds.length) {
    await pool.query(
      'INSERT INTO queue_extras (queue_id, extra_id) VALUES ?',
      [extraIds.map((eid) => [queueId, eid])]
    );
  }
  await pool.query('UPDATE appointments SET promoted_queue_id = ? WHERE id = ?', [queueId, appt.id]);
  return queueId;
}

/**
 * Promeut automatiquement tous les RDV du jour pas encore promus —
 * appelée à chaque chargement de la file (comme recompute()), pas
 * besoin de tâche planifiée séparée.
 */
async function promoteTodayAppointments(salonId) {
  const today = new Date().toISOString().slice(0, 10);
  const [rows] = await pool.query(
    `SELECT * FROM appointments
     WHERE salon_id = ? AND status = 'confirmed' AND promoted_queue_id IS NULL AND DATE(scheduled_at) = ?`,
    [salonId, today]
  );
  for (const appt of rows) {
    const [extraRows] = await pool.query('SELECT extra_id FROM appointment_extras WHERE appointment_id = ?', [appt.id]);
    await promoteAppointment(appt, extraRows.map((r) => r.extra_id));
  }
}

module.exports = { router, promoteTodayAppointments };
