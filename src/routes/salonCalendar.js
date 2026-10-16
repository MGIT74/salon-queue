const express = require('express');
const crypto = require('crypto');
const { pool, getSettings } = require('../db');
const requireAdmin = require('../middleware/auth');
const requireAdminOrBarber = require('../middleware/barberAuth');
const { sendSalonClosureNotice } = require('../lib/mailer');
const { wrap } = require('../lib/wrap');

const router = express.Router();

/**
 * Horaires généraux du salon (Réglages > Calendrier) - un modèle par
 * défaut indépendant des horaires propres à chaque coiffeur, jamais
 * utilisé pour calculer les créneaux de réservation (ça reste toujours
 * les horaires individuels de chaque coiffeur) - purement informatif/
 * affichage du salon dans son ensemble.
 */
router.get('/schedule', requireAdminOrBarber, wrap(async (req, res) => {
  const [rows] = await pool.query(
    'SELECT weekday, start_time, end_time, active FROM salon_schedules WHERE salon_id = ?',
    [req.salon.id]
  );
  res.json({ ok: true, schedules: rows });
}));

router.put('/schedule', requireAdmin, wrap(async (req, res) => {
  const list = Array.isArray(req.body.schedules) ? req.body.schedules : [];

  await pool.query('DELETE FROM salon_schedules WHERE salon_id = ?', [req.salon.id]);

  const rows = list
    .filter((s) => s.active && s.start_time && s.end_time)
    .map((s) => [crypto.randomUUID(), req.salon.id, Number(s.weekday), s.start_time, s.end_time, 1]);

  if (rows.length) {
    await pool.query(
      'INSERT INTO salon_schedules (id, salon_id, weekday, start_time, end_time, active) VALUES ?',
      [rows]
    );
  }

  res.json({ ok: true, saved: rows.length });
}));

/**
 * Fermetures exceptionnelles du salon entier (férié, fermeture
 * urgente...) - distinct des congés individuels de chaque coiffeur.
 */
// Dates indisponibles exposées sans authentification pour le calendrier client.
router.get('/public-closures', wrap(async (req, res) => {
  const [rows] = await pool.query(
    'SELECT DATE_FORMAT(start_date, \'%Y-%m-%d\') AS start_date, DATE_FORMAT(end_date, \'%Y-%m-%d\') AS end_date FROM salon_closures WHERE salon_id = ? AND end_date >= CURDATE() ORDER BY start_date',
    [req.salon.id]
  );
  const fmt = (d) => d instanceof Date ? [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-') : String(d).slice(0, 10);
  res.json({ ok: true, items: rows.map(r => ({ start_date: fmt(r.start_date), end_date: fmt(r.end_date) })) });
}));

router.get('/closures', requireAdmin, wrap(async (req, res) => {
  const [rows] = await pool.query(
    'SELECT id, start_date, end_date, reason, created_at FROM salon_closures WHERE salon_id = ? ORDER BY start_date DESC',
    [req.salon.id]
  );
  res.json({
    ok: true,
    items: rows.map((r) => Object.assign({}, r, {
      start_date: String(r.start_date).slice(0, 10),
      end_date: String(r.end_date).slice(0, 10)
    }))
  });
}));

// Contrôle préalable : rendez-vous déjà confirmés sur la période demandée.
async function closureToday(salonId) {
  const settings = await getSettings(salonId);
  const timezone = settings.timezone || 'Europe/Paris';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date());
  const value = type => parts.find(p => p.type === type).value;
  return value('year') + '-' + value('month') + '-' + value('day');
}

async function appointmentsAffected(salonId, from, to) {
  const settings = await getSettings(salonId);
  const timezone = settings.timezone || 'Europe/Paris';
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date());
  const part = (type) => parts.find(p => p.type === type).value;
  const nowLocal = part('year') + '-' + part('month') + '-' + part('day') + ' ' + part('hour') + ':' + part('minute') + ':00';
  const [rows] = await pool.query(`SELECT a.id, a.client_name, a.email, a.phone,
    DATE_FORMAT(a.scheduled_at, '%Y-%m-%d %H:%i') AS scheduled_at,
    s.name AS service_name, b.name AS barber_name
    FROM appointments a LEFT JOIN services s ON s.id = a.service_id
    LEFT JOIN barbers b ON b.id = a.barber_id
    WHERE a.salon_id = ? AND a.scheduled_at >= CONCAT(?, ' 00:00:00')
      AND a.scheduled_at < DATE_ADD(?, INTERVAL 1 DAY)
      AND a.scheduled_at >= ?
      AND a.status NOT IN ('cancelled', 'completed', 'no_show')
    ORDER BY a.scheduled_at, a.client_name`, [salonId, from, to, nowLocal]);
  return rows;
}
router.get('/closures/preview', requireAdmin, wrap(async (req, res) => {
  const { start_date, end_date } = req.query;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start_date || '') || !/^\d{4}-\d{2}-\d{2}$/.test(end_date || '') || start_date > end_date)
    return res.status(400).json({ error: 'Dates invalides' });
  const today = await closureToday(req.salon.id);
  if (end_date < today) return res.json({ ok: true, count: 0, items: [], entirely_past: true, effective_start_date: null });
  const effectiveStart = start_date < today ? today : start_date;
  const items = await appointmentsAffected(req.salon.id, effectiveStart, end_date);
  res.json({ ok: true, count: items.length, items, effective_start_date: effectiveStart });
}));

router.post('/closures', requireAdmin, wrap(async (req, res) => {
  const { start_date, end_date, reason, send_email, custom_message } = req.body;
  if (!start_date || !end_date) return res.status(400).json({ error: 'Dates de début et de fin requises' });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start_date) || !/^\d{4}-\d{2}-\d{2}$/.test(end_date) || start_date > end_date) return res.status(400).json({ error: 'Période de fermeture invalide' });

  const today = await closureToday(req.salon.id);
  if (end_date < today) return res.status(400).json({ error: 'Impossible de créer une fermeture entièrement passée' });
  const effectiveStart = start_date < today ? today : start_date;
  const [overlapping] = await pool.query(
    'SELECT id FROM salon_closures WHERE salon_id = ? AND start_date <= ? AND end_date >= ? LIMIT 1',
    [req.salon.id, end_date, effectiveStart]
  );
  if (overlapping.length) return res.status(409).json({
    error: 'Une fermeture existe déjà sur cette période. Choisissez une plage sans chevauchement.'
  });
  const affected = await appointmentsAffected(req.salon.id, effectiveStart, end_date);
  if (affected.length && req.body.confirm_existing_appointments !== true)
    return res.status(409).json({ error: 'Des rendez-vous existent sur cette période. Confirmation explicite requise.', count: affected.length, items: affected });

  // Prévenir uniquement les clients ayant un rendez-vous futur concerné,
  // jamais tous les contacts historiques ni les rendez-vous déjà passés.
  const recipients = send_email ? Array.from(new Map(
    affected.filter(a => a.email && a.email.trim()).map(a => [
      a.email.trim().toLowerCase(),
      { email_lower: a.email.trim().toLowerCase(), client_name: a.client_name }
    ])
  ).values()) : [];

  const id = crypto.randomUUID();
  await pool.query(
    'INSERT INTO salon_closures (id, salon_id, start_date, end_date, reason) VALUES (?, ?, ?, ?, ?)',
    [id, req.salon.id, effectiveStart, end_date, reason || null]
  );

  let emailResult = null;
  if (send_email) {
    const rows = recipients;
    let sent = 0;
    let failed = 0;
    for (const r of rows) {
      try {
        await sendSalonClosureNotice(req.salon.id, r.email_lower, {
          clientName: r.client_name || 'Cher client',
          startDate: effectiveStart,
          endDate: end_date,
          reason: reason || '',
          customMessage: custom_message
        });
        sent++;
      } catch (err) {
        console.error('[salon-closure email]', r.email_lower, err.message);
        failed++;
      }
    }
    emailResult = { sent, failed, total: rows.length };
  }

  res.json({ ok: true, id, email: emailResult });
}));

router.delete('/closures/:id', requireAdmin, wrap(async (req, res) => {
  await pool.query('DELETE FROM salon_closures WHERE id = ? AND salon_id = ?', [req.params.id, req.salon.id]);
  res.json({ ok: true });
}));

module.exports = router;
