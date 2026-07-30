const express = require('express');
const crypto = require('crypto');
const { pool } = require('../db');
const { hashPassword } = require('../lib/password');

const router = express.Router();

function wrap(fn) {
  return function (req, res) {
    fn(req, res).catch((err) => {
      console.error(err);
      res.status(500).json({ error: err.message });
    });
  };
}

router.post('/', wrap(async (req, res) => {
  const { salon_name, slug, email, password } = req.body;

  if (!salon_name || !slug || !email || !password) {
    return res.status(400).json({ error: 'Tous les champs sont requis' });
  }
  if (!/^[a-z0-9-]+$/.test(slug)) {
    return res.status(400).json({
      error: "L'identifiant ne doit contenir que des lettres minuscules, chiffres et tirets"
    });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Le mot de passe doit contenir au moins 6 caractères' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Adresse email invalide' });
  }

  const [[existingSlug]] = await pool.query('SELECT id FROM salons WHERE slug = ?', [slug]);
  if (existingSlug) return res.status(409).json({ error: 'Cet identifiant de salon est déjà utilisé' });

  const [[existingEmail]] = await pool.query('SELECT id FROM owners WHERE email = ?', [email]);
  if (existingEmail) return res.status(409).json({ error: 'Un compte existe déjà avec cet email' });

  const passwordHash = await hashPassword(password);

  const ownerId = crypto.randomUUID();
  await pool.query(
    'INSERT INTO owners (id, name, email, password_hash, admin_password) VALUES (?, ?, ?, ?, ?)',
    [ownerId, salon_name, email, passwordHash, '']
  );

  const salonId = crypto.randomUUID();
  await pool.query(
    'INSERT INTO salons (id, owner_id, name, slug, admin_password) VALUES (?, ?, ?, ?, ?)',
    [salonId, ownerId, salon_name, slug, '']
  );

  // Catalogue de départ, comme pour les autres façons de créer un salon.
  const services = [
    ['Coupe', 30, 2000, 1], ['Barbe', 15, 1200, 2],
    ['Coupe et barbe', 45, 2800, 3], ['Coupe enfant', 20, 1500, 4]
  ];
  const extras = [
    ['Shampooing', 5, 300, 1], ['Serviette chaude', 10, 800, 2],
    ['Contour / traçage', 5, 500, 3], ['Dégradé américain', 10, 500, 4],
    ['Coloration', 25, 2000, 5], ["Soin barbe à l'huile", 10, 1000, 6]
  ];
  const svcRows = services.map((s) => [crypto.randomUUID(), salonId, s[0], s[1], s[2], s[3]]);
  const extRows = extras.map((e) => [crypto.randomUUID(), salonId, e[0], e[1], e[2], e[3]]);

  await pool.query(
    'INSERT INTO services (id, salon_id, name, duration_min, price_cents, sort_order) VALUES ?',
    [svcRows]
  );
  await pool.query(
    'INSERT INTO extras (id, salon_id, name, duration_min, price_cents, sort_order) VALUES ?',
    [extRows]
  );

  const settingsRows = [
    [salonId, 'notify_before_min', '30'], [salonId, 'salon_name', salon_name],
    [salonId, 'smtp_host', ''], [salonId, 'smtp_port', '587'],
    [salonId, 'smtp_user', ''], [salonId, 'smtp_pass', ''], [salonId, 'smtp_from', '']
  ];
  await pool.query('INSERT INTO settings (salon_id, `key`, value) VALUES ?', [settingsRows]);

  res.json({ ok: true, slug });
}));

module.exports = router;
