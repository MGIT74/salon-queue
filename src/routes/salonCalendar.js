const express = require('express');
const crypto = require('crypto');
const { pool } = require('../db');
const requireAdmin = require('../middleware/auth');
const { sendSalonClosureNotice } = require('../lib/mailer');

const router = express.Router();

function wrap(fn) {
  return function (req, res) {
    fn(req, res).catch((err) => {
      console.error(err);
      res.status(500).json({ error: err.message });
    });
  };
}

/**
 * Horaires généraux du salon (Réglages > Calendrier) - un modèle par
 * défaut indépendant des horaires propres à chaque coiffeur, jamais
 * utilisé pour calculer les créneaux de réservation (ça reste toujours
 * les horaires individuels de chaque coiffeur) - purement informatif/
 * affichage du salon dans son ensemble.
 */
router.get('/schedule', requireAdmin, wrap(async (req, res) => {
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
router.get('/closures', requireAdmin, wrap(async (req, res) => {
  const [rows] = await pool.query(
    'SELECT id, start_date, end_date, reason, created_at FROM salon_closures WHERE salon_id = ? ORDER BY start_date DESC',
    [req.salon.id]
  );
  res.json({
    ok: true,
    items: rows.map((r) => Object.assign({}, r, {
      start_date: r.start_date.toISOString().slice(0, 10),
      end_date: r.end_date.toISOString().slice(0, 10)
    }))
  });
}));

router.post('/closures', requireAdmin, wrap(async (req, res) => {
  const { start_date, end_date, reason, send_email, custom_message } = req.body;
  if (!start_date || !end_date) return res.status(400).json({ error: 'Dates de début et de fin requises' });

  const id = crypto.randomUUID();
  await pool.query(
    'INSERT INTO salon_closures (id, salon_id, start_date, end_date, reason) VALUES (?, ?, ?, ?, ?)',
    [id, req.salon.id, start_date, end_date, reason || null]
  );

  let emailResult = null;
  if (send_email) {
    // Tous les emails connus du salon (comptes clients ET historique de
    // passages/RDV, même sans compte) - dédupliqué par adresse.
    const [rows] = await pool.query(
      `SELECT DISTINCT LOWER(email) AS email_lower, MIN(client_name) AS client_name FROM (
         SELECT email, client_name FROM clients WHERE salon_id = ? AND email IS NOT NULL AND email != ''
         UNION ALL
         SELECT email, client_name FROM queue WHERE salon_id = ? AND email IS NOT NULL AND email != ''
       ) AS all_known
       GROUP BY LOWER(email)`,
      [req.salon.id, req.salon.id]
    );

    let sent = 0;
    let failed = 0;
    for (const r of rows) {
      try {
        await sendSalonClosureNotice(req.salon.id, r.email_lower, {
          clientName: r.client_name || 'Cher client',
          startDate: start_date,
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
