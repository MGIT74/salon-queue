const express = require('express');
const crypto = require('crypto');
const { pool, utcIso } = require('../db');
const { loadQueue, recompute } = require('../lib/queueMath');
const requireAdmin = require('../middleware/auth');

const router = express.Router();

function wrap(fn) {
  return function (req, res) {
    fn(req, res).catch((err) => {
      console.error(err);
      res.status(500).json({ error: err.message });
    });
  };
}

// --- Public : état de la file -------------------------------------------
router.get('/', wrap(async (req, res) => {
  await recompute();
  const rows = await loadQueue();
  rows.sort((a, b) => {
    if (a.status !== b.status) return a.status === 'in_progress' ? -1 : 1;
    return (a.position || 0) - (b.position || 0);
  });
  res.json({ ok: true, queue: rows });
}));

// --- Public : check-in à la borne ---------------------------------------
router.post('/checkin', wrap(async (req, res) => {
  const { client_name, email, phone, service_id, barber_id, extras } = req.body;
  if (!client_name) return res.status(400).json({ error: 'Le nom est requis' });
  if (!service_id) return res.status(400).json({ error: 'La prestation est requise' });

  const id = crypto.randomUUID();
  await pool.query(
    `INSERT INTO queue (id, client_name, email, phone, service_id, barber_id, status)
     VALUES (?, ?, ?, ?, ?, ?, 'waiting')`,
    [id, client_name, email || null, phone || null, service_id, barber_id || null]
  );

  if (Array.isArray(extras) && extras.length) {
    const values = extras.map((extraId) => [id, extraId]);
    await pool.query('INSERT INTO queue_extras (queue_id, extra_id) VALUES ?', [values]);
  }

  await recompute();

  const rows = await loadQueue();
  const me = rows.find((r) => r.id === id);
  res.json({ ok: true, entry: me });
}));

// --- Coiffeur : démarrer, terminer, annuler ------------------------------
router.post('/:id/start', requireAdmin, wrap(async (req, res) => {
  const barberId = req.body.barber_id || null;

  if (barberId) {
    const [[busy]] = await pool.query(
      "SELECT id, client_name FROM queue WHERE barber_id = ? AND status = 'in_progress' LIMIT 1",
      [barberId]
    );
    if (busy) {
      return res.status(409).json({
        error: 'Ce coiffeur a déjà une coupe en cours (' + busy.client_name + ').'
      });
    }
  }

  const params = [barberId, req.params.id];
  await pool.query(
    "UPDATE queue SET status = 'in_progress', start_at = NOW(), barber_id = COALESCE(?, barber_id) WHERE id = ?",
    params
  );
  await recompute();
  res.json({ ok: true });
}));

router.post('/:id/finish', requireAdmin, wrap(async (req, res) => {
  await pool.query("UPDATE queue SET status = 'done', end_at = NOW() WHERE id = ?", [req.params.id]);
  await recompute();
  res.json({ ok: true });
}));

router.post('/:id/cancel', requireAdmin, wrap(async (req, res) => {
  await pool.query("UPDATE queue SET status = 'cancelled' WHERE id = ?", [req.params.id]);
  await recompute();
  res.json({ ok: true });
}));

// --- Coiffeur : modifier prestation et suppléments en cours de route -----
router.put('/:id', requireAdmin, wrap(async (req, res) => {
  const { service_id, extras, barber_id } = req.body;
  const sets = [];
  const params = [];
  if (service_id) { sets.push('service_id = ?'); params.push(service_id); }
  if (barber_id !== undefined) { sets.push('barber_id = ?'); params.push(barber_id || null); }

  if (sets.length) {
    params.push(req.params.id);
    await pool.query(`UPDATE queue SET ${sets.join(', ')} WHERE id = ?`, params);
  }

  if (Array.isArray(extras)) {
    await pool.query('DELETE FROM queue_extras WHERE queue_id = ?', [req.params.id]);
    if (extras.length) {
      const values = extras.map((extraId) => [req.params.id, extraId]);
      await pool.query('INSERT INTO queue_extras (queue_id, extra_id) VALUES ?', [values]);
    }
  }

  await recompute();
  res.json({ ok: true });
}));

// --- Chiffre d'affaires du jour -----------------------------------------
router.get('/stats/today', requireAdmin, wrap(async (req, res) => {
  const [[row]] = await pool.query(
    `SELECT COUNT(*) AS done_count, COALESCE(SUM(total_price_cents), 0) AS revenue_cents
     FROM queue WHERE status = 'done' AND end_at >= CURDATE()`
  );
  res.json({ ok: true, done: Number(row.done_count), revenue_cents: Number(row.revenue_cents) });
}));

// --- Coiffeur : historique complet des clients (tous statuts) -----------
router.get('/history', requireAdmin, wrap(async (req, res) => {
  const [rows] = await pool.query(
    `SELECT q.*, s.name AS service_name
     FROM queue q LEFT JOIN services s ON s.id = q.service_id
     ORDER BY q.checkin_at DESC LIMIT 200`
  );
  const ids = rows.map((r) => r.id);
  let extrasByQueue = {};
  if (ids.length) {
    const [links] = await pool.query(
      `SELECT qe.queue_id, e.name FROM queue_extras qe
       JOIN extras e ON e.id = qe.extra_id WHERE qe.queue_id IN (?)`,
      [ids]
    );
    links.forEach((l) => {
      (extrasByQueue[l.queue_id] = extrasByQueue[l.queue_id] || []).push(l.name);
    });
  }
  const items = rows.map((r) => Object.assign({}, r, {
    position: r.queue_position,
    checkin_at: utcIso(r.checkin_at),
    start_at: utcIso(r.start_at),
    end_at: utcIso(r.end_at),
    extra_names: extrasByQueue[r.id] || []
  }));
  res.json({ ok: true, items });
}));

// --- Coiffeur : suppression définitive (nettoyage de données test) ------
router.delete('/:id', requireAdmin, wrap(async (req, res) => {
  await pool.query('DELETE FROM queue WHERE id = ?', [req.params.id]);
  await recompute();
  res.json({ ok: true, deleted: true });
}));

module.exports = router;
