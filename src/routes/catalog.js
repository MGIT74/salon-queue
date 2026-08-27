const express = require('express');
const { pool } = require('../db');
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

function slugify(str) {
  return String(str)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '').slice(0, 40) || 'item';
}

async function uniqueId(table, base) {
  let id = base;
  let n = 2;
  while (true) {
    const [rows] = await pool.query(`SELECT id FROM ${table} WHERE id = ?`, [id]);
    if (rows.length === 0) return id;
    id = base + '_' + n++;
  }
}

['services', 'extras'].forEach((table) => {
  // Liste — publique (la borne du salon résolu en a besoin)
  router.get('/' + table, wrap(async (req, res) => {
    const sql = req.query.all === '1'
      ? `SELECT * FROM ${table} WHERE salon_id = ? ORDER BY sort_order, name`
      : `SELECT * FROM ${table} WHERE salon_id = ? AND active = 1 ORDER BY sort_order, name`;
    const [rows] = await pool.query(sql, [req.salon.id]);
    res.json({ ok: true, items: rows });
  }));

  router.post('/' + table, requireAdmin, wrap(async (req, res) => {
    const { name, duration_min, price_cents, sort_order } = req.body;
    if (!name) return res.status(400).json({ error: 'Le nom est requis' });
    const id = await uniqueId(table, slugify(name));
    const { salon } = req;
    await pool.query(
      `INSERT INTO ${table} (id, salon_id, name, duration_min, price_cents, sort_order) VALUES (?, ?, ?, ?, ?, ?)`,
      [id, salon.id, name, Number(duration_min) || 0, Number(price_cents) || 0, Number(sort_order) || 0]
    );
    const [[item]] = await pool.query(`SELECT * FROM ${table} WHERE id = ?`, [id]);
    res.json({ ok: true, item });
  }));

  router.put('/' + table + '/:id', requireAdmin, wrap(async (req, res) => {
    const sets = [];
    const params = [];
    if (req.body.name !== undefined) { sets.push('name = ?'); params.push(req.body.name); }
    if (req.body.active !== undefined) { sets.push('active = ?'); params.push(req.body.active ? 1 : 0); }
    if (req.body.image_url !== undefined) { sets.push('image_url = ?'); params.push(req.body.image_url || null); }
    ['duration_min', 'price_cents', 'sort_order'].forEach((k) => {
      if (req.body[k] !== undefined) { sets.push(k + ' = ?'); params.push(Number(req.body[k]) || 0); }
    });
    if (!sets.length) return res.json({ ok: true });
    params.push(req.params.id, req.salon.id);
    await pool.query(`UPDATE ${table} SET ${sets.join(', ')} WHERE id = ? AND salon_id = ?`, params);
    res.json({ ok: true });
  }));

  router.delete('/' + table + '/:id', requireAdmin, wrap(async (req, res) => {
    await pool.query(`UPDATE ${table} SET active = 0 WHERE id = ? AND salon_id = ?`, [req.params.id, req.salon.id]);
    res.json({ ok: true, archived: true });
  }));
});

// Produits (boissons, vente à emporter...) — même modèle que services/
// extras, mais sans durée, avec une catégorie libre à la place.
router.get('/products', wrap(async (req, res) => {
  const sql = req.query.all === '1'
    ? 'SELECT * FROM products WHERE salon_id = ? ORDER BY sort_order, name'
    : 'SELECT * FROM products WHERE salon_id = ? AND active = 1 ORDER BY sort_order, name';
  const [rows] = await pool.query(sql, [req.salon.id]);
  res.json({ ok: true, items: rows });
}));

router.post('/products', requireAdmin, wrap(async (req, res) => {
  const { name, price_cents, category, sort_order } = req.body;
  if (!name) return res.status(400).json({ error: 'Le nom est requis' });
  const stockEnabled = req.body.stock_enabled ? 1 : 0;
  const stockQuantity = Math.max(0, Number(req.body.stock_quantity) || 0);
  const id = await uniqueId('products', slugify(name));
  await pool.query(
    'INSERT INTO products (id, salon_id, name, price_cents, category, sort_order, stock_enabled, stock_quantity) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [id, req.salon.id, name, Number(price_cents) || 0, category || null, Number(sort_order) || 0, stockEnabled, stockQuantity]
  );
  const [[item]] = await pool.query('SELECT * FROM products WHERE id = ?', [id]);
  res.json({ ok: true, item });
}));

router.put('/products/:id', requireAdmin, wrap(async (req, res) => {
  const sets = [];
  const params = [];
  if (req.body.name !== undefined) { sets.push('name = ?'); params.push(req.body.name); }
  if (req.body.active !== undefined) { sets.push('active = ?'); params.push(req.body.active ? 1 : 0); }
  if (req.body.category !== undefined) { sets.push('category = ?'); params.push(req.body.category || null); }
  if (req.body.image_url !== undefined) { sets.push('image_url = ?'); params.push(req.body.image_url || null); }
  if (req.body.stock_enabled !== undefined) { sets.push('stock_enabled = ?'); params.push(req.body.stock_enabled ? 1 : 0); }
  ['price_cents', 'sort_order', 'stock_quantity'].forEach((k) => {
    if (req.body[k] !== undefined) { sets.push(k + ' = ?'); params.push(Math.max(0, Number(req.body[k]) || 0)); }
  });
  if (!sets.length) return res.json({ ok: true });
  params.push(req.params.id, req.salon.id);
  await pool.query(`UPDATE products SET ${sets.join(', ')} WHERE id = ? AND salon_id = ?`, params);
  res.json({ ok: true });
}));

router.delete('/products/:id', requireAdmin, wrap(async (req, res) => {
  await pool.query('UPDATE products SET active = 0 WHERE id = ? AND salon_id = ?', [req.params.id, req.salon.id]);
  res.json({ ok: true, archived: true });
}));

module.exports = router;
