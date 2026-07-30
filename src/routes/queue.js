const express = require('express');
const crypto = require('crypto');
const { pool, utcIso } = require('../db');
const { loadQueue, recompute } = require('../lib/queueMath');
const requireAdmin = require('../middleware/auth');
const requireAdminOrBarber = require('../middleware/barberAuth');

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
router.post('/:id/start', requireAdminOrBarber, wrap(async (req, res) => {
  const [[row]] = await pool.query('SELECT id, barber_id, checkin_at FROM queue WHERE id = ?', [req.params.id]);
  if (!row) return res.status(404).json({ error: 'Client introuvable' });

  // Un coiffeur connecté par PIN (pas admin) ne peut agir qu'en son propre
  // nom, et seulement sur un client déjà assigné à lui ou non-assigné —
  // jamais démarrer le client de quelqu'un d'autre.
  if (req.barberId) {
    if (row.barber_id && row.barber_id !== req.barberId) {
      return res.status(403).json({ error: 'Ce client attend un autre coiffeur.' });
    }
  }

  const barberId = req.barberId || req.body.barber_id || row.barber_id || null;

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

    // Respect de l'ordre d'arrivée : un client arrivé avant, éligible au
    // même coiffeur (non-assigné ou assigné à lui), doit être pris en
    // premier — sauf s'il attend spécifiquement quelqu'un d'autre, ou
    // si c'est un transfert manuel décidé par le staff (force_transfer,
    // réservé à l'admin — un coiffeur seul via son PIN ne peut pas
    // s'auto-attribuer ce contournement).
    if (!(req.body.force_transfer && !req.barberId)) {
      const [[earlier]] = await pool.query(
        `SELECT client_name FROM queue
         WHERE status = 'waiting' AND id != ? AND checkin_at < ?
         AND (barber_id IS NULL OR barber_id = ?)
         ORDER BY checkin_at ASC LIMIT 1`,
        [req.params.id, row.checkin_at, barberId]
      );
      if (earlier) {
        return res.status(409).json({
          error: earlier.client_name + ' est arrivé avant et doit être pris en premier.'
        });
      }
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

router.post('/:id/finish', requireAdminOrBarber, wrap(async (req, res) => {
  if (req.barberId) {
    const [[row]] = await pool.query('SELECT barber_id FROM queue WHERE id = ?', [req.params.id]);
    if (!row) return res.status(404).json({ error: 'Client introuvable' });
    if (row.barber_id !== req.barberId) {
      return res.status(403).json({ error: "Ce n'est pas votre client en cours." });
    }
  }
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
router.put('/:id', requireAdminOrBarber, wrap(async (req, res) => {
  if (req.barberId) {
    const [[row]] = await pool.query('SELECT barber_id FROM queue WHERE id = ?', [req.params.id]);
    if (!row) return res.status(404).json({ error: 'Client introuvable' });
    if (row.barber_id !== req.barberId) {
      return res.status(403).json({ error: "Ce n'est pas votre client." });
    }
  }

  const { service_id, extras, barber_id } = req.body;
  const sets = [];
  const params = [];
  if (service_id) { sets.push('service_id = ?'); params.push(service_id); }
  if (barber_id !== undefined && !req.barberId) { sets.push('barber_id = ?'); params.push(barber_id || null); }

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
