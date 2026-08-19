const express = require('express');
const crypto = require('crypto');
const { pool } = require('../db');
const { activeBarberCount } = require('../lib/queueMath');
const requireAdmin = require('../middleware/auth');
const { loginRateLimiter } = require('../middleware/rateLimiter');

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
  const [breaks] = await pool.query(
    `SELECT bb.* FROM barber_breaks bb
     JOIN barbers b ON b.id = bb.barber_id
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

  // Heure de salon actuelle (jour + minutes depuis minuit) pour
  // déterminer si un coiffeur est actuellement en pause — le kiosk
  // s'appuie sur ce booléen tout calculé plutôt que de refaire ce calcul
  // côté navigateur (évite toute divergence de fuseau horaire).
  const nowParts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(new Date());
  const g = (t) => nowParts.find((p) => p.type === t).value;
  const nowWeekday = new Date(`${g('year')}-${g('month')}-${g('day')}T00:00:00Z`).getUTCDay();
  const nowMinutes = Number(g('hour')) * 60 + Number(g('minute'));
  const toMinutes = (t) => { const [h, m] = String(t).split(':').map(Number); return h * 60 + m; };

  // Identifiants de prestations/suppléments NON réalisés par ce coiffeur —
  // pas un secret (les catalogues sont déjà publics), utile au kiosk pour
  // filtrer le formulaire une fois le coiffeur choisi.
  const items = barbers.map((b) => {
    const myBreaksToday = breaks.filter((bk) => bk.barber_id === b.id && bk.active && bk.weekday === nowWeekday);
    const onBreakNow = myBreaksToday.some((bk) => nowMinutes >= toMinutes(bk.start_time) && nowMinutes < toMinutes(bk.end_time));

    // En dehors de ses horaires de travail (pas de plage active pour
    // aujourd'hui, ou hors de la plage horaire) - le kiosk (sans-RDV)
    // ne doit jamais proposer un coiffeur qui a fini sa journée, ou
    // qui n'est pas encore arrivé. Ne s'applique QUE si des horaires
    // ont été explicitement réglés pour ce coiffeur au moins un jour
    // de la semaine - sinon (jamais configuré), on garde le
    // comportement historique "toujours disponible" pour ne pas
    // masquer silencieusement un coiffeur qu'on vient de créer.
    const myScheduleEver = schedules.filter((s) => s.barber_id === b.id);
    const myScheduleToday = myScheduleEver.filter((s) => s.active && s.weekday === nowWeekday);
    const withinHours = myScheduleToday.some((s) => nowMinutes >= toMinutes(s.start_time) && nowMinutes < toMinutes(s.end_time));
    const outsideHoursNow = myScheduleEver.length > 0 && !withinHours;

    return Object.assign({}, stripSecrets(b), {
      schedules: schedules.filter((s) => s.barber_id === b.id).sort((a, c) => a.weekday - c.weekday),
      breaks: breaks.filter((bk) => bk.barber_id === b.id).sort((a, c) => a.weekday - c.weekday),
      on_break_now: onBreakNow,
      outside_hours_now: outsideHoursNow,
      disabled_service_ids: svcExcl.filter((e) => e.barber_id === b.id).map((e) => e.service_id),
      disabled_extra_ids: extExcl.filter((e) => e.barber_id === b.id).map((e) => e.extra_id)
    });
  });

  res.json({ ok: true, items, on_duty: await activeBarberCount(req.salon.id) });
}));

router.post('/', requireAdmin, wrap(async (req, res) => {
  const { name, sort_order, pin_code, photo_url } = req.body;
  if (!name) return res.status(400).json({ error: 'Le nom est requis' });
  if (pin_code && !/^\d{4,8}$/.test(pin_code)) {
    return res.status(400).json({ error: 'Le code PIN doit contenir entre 4 et 8 chiffres' });
  }
  // Équipe figée dès la création : plus de "masqué en attendant qu'on
  // choisisse" - il faut savoir tout de suite si ce coiffeur rejoint
  // l'équipe Sans RDV (visible kiosk) ou RDV en ligne (visible rdv.html),
  // les deux équipes ne se recoupent jamais.
  const modeMap = {
    walkin: { accepts_appointments: 0, kiosk_hidden: 0 },
    online: { accepts_appointments: 1, kiosk_hidden: 1 }
  };
  if (!modeMap[req.body.mode]) {
    return res.status(400).json({ error: "mode doit être 'walkin' ou 'online'" });
  }
  const { accepts_appointments, kiosk_hidden } = modeMap[req.body.mode];
  const id = crypto.randomUUID();
  try {
    await pool.query(
      'INSERT INTO barbers (id, salon_id, name, sort_order, pin_code, photo_url, accepts_appointments, kiosk_hidden) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [id, req.salon.id, name, Number(sort_order) || 0, pin_code || null, photo_url || null, accepts_appointments, kiosk_hidden]
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

  // Un seul mode possible par coiffeur, plus de "disponible partout"
  // implicite : le client envoie 'walkin' | 'online' | 'none', traduit
  // ici en les deux colonnes historiques pour ne rien casser ailleurs
  // dans le code (kiosk.html, rdv.html, appointments.js les lisent
  // toujours telles quelles).
  //   'walkin' -> accepts_appointments=0, kiosk_hidden=0 (visible kiosk seul)
  //   'online' -> accepts_appointments=1, kiosk_hidden=1 (visible RDV seul)
  //   'none'   -> accepts_appointments=0, kiosk_hidden=1 (masqué partout)
  if (req.body.mode !== undefined) {
    const mode = req.body.mode;
    const map = {
      walkin: { accepts_appointments: 0, kiosk_hidden: 0 },
      online: { accepts_appointments: 1, kiosk_hidden: 1 },
      none: { accepts_appointments: 0, kiosk_hidden: 1 }
    };
    if (!map[mode]) return res.status(400).json({ error: "mode doit être 'walkin', 'online' ou 'none'" });
    sets.push('accepts_appointments = ?'); params.push(map[mode].accepts_appointments);
    sets.push('kiosk_hidden = ?'); params.push(map[mode].kiosk_hidden);
  }
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
router.post('/login', loginRateLimiter('barber-pin-login'), wrap(async (req, res) => {
  const pin = String(req.body.pin || '').trim();
  if (!pin) return res.status(400).json({ error: 'Code PIN requis' });

  const [[barber]] = await pool.query(
    'SELECT id, name, accepts_appointments FROM barbers WHERE salon_id = ? AND pin_code = ? AND active = 1 LIMIT 1',
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

  // Pauses (ex: déjeuner) — même principe que les horaires : on
  // remplace tout à chaque sauvegarde, plusieurs pauses possibles par
  // jour (weekday peut se répéter dans la liste).
  const breakList = Array.isArray(req.body.breaks) ? req.body.breaks : [];
  await pool.query('DELETE FROM barber_breaks WHERE barber_id = ?', [req.params.id]);
  const breakRows = breakList
    .filter((b) => b.start_time && b.end_time)
    .map((b) => [crypto.randomUUID(), req.params.id, Number(b.weekday), b.start_time, b.end_time, 1]);
  if (breakRows.length) {
    await pool.query(
      'INSERT INTO barber_breaks (id, barber_id, weekday, start_time, end_time, active) VALUES ?',
      [breakRows]
    );
  }

  res.json({ ok: true, saved: rows.length, breaks_saved: breakRows.length });
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
    'SELECT id, name, price_cents, duration_min FROM services WHERE salon_id = ? AND active = 1 ORDER BY sort_order, name',
    [req.salon.id]
  );
  const [extras] = await pool.query(
    'SELECT id, name, price_cents, duration_min FROM extras WHERE salon_id = ? AND active = 1 ORDER BY sort_order, name',
    [req.salon.id]
  );
  const [svcExcl] = await pool.query(
    'SELECT service_id FROM barber_service_exclusions WHERE barber_id = ?', [req.params.id]
  );
  const [extExcl] = await pool.query(
    'SELECT extra_id FROM barber_extra_exclusions WHERE barber_id = ?', [req.params.id]
  );
  const [svcOverrides] = await pool.query(
    'SELECT service_id, price_cents, duration_min FROM barber_service_prices WHERE barber_id = ?', [req.params.id]
  );
  const [extOverrides] = await pool.query(
    'SELECT extra_id, price_cents, duration_min FROM barber_extra_prices WHERE barber_id = ?', [req.params.id]
  );
  const disabledSvc = new Set(svcExcl.map((r) => r.service_id));
  const disabledExt = new Set(extExcl.map((r) => r.extra_id));
  const svcOverrideById = Object.fromEntries(svcOverrides.map((p) => [p.service_id, p]));
  const extOverrideById = Object.fromEntries(extOverrides.map((p) => [p.extra_id, p]));

  res.json({
    ok: true,
    services: services.map((s) => {
      const o = svcOverrideById[s.id];
      return Object.assign({}, s, {
        enabled: !disabledSvc.has(s.id),
        default_price_cents: s.price_cents,
        default_duration_min: s.duration_min,
        custom_price_cents: o && o.price_cents !== null ? o.price_cents : null,
        custom_duration_min: o && o.duration_min !== null ? o.duration_min : null
      });
    }),
    extras: extras.map((e) => {
      const o = extOverrideById[e.id];
      return Object.assign({}, e, {
        enabled: !disabledExt.has(e.id),
        default_price_cents: e.price_cents,
        default_duration_min: e.duration_min,
        custom_price_cents: o && o.price_cents !== null ? o.price_cents : null,
        custom_duration_min: o && o.duration_min !== null ? o.duration_min : null
      });
    })
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
  // { [itemId]: valeur } — une valeur null/absente remet le tarif ou la
  // durée par défaut. Un item n'a une ligne enregistrée que si AU MOINS
  // un des deux (prix ou durée) est personnalisé.
  const servicePrices = req.body.service_prices && typeof req.body.service_prices === 'object' ? req.body.service_prices : {};
  const extraPrices = req.body.extra_prices && typeof req.body.extra_prices === 'object' ? req.body.extra_prices : {};
  const serviceDurations = req.body.service_durations && typeof req.body.service_durations === 'object' ? req.body.service_durations : {};
  const extraDurations = req.body.extra_durations && typeof req.body.extra_durations === 'object' ? req.body.extra_durations : {};

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

  function toNum(v) {
    return (v !== null && v !== undefined && v !== '' && !Number.isNaN(Number(v))) ? Math.round(Number(v)) : null;
  }

  const svcIds = new Set([...Object.keys(servicePrices), ...Object.keys(serviceDurations)]);
  const svcRows = [...svcIds]
    .map((id) => [id, toNum(servicePrices[id]), toNum(serviceDurations[id])])
    .filter(([, price, duration]) => price !== null || duration !== null)
    .map(([serviceId, price, duration]) => [req.params.id, serviceId, price, duration]);
  if (svcRows.length) {
    await pool.query(
      'INSERT INTO barber_service_prices (barber_id, service_id, price_cents, duration_min) VALUES ?',
      [svcRows]
    );
  }

  const extIds = new Set([...Object.keys(extraPrices), ...Object.keys(extraDurations)]);
  const extRows = [...extIds]
    .map((id) => [id, toNum(extraPrices[id]), toNum(extraDurations[id])])
    .filter(([, price, duration]) => price !== null || duration !== null)
    .map(([extraId, price, duration]) => [req.params.id, extraId, price, duration]);
  if (extRows.length) {
    await pool.query(
      'INSERT INTO barber_extra_prices (barber_id, extra_id, price_cents, duration_min) VALUES ?',
      [extRows]
    );
  }

  res.json({ ok: true });
}));

module.exports = router;
