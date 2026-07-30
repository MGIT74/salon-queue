const express = require('express');
const crypto = require('crypto');
const { pool } = require('../db');
const { activeBarberCount } = require('../lib/queueMath');
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

function stripSecrets(b) {
  var out = Object.assign({}, b);
  out.has_pin = Boolean(out.pin_code);
  delete out.pin_code;
  return out;
}

router.get('/', wrap(async (req, res) => {
  const sql = req.query.all === '1'
    ? 'SELECT * FROM barbers ORDER BY sort_order, name'
    : 'SELECT * FROM barbers WHERE active = 1 ORDER BY sort_order, name';
  const [barbers] = await pool.query(sql);
  const [schedules] = await pool.query('SELECT * FROM barber_schedules');

  const items = barbers.map((b) => Object.assign({}, stripSecrets(b), {
    schedules: schedules.filter((s) => s.barber_id === b.id).sort((a, c) => a.weekday - c.weekday)
  }));

  res.json({ ok: true, items, on_duty: await activeBarberCount() });
}));

router.post('/', requireAdmin, wrap(async (req, res) => {
  const { name, sort_order, pin_code } = req.body;
  if (!name) return res.status(400).json({ error: 'Le nom est requis' });
  if (pin_code && !/^\d{4,8}$/.test(pin_code)) {
    return res.status(400).json({ error: 'Le code PIN doit contenir entre 4 et 8 chiffres' });
  }
  const id = crypto.randomUUID();
  await pool.query(
    'INSERT INTO barbers (id, name, sort_order, pin_code) VALUES (?, ?, ?, ?)',
    [id, name, Number(sort_order) || 0, pin_code || null]
  );
  const [[item]] = await pool.query('SELECT * FROM barbers WHERE id = ?', [id]);
  res.json({ ok: true, item: stripSecrets(item) });
}));

router.put('/:id', requireAdmin, wrap(async (req, res) => {
  const sets = [];
  const params = [];
  if (req.body.name !== undefined) { sets.push('name = ?'); params.push(req.body.name); }
  if (req.body.active !== undefined) { sets.push('active = ?'); params.push(req.body.active ? 1 : 0); }
  if (req.body.sort_order !== undefined) { sets.push('sort_order = ?'); params.push(Number(req.body.sort_order) || 0); }
  if (req.body.pin_code !== undefined) {
    if (req.body.pin_code && !/^\d{4,8}$/.test(req.body.pin_code)) {
      return res.status(400).json({ error: 'Le code PIN doit contenir entre 4 et 8 chiffres' });
    }
    sets.push('pin_code = ?'); params.push(req.body.pin_code || null);
  }
  if (!sets.length) return res.json({ ok: true });
  params.push(req.params.id);
  await pool.query(`UPDATE barbers SET ${sets.join(', ')} WHERE id = ?`, params);
  res.json({ ok: true });
}));

router.delete('/:id', requireAdmin, wrap(async (req, res) => {
  await pool.query('UPDATE barbers SET active = 0 WHERE id = ?', [req.params.id]);
  res.json({ ok: true, archived: true });
}));

/**
 * Connexion d'un coiffeur par code PIN (pour "Mon poste" sur son téléphone).
 * Ne nécessite pas le mot de passe admin : posséder le bon PIN suffit.
 */
router.post('/login', wrap(async (req, res) => {
  const pin = String(req.body.pin || '').trim();
  if (!pin) return res.status(400).json({ error: 'Code PIN requis' });

  const [[barber]] = await pool.query(
    'SELECT id, name FROM barbers WHERE pin_code = ? AND active = 1 LIMIT 1',
    [pin]
  );
  if (!barber) return res.status(401).json({ error: 'Code PIN incorrect' });

  res.json({ ok: true, barber });
}));

/**
 * Remplace tous les horaires d'un coiffeur d'un coup.
 * Corps attendu : { schedules: [{ weekday, start_time, end_time, active }, ...] }
 */
router.put('/:id/schedule', requireAdmin, wrap(async (req, res) => {
  const list = Array.isArray(req.body.schedules) ? req.body.schedules : [];

  await pool.query('DELETE FROM barber_schedules WHERE barber_id = ?', [req.params.id]);

  const rows = list
    .filter((s) => s.active && s.start_time && s.end_time)
    .map((s) => [crypto.randomUUID(), req.params.id, Number(s.weekday), s.start_time, s.end_time, 1]);

  if (rows.length) {
    await pool.query(
      'INSERT INTO barber_schedules (id, barber_id, weekday, start_time, end_time, active) VALUES ?',
      [rows]
    );
  }

  res.json({ ok: true, saved: rows.length });
}));

module.exports = router;
