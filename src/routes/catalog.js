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
  router.get('/' + table, wrap(async (req, res) => {
    const sql = req.query.all === '1'
      ? `SELECT * FROM ${table} ORDER BY sort_order, name`
      : `SELECT * FROM ${table} WHERE active = 1 ORDER BY sort_order, name`;
    const [rows] = await pool.query(sql);
    res.json({ ok: true, items: rows });
  }));

  router.post('/' + table, requireAdmin, wrap(async (req, res) => {
    const { name, duration_min, price_cents, sort_order } = req.body;
    if (!name) return res.status(400).json({ error: 'Le nom est requis' });
    const id = await uniqueId(table, slugify(name));
    await pool.query(
      `INSERT INTO ${table} (id, name, duration_min, price_cents, sort_order) VALUES (?, ?, ?, ?, ?)`,
      [id, name, Number(duration_min) || 0, Number(price_cents) || 0, Number(sort_order) || 0]
    );
    const [[item]] = await pool.query(`SELECT * FROM ${table} WHERE id = ?`, [id]);
    res.json({ ok: true, item });
  }));

  router.put('/' + table + '/:id', requireAdmin, wrap(async (req, res) => {
    const sets = [];
    const params = [];
    if (req.body.name !== undefined) { sets.push('name = ?'); params.push(req.body.name); }
    if (req.body.active !== undefined) { sets.push('active = ?'); params.push(req.body.active ? 1 : 0); }
    ['duration_min', 'price_cents', 'sort_order'].forEach((k) => {
      if (req.body[k] !== undefined) { sets.push(k + ' = ?'); params.push(Number(req.body[k]) || 0); }
    });
    if (!sets.length) return res.json({ ok: true });
    params.push(req.params.id);
    await pool.query(`UPDATE ${table} SET ${sets.join(', ')} WHERE id = ?`, params);
    res.json({ ok: true });
  }));

  router.delete('/' + table + '/:id', requireAdmin, wrap(async (req, res) => {
    await pool.query(`UPDATE ${table} SET active = 0 WHERE id = ?`, [req.params.id]);
    res.json({ ok: true, archived: true });
  }));
});

module.exports = router;
