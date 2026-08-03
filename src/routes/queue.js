const express = require('express');
const crypto = require('crypto');
const { pool, utcIso } = require('../db');
const { loadQueue, recompute, clientKey } = require('../lib/queueMath');
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

// --- Public : état de la file (du salon résolu) --------------------------
router.get('/', wrap(async (req, res) => {
  await recompute(req.salon.id);
  const rows = await loadQueue(req.salon.id);
  rows.sort((a, b) => {
    if (a.status !== b.status) return a.status === 'in_progress' ? -1 : 1;
    return (a.position || 0) - (b.position || 0);
  });
  res.json({ ok: true, queue: rows });
}));

/**
 * Coupes terminées mais pas encore encaissées, pour la caisse. Scopé au
 * coiffeur connecté par PIN (chacun encaisse ses propres clients, dans
 * l'ordre) — un admin voit tout le monde.
 */
router.get('/pending-payment', requireAdminOrBarber, wrap(async (req, res) => {
  let rows = await loadQueue(req.salon.id, ['done'], true);
  if (req.barberId) rows = rows.filter((r) => r.barber_id === req.barberId);
  rows.sort((a, b) => new Date(a.end_at || a.checkin_at) - new Date(b.end_at || b.checkin_at));
  res.json({ ok: true, items: rows });
}));

// --- Public : check-in à la borne ---------------------------------------
router.post('/checkin', wrap(async (req, res) => {
  const { client_name, email, phone, service_id, barber_id, extras } = req.body;
  if (!client_name) return res.status(400).json({ error: 'Le nom est requis' });
  if (!service_id) return res.status(400).json({ error: 'La prestation est requise' });

  const id = crypto.randomUUID();
  await pool.query(
    `INSERT INTO queue (id, salon_id, client_name, email, phone, service_id, barber_id, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'waiting')`,
    [id, req.salon.id, client_name, email || null, phone || null, service_id, barber_id || null]
  );

  if (Array.isArray(extras) && extras.length) {
    const values = extras.map((extraId) => [id, extraId]);
    await pool.query('INSERT INTO queue_extras (queue_id, extra_id) VALUES ?', [values]);
  }

  await recompute(req.salon.id);

  const rows = await loadQueue(req.salon.id);
  const me = rows.find((r) => r.id === id);
  res.json({ ok: true, entry: me });
}));

// --- Coiffeur : démarrer, terminer, annuler ------------------------------
router.post('/:id/start', requireAdminOrBarber, wrap(async (req, res) => {
  const [[row]] = await pool.query(
    'SELECT id, barber_id, checkin_at FROM queue WHERE id = ? AND salon_id = ?',
    [req.params.id, req.salon.id]
  );
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
      "SELECT id, client_name FROM queue WHERE barber_id = ? AND salon_id = ? AND status = 'in_progress' LIMIT 1",
      [barberId, req.salon.id]
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
         WHERE salon_id = ? AND status = 'waiting' AND id != ? AND checkin_at < ?
         AND (barber_id IS NULL OR barber_id = ?)
         ORDER BY checkin_at ASC LIMIT 1`,
        [req.salon.id, req.params.id, row.checkin_at, barberId]
      );
      if (earlier) {
        return res.status(409).json({
          error: earlier.client_name + ' est arrivé avant et doit être pris en premier.'
        });
      }
    }
  }

  await pool.query(
    "UPDATE queue SET status = 'in_progress', start_at = NOW(), barber_id = COALESCE(?, barber_id) WHERE id = ? AND salon_id = ?",
    [barberId, req.params.id, req.salon.id]
  );
  await recompute(req.salon.id);
  res.json({ ok: true });
}));

router.post('/:id/finish', requireAdminOrBarber, wrap(async (req, res) => {
  if (req.barberId) {
    const [[row]] = await pool.query(
      'SELECT barber_id FROM queue WHERE id = ? AND salon_id = ?',
      [req.params.id, req.salon.id]
    );
    if (!row) return res.status(404).json({ error: 'Client introuvable' });
    if (row.barber_id !== req.barberId) {
      return res.status(403).json({ error: "Ce n'est pas votre client en cours." });
    }
  }
  await pool.query(
    "UPDATE queue SET status = 'done', end_at = NOW() WHERE id = ? AND salon_id = ?",
    [req.params.id, req.salon.id]
  );
  await recompute(req.salon.id);
  res.json({ ok: true });
}));

router.post('/:id/cancel', requireAdminOrBarber, wrap(async (req, res) => {
  if (req.barberId) {
    const [[row]] = await pool.query(
      'SELECT barber_id FROM queue WHERE id = ? AND salon_id = ?',
      [req.params.id, req.salon.id]
    );
    if (!row) return res.status(404).json({ error: 'Client introuvable' });
    if (row.barber_id && row.barber_id !== req.barberId) {
      return res.status(403).json({ error: "Ce n'est pas votre client." });
    }
  }
  await pool.query(
    "UPDATE queue SET status = 'cancelled' WHERE id = ? AND salon_id = ?",
    [req.params.id, req.salon.id]
  );
  await recompute(req.salon.id);
  res.json({ ok: true });
}));

// --- Coiffeur : modifier prestation et suppléments en cours de route -----
router.put('/:id', requireAdminOrBarber, wrap(async (req, res) => {
  const [[existing]] = await pool.query(
    'SELECT barber_id, status FROM queue WHERE id = ? AND salon_id = ?',
    [req.params.id, req.salon.id]
  );
  if (!existing) return res.status(404).json({ error: 'Client introuvable' });

  if (req.barberId && existing.barber_id !== req.barberId) {
    return res.status(403).json({ error: "Ce n'est pas votre client." });
  }

  const { service_id, extras, barber_id } = req.body;

  // Un coiffeur ne peut pas ajouter un supplément à une coupe EN COURS
  // s'il y a déjà quelqu'un qui attend son tour derrière lui — ça le
  // retarderait sans qu'il le sache à l'avance. On ne bloque que
  // l'AJOUT (la liste s'agrandit), pas le retrait d'un supplément.
  if (req.barberId && Array.isArray(extras) && existing.status === 'in_progress') {
    const [[{ n: currentExtrasCount }]] = await pool.query(
      'SELECT COUNT(*) AS n FROM queue_extras WHERE queue_id = ?', [req.params.id]
    );
    if (extras.length > currentExtrasCount) {
      const [[nextWaiting]] = await pool.query(
        `SELECT id FROM queue WHERE salon_id = ? AND status = 'waiting'
         AND (barber_id IS NULL OR barber_id = ?) LIMIT 1`,
        [req.salon.id, req.barberId]
      );
      if (nextWaiting) {
        return res.status(409).json({
          error: 'Un client attend déjà son tour — ajouter un supplément le retarderait.'
        });
      }
    }
  }

  const sets = [];
  const params = [];
  if (service_id) { sets.push('service_id = ?'); params.push(service_id); }
  if (barber_id !== undefined && !req.barberId) { sets.push('barber_id = ?'); params.push(barber_id || null); }

  if (sets.length) {
    params.push(req.params.id, req.salon.id);
    await pool.query(`UPDATE queue SET ${sets.join(', ')} WHERE id = ? AND salon_id = ?`, params);
  }

  if (Array.isArray(extras)) {
    await pool.query('DELETE FROM queue_extras WHERE queue_id = ?', [req.params.id]);
    if (extras.length) {
      const values = extras.map((extraId) => [req.params.id, extraId]);
      await pool.query('INSERT INTO queue_extras (queue_id, extra_id) VALUES ?', [values]);
    }
  }

  await recompute(req.salon.id);
  res.json({ ok: true });
}));

// --- Chiffre d'affaires du jour -------------------------------------------
router.get('/stats/today', requireAdmin, wrap(async (req, res) => {
  const [[row]] = await pool.query(
    `SELECT COUNT(*) AS done_count, COALESCE(SUM(total_price_cents), 0) AS revenue_cents
     FROM queue WHERE salon_id = ? AND status = 'done' AND end_at >= CURDATE()`,
    [req.salon.id]
  );
  res.json({ ok: true, done: Number(row.done_count), revenue_cents: Number(row.revenue_cents) });
}));

// --- Coiffeur : historique complet des clients (tous statuts) -----------
router.get('/history', requireAdmin, wrap(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const perPage = Math.min(100, Math.max(1, parseInt(req.query.per_page, 10) || 25));
  const offset = (page - 1) * perPage;

  const conditions = ['q.salon_id = ?'];
  const params = [req.salon.id];

  if (req.query.date_from) {
    conditions.push('q.checkin_at >= ?');
    params.push(req.query.date_from + ' 00:00:00');
  }
  if (req.query.date_to) {
    conditions.push('q.checkin_at <= ?');
    params.push(req.query.date_to + ' 23:59:59');
  }
  const whereClause = conditions.join(' AND ');

  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total FROM queue q WHERE ${whereClause}`,
    params
  );

  const [rows] = await pool.query(
    `SELECT q.*, s.name AS service_name
     FROM queue q LEFT JOIN services s ON s.id = q.service_id
     WHERE ${whereClause}
     ORDER BY q.checkin_at DESC, q.id DESC LIMIT ? OFFSET ?`,
    [...params, perPage, offset]
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

  const [notes] = await pool.query('SELECT client_key, note FROM client_notes WHERE salon_id = ?', [req.salon.id]);
  const noteByKey = Object.fromEntries(notes.map((n) => [n.client_key, n.note]));

  const items = rows.map((r) => Object.assign({}, r, {
    position: r.queue_position,
    checkin_at: utcIso(r.checkin_at),
    start_at: utcIso(r.start_at),
    end_at: utcIso(r.end_at),
    extra_names: extrasByQueue[r.id] || [],
    note: noteByKey[clientKey(r)] || ''
  }));
  res.json({
    ok: true,
    items,
    total,
    page,
    per_page: perPage,
    total_pages: Math.max(1, Math.ceil(total / perPage))
  });
}));

// --- Coiffeur : suppression définitive (nettoyage de données test) ------
router.delete('/:id', requireAdmin, wrap(async (req, res) => {
  await pool.query('DELETE FROM queue WHERE id = ? AND salon_id = ?', [req.params.id, req.salon.id]);
  await recompute(req.salon.id);
  res.json({ ok: true, deleted: true });
}));

// Note sur un client (préférences, habitudes...), pour la retrouver la
// prochaine fois qu'il revient. Un coiffeur connecté par PIN ne peut
// noter que son propre client en cours.
router.put('/:id/note', requireAdminOrBarber, wrap(async (req, res) => {
  const [[row]] = await pool.query(
    'SELECT client_name, email, phone, barber_id FROM queue WHERE id = ? AND salon_id = ?',
    [req.params.id, req.salon.id]
  );
  if (!row) return res.status(404).json({ error: 'Client introuvable' });
  if (req.barberId && row.barber_id && row.barber_id !== req.barberId) {
    return res.status(403).json({ error: "Ce n'est pas votre client." });
  }

  const key = clientKey(row);
  if (!key) return res.status(400).json({ error: 'Impossible de rattacher une note à ce client' });

  const note = String(req.body.note || '').trim();
  if (note) {
    await pool.query(
      `INSERT INTO client_notes (id, salon_id, client_key, note) VALUES (UUID(), ?, ?, ?)
       ON DUPLICATE KEY UPDATE note = VALUES(note), updated_at = NOW()`,
      [req.salon.id, key, note]
    );
  } else {
    await pool.query('DELETE FROM client_notes WHERE salon_id = ? AND client_key = ?', [req.salon.id, key]);
  }

  res.json({ ok: true });
}));

/**
 * Tous les passages d'un même client (peu importe le statut), retrouvé
 * par sa clé de rapprochement — combien de fois il est venu, quand,
 * pour quelle prestation.
 */
router.get('/:id/client-history', requireAdmin, wrap(async (req, res) => {
  const [[row]] = await pool.query(
    'SELECT client_name, email, phone FROM queue WHERE id = ? AND salon_id = ?',
    [req.params.id, req.salon.id]
  );
  if (!row) return res.status(404).json({ error: 'Client introuvable' });

  const key = clientKey(row);
  if (!key) return res.json({ ok: true, items: [] });

  const [allRows] = await pool.query(
    `SELECT q.id, q.client_name, q.email, q.phone, q.status, q.checkin_at, q.start_at, q.end_at,
            q.total_price_cents, s.name AS service_name
     FROM queue q LEFT JOIN services s ON s.id = q.service_id
     WHERE q.salon_id = ?
     ORDER BY q.checkin_at DESC LIMIT 1000`,
    [req.salon.id]
  );

  const items = allRows
    .filter((r) => clientKey(r) === key)
    .map((r) => Object.assign({}, r, {
      checkin_at: utcIso(r.checkin_at),
      start_at: utcIso(r.start_at),
      end_at: utcIso(r.end_at)
    }));

  res.json({ ok: true, items });
}));

module.exports = router;
