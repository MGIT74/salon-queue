const express = require('express');
const crypto = require('crypto');
const { pool, utcIso } = require('../db');
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

// --- Salons de la même enseigne (même propriétaire) ----------------------
router.get('/salons', requireAdmin, wrap(async (req, res) => {
  const [rows] = await pool.query(
    'SELECT id, name, slug, is_default, active FROM salons WHERE owner_id = ? ORDER BY created_at',
    [req.ownerId]
  );
  res.json({ ok: true, items: rows });
}));

// Ajoute un salon à la même enseigne : hérite automatiquement du même
// mot de passe (le propriétaire), pas besoin d'en définir un nouveau.
router.post('/salons', requireAdmin, wrap(async (req, res) => {
  const { name, slug } = req.body;
  if (!name || !slug) return res.status(400).json({ error: 'Nom et identifiant requis' });
  if (!/^[a-z0-9-]+$/.test(slug)) {
    return res.status(400).json({
      error: "L'identifiant ne doit contenir que des lettres minuscules, chiffres et tirets"
    });
  }

  const [[existing]] = await pool.query('SELECT id FROM salons WHERE slug = ?', [slug]);
  if (existing) return res.status(409).json({ error: 'Cet identifiant est déjà utilisé' });

  const id = crypto.randomUUID();
  await pool.query(
    'INSERT INTO salons (id, owner_id, name, slug) VALUES (?, ?, ?, ?)',
    [id, req.ownerId, name, slug]
  );

  // Catalogue de départ, comme pour le premier salon de l'enseigne.
  const services = [
    ['Coupe', 30, 2000, 1], ['Barbe', 15, 1200, 2],
    ['Coupe et barbe', 45, 2800, 3], ['Coupe enfant', 20, 1500, 4]
  ];
  const extras = [
    ['Shampooing', 5, 300, 1], ['Serviette chaude', 10, 800, 2],
    ['Contour / traçage', 5, 500, 3], ['Dégradé américain', 10, 500, 4],
    ['Coloration', 25, 2000, 5], ["Soin barbe à l'huile", 10, 1000, 6]
  ];
  const svcRows = services.map((s) => [crypto.randomUUID(), id, s[0], s[1], s[2], s[3]]);
  const extRows = extras.map((e) => [crypto.randomUUID(), id, e[0], e[1], e[2], e[3]]);

  await pool.query(
    'INSERT INTO services (id, salon_id, name, duration_min, price_cents, sort_order) VALUES ?',
    [svcRows]
  );
  await pool.query(
    'INSERT INTO extras (id, salon_id, name, duration_min, price_cents, sort_order) VALUES ?',
    [extRows]
  );

  const settingsRows = [
    [id, 'notify_before_min', '30'], [id, 'salon_name', name],
    [id, 'smtp_host', ''], [id, 'smtp_port', '587'],
    [id, 'smtp_user', ''], [id, 'smtp_pass', ''], [id, 'smtp_from', '']
  ];
  await pool.query('INSERT INTO settings (salon_id, `key`, value) VALUES ?', [settingsRows]);

  res.json({ ok: true, item: { id, name, slug } });
}));

router.put('/salons/:id', requireAdmin, wrap(async (req, res) => {
  const [[owned]] = await pool.query(
    'SELECT id FROM salons WHERE id = ? AND owner_id = ?', [req.params.id, req.ownerId]
  );
  if (!owned) return res.status(403).json({ error: "Ce salon n'appartient pas à votre enseigne" });

  const sets = [];
  const params = [];
  if (req.body.name !== undefined) { sets.push('name = ?'); params.push(req.body.name); }
  if (req.body.active !== undefined) { sets.push('active = ?'); params.push(req.body.active ? 1 : 0); }
  if (!sets.length) return res.json({ ok: true });
  params.push(req.params.id);
  await pool.query(`UPDATE salons SET ${sets.join(', ')} WHERE id = ?`, params);
  res.json({ ok: true });
}));

// --- Coiffeurs de toute l'enseigne, avec leur salon -----------------------
router.get('/barbers', requireAdmin, wrap(async (req, res) => {
  const [rows] = await pool.query(
    `SELECT b.id, b.name, b.active, b.salon_id, s.name AS salon_name
     FROM barbers b JOIN salons s ON s.id = b.salon_id
     WHERE s.owner_id = ? ORDER BY s.name, b.name`,
    [req.ownerId]
  );
  res.json({ ok: true, items: rows });
}));

// Réassigne un coiffeur à un autre salon de la MÊME enseigne uniquement.
router.put('/barbers/:id/salon', requireAdmin, wrap(async (req, res) => {
  const { salon_id } = req.body;
  if (!salon_id) return res.status(400).json({ error: 'salon_id requis' });

  const [[target]] = await pool.query(
    'SELECT id FROM salons WHERE id = ? AND owner_id = ?', [salon_id, req.ownerId]
  );
  if (!target) return res.status(403).json({ error: "Ce salon n'appartient pas à votre enseigne" });

  const [[barber]] = await pool.query(
    `SELECT b.id FROM barbers b JOIN salons s ON s.id = b.salon_id
     WHERE b.id = ? AND s.owner_id = ?`,
    [req.params.id, req.ownerId]
  );
  if (!barber) return res.status(404).json({ error: 'Coiffeur introuvable' });

  await pool.query('UPDATE barbers SET salon_id = ? WHERE id = ?', [salon_id, req.params.id]);
  res.json({ ok: true });
}));

// --- Clients : tous les salons de l'enseigne, ou un seul ------------------
router.get('/clients', requireAdmin, wrap(async (req, res) => {
  const salonFilter = req.query.salon; // absent ou 'all' => tous les salons

  let salonIds;
  if (!salonFilter || salonFilter === 'all') {
    const [rows] = await pool.query('SELECT id FROM salons WHERE owner_id = ?', [req.ownerId]);
    salonIds = rows.map((r) => r.id);
  } else {
    const [[owned]] = await pool.query(
      'SELECT id FROM salons WHERE id = ? AND owner_id = ?', [salonFilter, req.ownerId]
    );
    if (!owned) return res.status(403).json({ error: "Ce salon n'appartient pas à votre enseigne" });
    salonIds = [salonFilter];
  }

  if (salonIds.length === 0) return res.json({ ok: true, items: [] });

  const [rows] = await pool.query(
    `SELECT q.*, s.name AS service_name, sal.name AS salon_name
     FROM queue q
     LEFT JOIN services s ON s.id = q.service_id
     JOIN salons sal ON sal.id = q.salon_id
     WHERE q.salon_id IN (?)
     ORDER BY q.checkin_at DESC LIMIT 300`,
    [salonIds]
  );

  const items = rows.map((r) => Object.assign({}, r, {
    position: r.queue_position,
    checkin_at: utcIso(r.checkin_at),
    start_at: utcIso(r.start_at),
    end_at: utcIso(r.end_at)
  }));

  res.json({ ok: true, items });
}));

module.exports = router;
