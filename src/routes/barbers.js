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
    ? 'SELECT * FROM barbers WHERE salon_id = ? ORDER BY sort_order, name'
    : 'SELECT * FROM barbers WHERE salon_id = ? AND active = 1 ORDER BY sort_order, name';
  const [barbers] = await pool.query(sql, [req.salon.id]);
  const [schedules] = await pool.query(
    `SELECT bs.* FROM barber_schedules bs
     JOIN barbers b ON b.id = bs.barber_id
     WHERE b.salon_id = ?`,
    [req.salon.id]
  );
  const [svcExcl] = await pool.query(
    `SELECT bse.* FROM barber_service_exclusions bse
     JOIN barbers b ON b.id = bse.barber_id WHERE b.salon_id = ?`,
    [req.salon.id]
  );
  const [extExcl] = await pool.query(
    `SELECT bee.* FROM barber_extra_exclusions bee
     JOIN barbers b ON b.id = bee.barber_id WHERE b.salon_id = ?`,
    [req.salon.id]
  );

  // Identifiants de prestations/suppléments NON réalisés par ce coiffeur —
  // pas un secret (les catalogues sont déjà publics), utile au kiosk pour
  // filtrer le formulaire une fois le coiffeur choisi.
  const items = barbers.map((b) => Object.assign({}, stripSecrets(b), {
    schedules: schedules.filter((s) => s.barber_id === b.id).sort((a, c) => a.weekday - c.weekday),
    disabled_service_ids: svcExcl.filter((e) => e.barber_id === b.id).map((e) => e.service_id),
    disabled_extra_ids: extExcl.filter((e) => e.barber_id === b.id).map((e) => e.extra_id)
  }));

  res.json({ ok: true, items, on_duty: await activeBarberCount(req.salon.id) });
}));

router.post('/', requireAdmin, wrap(async (req, res) => {
  const { name, sort_order, pin_code, photo_url } = req.body;
  if (!name) return res.status(400).json({ error: 'Le nom est requis' });
  if (pin_code && !/^\d{4,8}$/.test(pin_code)) {
    return res.status(400).json({ error: 'Le code PIN doit contenir entre 4 et 8 chiffres' });
  }
  const id = crypto.randomUUID();
  try {
    await pool.query(
      'INSERT INTO barbers (id, salon_id, name, sort_order, pin_code, photo_url) VALUES (?, ?, ?, ?, ?, ?)',
      [id, req.salon.id, name, Number(sort_order) || 0, pin_code || null, photo_url || null]
    );
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Ce code PIN est déjà utilisé par un autre coiffeur de ce salon' });
    }
    throw err;
  }
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
  if (req.body.photo_url !== undefined) { sets.push('photo_url = ?'); params.push(req.body.photo_url || null); }
  if (!sets.length) return res.json({ ok: true });
  params.push(req.params.id, req.salon.id);
  try {
    await pool.query(`UPDATE barbers SET ${sets.join(', ')} WHERE id = ? AND salon_id = ?`, params);
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Ce code PIN est déjà utilisé par un autre coiffeur de ce salon' });
    }
    throw err;
  }
  res.json({ ok: true });
}));

router.delete('/:id', requireAdmin, wrap(async (req, res) => {
  await pool.query('UPDATE barbers SET active = 0 WHERE id = ? AND salon_id = ?', [req.params.id, req.salon.id]);
  res.json({ ok: true, archived: true });
}));

/**
 * Connexion d'un coiffeur par code PIN (pour "Mon poste" sur son téléphone).
 * Ne nécessite pas le mot de passe admin : posséder le bon PIN pour CE
 * salon suffit.
 */
router.post('/login', wrap(async (req, res) => {
  const pin = String(req.body.pin || '').trim();
  if (!pin) return res.status(400).json({ error: 'Code PIN requis' });

  const [[barber]] = await pool.query(
    'SELECT id, name FROM barbers WHERE salon_id = ? AND pin_code = ? AND active = 1 LIMIT 1',
    [req.salon.id, pin]
  );
  if (!barber) return res.status(401).json({ error: 'Code PIN incorrect' });

  res.json({ ok: true, barber });
}));

/**
 * Remplace tous les horaires d'un coiffeur d'un coup.
 * Corps attendu : { schedules: [{ weekday, start_time, end_time, active }, ...] }
 */
router.put('/:id/schedule', requireAdmin, wrap(async (req, res) => {
  const [[owned]] = await pool.query(
    'SELECT id FROM barbers WHERE id = ? AND salon_id = ?',
    [req.params.id, req.salon.id]
  );
  if (!owned) return res.status(404).json({ error: 'Coiffeur introuvable' });

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

/**
 * Statistiques d'un coiffeur sur une période donnée. Le client calcule
 * lui-même les bornes (start/end en ISO UTC) à partir de son fuseau
 * local — le serveur se contente de filtrer, évitant tout décalage
 * jour/heure entre le fuseau du serveur et celui du salon.
 */
router.get('/:id/stats', requireAdmin, wrap(async (req, res) => {
  const { start, end } = req.query;
  if (!start || !end) return res.status(400).json({ error: 'start et end requis (ISO)' });

  const [[owned]] = await pool.query(
    'SELECT id FROM barbers WHERE id = ? AND salon_id = ?',
    [req.params.id, req.salon.id]
  );
  if (!owned) return res.status(404).json({ error: 'Coiffeur introuvable' });

  const startSql = new Date(start).toISOString().slice(0, 19).replace('T', ' ');
  const endSql = new Date(end).toISOString().slice(0, 19).replace('T', ' ');

  const [[row]] = await pool.query(
    `SELECT COUNT(*) AS done_count, COALESCE(SUM(total_price_cents), 0) AS revenue_cents
     FROM queue
     WHERE barber_id = ? AND salon_id = ? AND status = 'done'
     AND end_at >= ? AND end_at < ?`,
    [req.params.id, req.salon.id, startSql, endSql]
  );

  res.json({ ok: true, done_count: Number(row.done_count), revenue_cents: Number(row.revenue_cents) });
}));

/**
 * Congés / absences ponctuelles d'un coiffeur.
 */
router.get('/:id/leaves', requireAdmin, wrap(async (req, res) => {
  const [rows] = await pool.query(
    `SELECT bl.id, bl.start_date, bl.end_date, bl.note
     FROM barber_leaves bl JOIN barbers b ON b.id = bl.barber_id
     WHERE bl.barber_id = ? AND b.salon_id = ? ORDER BY bl.start_date DESC`,
    [req.params.id, req.salon.id]
  );
  res.json({ ok: true, items: rows });
}));

router.post('/:id/leaves', requireAdmin, wrap(async (req, res) => {
  const { start_date, end_date, note } = req.body;
  if (!start_date || !end_date) return res.status(400).json({ error: 'Dates de début et de fin requises' });
  if (end_date < start_date) return res.status(400).json({ error: 'La date de fin doit suivre la date de début' });

  const [[owned]] = await pool.query(
    'SELECT id FROM barbers WHERE id = ? AND salon_id = ?',
    [req.params.id, req.salon.id]
  );
  if (!owned) return res.status(404).json({ error: 'Coiffeur introuvable' });

  const id = crypto.randomUUID();
  await pool.query(
    'INSERT INTO barber_leaves (id, barber_id, start_date, end_date, note) VALUES (?, ?, ?, ?, ?)',
    [id, req.params.id, start_date, end_date, note || null]
  );
  res.json({ ok: true, item: { id, start_date, end_date, note: note || null } });
}));

router.delete('/:id/leaves/:leaveId', requireAdmin, wrap(async (req, res) => {
  await pool.query(
    `DELETE bl FROM barber_leaves bl JOIN barbers b ON b.id = bl.barber_id
     WHERE bl.id = ? AND bl.barber_id = ? AND b.salon_id = ?`,
    [req.params.leaveId, req.params.id, req.salon.id]
  );
  res.json({ ok: true });
}));

/**
 * Prestations et suppléments qu'un coiffeur réalise ou non.
 * Par défaut tout est activé ; on ne stocke que les exclusions.
 */
router.get('/:id/capabilities', requireAdmin, wrap(async (req, res) => {
  const [[owned]] = await pool.query(
    'SELECT id FROM barbers WHERE id = ? AND salon_id = ?',
    [req.params.id, req.salon.id]
  );
  if (!owned) return res.status(404).json({ error: 'Coiffeur introuvable' });

  const [services] = await pool.query(
    'SELECT id, name, price_cents FROM services WHERE salon_id = ? AND active = 1 ORDER BY sort_order, name',
    [req.salon.id]
  );
  const [extras] = await pool.query(
    'SELECT id, name, price_cents FROM extras WHERE salon_id = ? AND active = 1 ORDER BY sort_order, name',
    [req.salon.id]
  );
  const [svcExcl] = await pool.query(
    'SELECT service_id FROM barber_service_exclusions WHERE barber_id = ?', [req.params.id]
  );
  const [extExcl] = await pool.query(
    'SELECT extra_id FROM barber_extra_exclusions WHERE barber_id = ?', [req.params.id]
  );
  const [svcPrices] = await pool.query(
    'SELECT service_id, price_cents FROM barber_service_prices WHERE barber_id = ?', [req.params.id]
  );
  const [extPrices] = await pool.query(
    'SELECT extra_id, price_cents FROM barber_extra_prices WHERE barber_id = ?', [req.params.id]
  );
  const disabledSvc = new Set(svcExcl.map((r) => r.service_id));
  const disabledExt = new Set(extExcl.map((r) => r.extra_id));
  const svcPriceById = Object.fromEntries(svcPrices.map((p) => [p.service_id, p.price_cents]));
  const extPriceById = Object.fromEntries(extPrices.map((p) => [p.extra_id, p.price_cents]));

  res.json({
    ok: true,
    services: services.map((s) => Object.assign({}, s, {
      enabled: !disabledSvc.has(s.id),
      default_price_cents: s.price_cents,
      custom_price_cents: svcPriceById[s.id] !== undefined ? svcPriceById[s.id] : null
    })),
    extras: extras.map((e) => Object.assign({}, e, {
      enabled: !disabledExt.has(e.id),
      default_price_cents: e.price_cents,
      custom_price_cents: extPriceById[e.id] !== undefined ? extPriceById[e.id] : null
    }))
  });
}));

router.put('/:id/capabilities', requireAdmin, wrap(async (req, res) => {
  const [[owned]] = await pool.query(
    'SELECT id FROM barbers WHERE id = ? AND salon_id = ?',
    [req.params.id, req.salon.id]
  );
  if (!owned) return res.status(404).json({ error: 'Coiffeur introuvable' });

  const disabledServiceIds = Array.isArray(req.body.disabled_service_ids) ? req.body.disabled_service_ids : [];
  const disabledExtraIds = Array.isArray(req.body.disabled_extra_ids) ? req.body.disabled_extra_ids : [];
  // { [serviceId]: price_cents } — une valeur null/absente remet le tarif par défaut
  const servicePrices = req.body.service_prices && typeof req.body.service_prices === 'object' ? req.body.service_prices : {};
  const extraPrices = req.body.extra_prices && typeof req.body.extra_prices === 'object' ? req.body.extra_prices : {};

  await pool.query('DELETE FROM barber_service_exclusions WHERE barber_id = ?', [req.params.id]);
  await pool.query('DELETE FROM barber_extra_exclusions WHERE barber_id = ?', [req.params.id]);
  await pool.query('DELETE FROM barber_service_prices WHERE barber_id = ?', [req.params.id]);
  await pool.query('DELETE FROM barber_extra_prices WHERE barber_id = ?', [req.params.id]);

  if (disabledServiceIds.length) {
    await pool.query(
      'INSERT INTO barber_service_exclusions (barber_id, service_id) VALUES ?',
      [disabledServiceIds.map((id) => [req.params.id, id])]
    );
  }
  if (disabledExtraIds.length) {
    await pool.query(
      'INSERT INTO barber_extra_exclusions (barber_id, extra_id) VALUES ?',
      [disabledExtraIds.map((id) => [req.params.id, id])]
    );
  }

  const svcPriceRows = Object.entries(servicePrices)
    .filter(([, cents]) => cents !== null && cents !== '' && !Number.isNaN(Number(cents)))
    .map(([serviceId, cents]) => [req.params.id, serviceId, Math.round(Number(cents))]);
  if (svcPriceRows.length) {
    await pool.query('INSERT INTO barber_service_prices (barber_id, service_id, price_cents) VALUES ?', [svcPriceRows]);
  }

  const extPriceRows = Object.entries(extraPrices)
    .filter(([, cents]) => cents !== null && cents !== '' && !Number.isNaN(Number(cents)))
    .map(([extraId, cents]) => [req.params.id, extraId, Math.round(Number(cents))]);
  if (extPriceRows.length) {
    await pool.query('INSERT INTO barber_extra_prices (barber_id, extra_id, price_cents) VALUES ?', [extPriceRows]);
  }

  res.json({ ok: true });
}));

module.exports = router;
