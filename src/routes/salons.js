const express = require('express');
const crypto = require('crypto');
const { pool } = require('../db');

const router = express.Router();

function wrap(fn) {
  return function (req, res) {
    fn(req, res).catch((err) => {
      console.error(err);
      res.status(500).json({ error: err.message });
    });
  };
}

function requireSuperAdmin(req, res, next) {
  const expected = (process.env.SUPER_ADMIN_PASSWORD || '').replace(/[\r\n]+$/, '').trim();
  if (!expected) return res.status(500).json({ error: 'SUPER_ADMIN_PASSWORD non défini côté serveur' });
  const given = req.get('X-Super-Admin-Password') || req.query.pw;
  if (given !== expected) return res.status(401).json({ error: 'Mot de passe incorrect' });
  next();
}

router.post('/login', wrap(async (req, res) => {
  const expected = (process.env.SUPER_ADMIN_PASSWORD || '').replace(/[\r\n]+$/, '').trim();
  if (!expected) return res.status(500).json({ error: 'SUPER_ADMIN_PASSWORD non défini côté serveur' });
  if ((req.body.password || '') !== expected) {
    return res.status(401).json({ error: 'Mot de passe incorrect' });
  }
  res.json({ ok: true });
}));

router.get('/salons', requireSuperAdmin, wrap(async (req, res) => {
  const [rows] = await pool.query(
    'SELECT id, name, slug, is_default, active, created_at FROM salons ORDER BY created_at'
  );
  res.json({ ok: true, items: rows });
}));

router.post('/salons', requireSuperAdmin, wrap(async (req, res) => {
  const { name, slug, admin_password } = req.body;
  if (!name || !slug || !admin_password) {
    return res.status(400).json({ error: 'Nom, identifiant et mot de passe requis' });
  }
  if (!/^[a-z0-9-]+$/.test(slug)) {
    return res.status(400).json({
      error: "L'identifiant ne doit contenir que des lettres minuscules, chiffres et tirets"
    });
  }

  const [[existing]] = await pool.query('SELECT id FROM salons WHERE slug = ?', [slug]);
  if (existing) return res.status(409).json({ error: 'Cet identifiant est déjà utilisé' });

  const ownerId = crypto.randomUUID();
  await pool.query(
    'INSERT INTO owners (id, name, admin_password) VALUES (?, ?, ?)',
    [ownerId, name, admin_password]
  );

  const id = crypto.randomUUID();
  await pool.query(
    'INSERT INTO salons (id, owner_id, name, slug) VALUES (?, ?, ?, ?)',
    [id, ownerId, name, slug]
  );

  // Catalogue de départ, comme pour le tout premier salon — sinon la
  // borne n'a ni prestation ni supplément à proposer.
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
    [id, 'notify_before_min', '30'],
    [id, 'salon_name', name],
    [id, 'smtp_host', ''],
    [id, 'smtp_port', '587'],
    [id, 'smtp_user', ''],
    [id, 'smtp_pass', ''],
    [id, 'smtp_from', '']
  ];
  await pool.query('INSERT INTO settings (salon_id, `key`, value) VALUES ?', [settingsRows]);

  res.json({ ok: true, item: { id, name, slug } });
}));

router.put('/salons/:id', requireSuperAdmin, wrap(async (req, res) => {
  const sets = [];
  const params = [];
  if (req.body.name !== undefined) { sets.push('name = ?'); params.push(req.body.name); }
  if (req.body.active !== undefined) { sets.push('active = ?'); params.push(req.body.active ? 1 : 0); }
  if (sets.length) {
    params.push(req.params.id);
    await pool.query(`UPDATE salons SET ${sets.join(', ')} WHERE id = ?`, params);
  }

  if (req.body.admin_password) {
    const [[salon]] = await pool.query('SELECT owner_id FROM salons WHERE id = ?', [req.params.id]);
    if (!salon) return res.status(404).json({ error: 'Salon introuvable' });
    await pool.query('UPDATE owners SET admin_password = ? WHERE id = ?', [req.body.admin_password, salon.owner_id]);
  }

  res.json({ ok: true });
}));

module.exports = router;
