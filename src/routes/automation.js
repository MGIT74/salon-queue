const express = require('express');
const { pool, getSettings } = require('../db');
const requireAutomationKey = require('../middleware/automationAuth');
const { computeSlotsForBarber, nowInParis } = require('./appointments');
const { sendCustomClientEmail } = require('../lib/mailer');

const router = express.Router();

function wrap(fn) {
  return function (req, res) {
    fn(req, res).catch((err) => {
      console.error(err);
      res.status(500).json({ error: err.message });
    });
  };
}

/**
 * Liste tous les salons actifs - nécessaire pour qu'un workflow
 * d'automatisation (ex: rapport quotidien) puisse boucler sur
 * l'ensemble d'entre eux en une seule exécution.
 */
router.get('/salons', requireAutomationKey, wrap(async (req, res) => {
  // L'email du propriétaire est inclus ici pour permettre l'envoi
  // d'un rapport individuel à CHAQUE salon (pas un seul email combiné
  // envoyé à une adresse fixe) - chaque propriétaire ne reçoit que le
  // rapport de son ou ses propres salons.
  const [rows] = await pool.query(
    `SELECT s.id, s.name, s.slug, o.email AS owner_email
     FROM salons s JOIN owners o ON o.id = s.owner_id
     WHERE s.active = 1 ORDER BY s.created_at`
  );
  res.json({ ok: true, items: rows });
}));

/**
 * Données agrégées du jour pour UN salon précis - pensé pour un
 * rapport quotidien automatisé (n8n + IA) : chiffre d'affaires encaissé
 * aujourd'hui, prestation la plus demandée, et une estimation du
 * nombre de créneaux encore libres aujourd'hui (tous coiffeurs RDV
 * confondus). Calculs faits ici en code, pas par l'IA - elle ne fait
 * que lire et présenter ces vrais chiffres ensuite.
 */
router.get('/salons/:id/daily-report', requireAutomationKey, wrap(async (req, res) => {
  const salonId = req.params.id;
  const [[salon]] = await pool.query('SELECT id, name FROM salons WHERE id = ? AND active = 1', [salonId]);
  if (!salon) return res.status(404).json({ error: 'Salon introuvable ou inactif' });

  const [[revenueRow]] = await pool.query(
    `SELECT COUNT(*) AS done_count, COALESCE(SUM(total_price_cents), 0) AS revenue_cents
     FROM queue WHERE salon_id = ? AND status = 'done' AND end_at >= CURDATE()`,
    [salonId]
  );

  const [[topService]] = await pool.query(
    `SELECT s.name, COUNT(*) AS cnt
     FROM queue q JOIN services s ON s.id = q.service_id
     WHERE q.salon_id = ? AND q.status = 'done' AND q.end_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
     GROUP BY q.service_id, s.name ORDER BY cnt DESC LIMIT 1`,
    [salonId]
  );

  const settings = await getSettings(salonId);
  const [barbers] = await pool.query(
    'SELECT id FROM barbers WHERE salon_id = ? AND active = 1 AND accepts_appointments = 1', [salonId]
  );

  // Estimation avec la durée moyenne des prestations réellement
  // vendues (ou 30 min à défaut) - approximation volontaire, ce
  // rapport donne un ordre de grandeur, pas un calcul de réservation
  // exact.
  const [[avgDurationRow]] = await pool.query(
    `SELECT AVG(s.duration_min) AS avg_duration FROM queue q JOIN services s ON s.id = q.service_id
     WHERE q.salon_id = ? AND q.status = 'done' AND q.end_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)`,
    [salonId]
  );
  const durationMin = Math.round(Number(avgDurationRow.avg_duration) || 30);

  const todayStr = nowInParis().dateStr;
  let freeSlots = 0;
  for (const b of barbers) {
    const slots = await computeSlotsForBarber(b.id, todayStr, durationMin, settings, { skipLead: true });
    freeSlots += slots.length;
  }

  res.json({
    ok: true,
    salon_name: salon.name,
    date: todayStr,
    revenue_cents: Number(revenueRow.revenue_cents),
    done_count: Number(revenueRow.done_count),
    top_service: topService ? topService.name : null,
    top_service_count_30d: topService ? Number(topService.cnt) : 0,
    estimated_service_duration_min: durationMin,
    free_slots_today_estimate: freeSlots
  });
}));

/**
 * Liste tous les clients connus du salon (une entrée par email
 * distinct), avec leur dernière visite terminée. Pensé comme outil
 * pour l'assistant IA - lecture seule, jamais d'envoi ici.
 */
router.get('/salons/:id/clients', requireAutomationKey, wrap(async (req, res) => {
  const salonId = req.params.id;
  const [[salon]] = await pool.query('SELECT id FROM salons WHERE id = ? AND active = 1', [salonId]);
  if (!salon) return res.status(404).json({ error: 'Salon introuvable ou inactif' });

  const [rows] = await pool.query(
    `SELECT MAX(client_name) AS client_name, email, MAX(phone) AS phone, MAX(end_at) AS last_visit, COUNT(*) AS visit_count
     FROM queue
     WHERE salon_id = ? AND status = 'done' AND email IS NOT NULL AND email != ''
     GROUP BY email
     ORDER BY last_visit DESC
     LIMIT 300`,
    [salonId]
  );

  res.json({
    ok: true,
    items: rows.map((r) => ({
      client_name: r.client_name,
      email: r.email,
      phone: r.phone,
      last_visit: String(r.last_visit).slice(0, 10),
      visit_count: Number(r.visit_count)
    }))
  });
}));

/**
 * Clients dont la dernière visite terminée remonte à plus de N jours
 * (14 par défaut, "plus de 2 semaines") - pensé pour identifier qui
 * relancer par email quand le salon a une journée creuse.
 */
router.get('/salons/:id/inactive-clients', requireAutomationKey, wrap(async (req, res) => {
  const salonId = req.params.id;
  const days = Math.max(1, parseInt(req.query.days, 10) || 14);
  const [[salon]] = await pool.query('SELECT id FROM salons WHERE id = ? AND active = 1', [salonId]);
  if (!salon) return res.status(404).json({ error: 'Salon introuvable ou inactif' });

  const [rows] = await pool.query(
    `SELECT MAX(client_name) AS client_name, email, MAX(phone) AS phone, MAX(end_at) AS last_visit, COUNT(*) AS visit_count
     FROM queue
     WHERE salon_id = ? AND status = 'done' AND email IS NOT NULL AND email != ''
     GROUP BY email
     HAVING MAX(end_at) < DATE_SUB(NOW(), INTERVAL ? DAY)
     ORDER BY last_visit ASC
     LIMIT 300`,
    [salonId, days]
  );

  res.json({
    ok: true,
    days_threshold: days,
    items: rows.map((r) => ({
      client_name: r.client_name,
      email: r.email,
      phone: r.phone,
      last_visit: String(r.last_visit).slice(0, 10),
      visit_count: Number(r.visit_count)
    }))
  });
}));

/**
 * Envoie un email personnalisé à une liste précise de clients de CE
 * salon (jamais à une adresse arbitraire - chaque email doit
 * correspondre à un vrai client déjà venu dans ce salon, vérifié
 * avant envoi). Utilise le SMTP propre du salon (même mécanisme que
 * les emails automatiques existants).
 */
router.post('/salons/:id/send-client-email', requireAutomationKey, wrap(async (req, res) => {
  const salonId = req.params.id;
  const { subject, message } = req.body;
  // Accepte un vrai tableau OU une chaîne séparée par des virgules
  // (plus simple à produire de façon fiable pour un outil IA) -
  // normalisé ici une bonne fois pour toutes.
  const emails = Array.isArray(req.body.emails)
    ? req.body.emails
    : String(req.body.emails || '').split(',').map((e) => e.trim()).filter(Boolean);
  if (emails.length === 0) return res.status(400).json({ error: 'Liste emails requise' });
  if (!subject || !message) return res.status(400).json({ error: 'Sujet et message requis' });
  if (emails.length > 100) return res.status(400).json({ error: 'Maximum 100 destinataires par envoi' });

  const [[salon]] = await pool.query('SELECT id FROM salons WHERE id = ? AND active = 1', [salonId]);
  if (!salon) return res.status(404).json({ error: 'Salon introuvable ou inactif' });

  // Vérifie que chaque adresse correspond bien à un vrai client déjà
  // venu dans CE salon - empêche l'outil d'être détourné pour envoyer
  // à des adresses arbitraires.
  const [knownRows] = await pool.query(
    `SELECT DISTINCT email, client_name FROM queue WHERE salon_id = ? AND status = 'done' AND email IN (?)`,
    [salonId, emails]
  );
  const known = new Map(knownRows.map((r) => [r.email.toLowerCase(), r.client_name]));

  let sent = 0;
  let skipped = 0;
  const errors = [];

  for (const email of emails) {
    const clientName = known.get(String(email).toLowerCase());
    if (!clientName) { skipped++; continue; }
    try {
      await sendCustomClientEmail(salonId, email, clientName, subject, message);
      sent++;
    } catch (err) {
      errors.push({ email, error: err.message });
    }
  }

  res.json({ ok: true, sent, skipped_unknown_client: skipped, errors });
}));

/**
 * Statut de chaque coiffeur du salon en ce moment précis : en poste
 * (horaire du jour), en pause (créneau de pause du jour), en congé
 * (période de congé couvrant aujourd'hui) - réutilise exactement la
 * même logique que celle déjà utilisée ailleurs dans l'app (jamais
 * réinventée).
 */
router.get('/salons/:id/barbers-status', requireAutomationKey, wrap(async (req, res) => {
  const salonId = req.params.id;
  const [[salon]] = await pool.query('SELECT id FROM salons WHERE id = ? AND active = 1', [salonId]);
  if (!salon) return res.status(404).json({ error: 'Salon introuvable ou inactif' });

  const [barbers] = await pool.query(
    'SELECT id, name, active, accepts_appointments FROM barbers WHERE salon_id = ? ORDER BY sort_order, name',
    [salonId]
  );

  const nowParis = nowInParis();
  const weekday = new Date(nowParis.dateStr + 'T00:00:00Z').getUTCDay();
  const hh = String(Math.floor(nowParis.minutes / 60)).padStart(2, '0');
  const mm = String(nowParis.minutes % 60).padStart(2, '0');
  const hhmm = `${hh}:${mm}:00`;
  const todayStr = nowParis.dateStr;

  const [schedules] = await pool.query(
    `SELECT bs.barber_id, bs.start_time, bs.end_time FROM barber_schedules bs
     JOIN barbers b ON b.id = bs.barber_id
     WHERE b.salon_id = ? AND bs.weekday = ? AND bs.active = 1`,
    [salonId, weekday]
  );
  const [breaks] = await pool.query(
    `SELECT bb.barber_id, bb.start_time, bb.end_time FROM barber_breaks bb
     JOIN barbers b ON b.id = bb.barber_id
     WHERE b.salon_id = ? AND bb.weekday = ? AND bb.active = 1`,
    [salonId, weekday]
  );
  const [leaves] = await pool.query(
    `SELECT bl.barber_id FROM barber_leaves bl
     JOIN barbers b ON b.id = bl.barber_id
     WHERE b.salon_id = ? AND ? BETWEEN bl.start_date AND bl.end_date`,
    [salonId, todayStr]
  );
  const onLeaveIds = new Set(leaves.map((l) => l.barber_id));

  const items = barbers.map((b) => {
    const onLeave = onLeaveIds.has(b.id);
    const todaySchedule = schedules.find((s) => s.barber_id === b.id);
    const onDutyNow = !onLeave && Boolean(todaySchedule) && todaySchedule.start_time <= hhmm && hhmm < todaySchedule.end_time;
    const onBreakNow = onDutyNow && breaks.some((br) => br.barber_id === b.id && br.start_time <= hhmm && hhmm < br.end_time);
    return {
      id: b.id,
      name: b.name,
      active: Boolean(b.active),
      accepts_appointments: Boolean(b.accepts_appointments),
      on_leave_today: onLeave,
      working_today: Boolean(todaySchedule),
      today_hours: todaySchedule ? todaySchedule.start_time.slice(0, 5) + '-' + todaySchedule.end_time.slice(0, 5) : null,
      on_duty_now: onDutyNow,
      on_break_now: Boolean(onBreakNow)
    };
  });

  res.json({ ok: true, items });
}));

/**
 * Tous les tarifs du salon en un seul appel : prestations,
 * suppléments, produits en vente.
 */
router.get('/salons/:id/prices', requireAutomationKey, wrap(async (req, res) => {
  const salonId = req.params.id;
  const [[salon]] = await pool.query('SELECT id FROM salons WHERE id = ? AND active = 1', [salonId]);
  if (!salon) return res.status(404).json({ error: 'Salon introuvable ou inactif' });

  const [services, extras, products] = await Promise.all([
    pool.query('SELECT name, duration_min, price_cents FROM services WHERE salon_id = ? AND active = 1 ORDER BY sort_order', [salonId]),
    pool.query('SELECT name, duration_min, price_cents FROM extras WHERE salon_id = ? AND active = 1 ORDER BY sort_order', [salonId]),
    pool.query('SELECT name, category, price_cents, stock_enabled, stock_quantity FROM products WHERE salon_id = ? AND active = 1 ORDER BY sort_order', [salonId])
  ]);

  const fmt = (rows) => rows[0].map((r) => Object.assign({}, r, { price_euros: r.price_cents / 100 }));

  const productsWithStock = fmt(products).map((p) => Object.assign({}, p, {
    stock_status: p.stock_enabled ? (p.stock_quantity > 0 ? p.stock_quantity + ' en stock' : 'rupture de stock') : 'illimité'
  }));

  res.json({
    ok: true,
    services: fmt(services),
    extras: fmt(extras),
    products: productsWithStock
  });
}));

/**
 * Horaires généraux de chaque coiffeur (grille de la semaine type,
 * pas seulement aujourd'hui) - utile pour répondre à "quand travaille
 * untel habituellement ?".
 */
router.get('/salons/:id/barbers-schedules', requireAutomationKey, wrap(async (req, res) => {
  const salonId = req.params.id;
  const [[salon]] = await pool.query('SELECT id FROM salons WHERE id = ? AND active = 1', [salonId]);
  if (!salon) return res.status(404).json({ error: 'Salon introuvable ou inactif' });

  const [barbers] = await pool.query('SELECT id, name FROM barbers WHERE salon_id = ? AND active = 1 ORDER BY sort_order, name', [salonId]);
  const [schedules] = await pool.query(
    `SELECT bs.barber_id, bs.weekday, bs.start_time, bs.end_time FROM barber_schedules bs
     JOIN barbers b ON b.id = bs.barber_id
     WHERE b.salon_id = ? AND bs.active = 1
     ORDER BY bs.weekday`,
    [salonId]
  );

  const dayNames = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
  const items = barbers.map((b) => ({
    id: b.id,
    name: b.name,
    weekly_schedule: schedules
      .filter((s) => s.barber_id === b.id)
      .map((s) => ({ day: dayNames[s.weekday], hours: s.start_time.slice(0, 5) + '-' + s.end_time.slice(0, 5) }))
  }));

  res.json({ ok: true, items });
}));

/**
 * Historique des prestations réellement effectuées (terminées) sur
 * une période donnée - "qu'est-ce qui s'est passé du X au Y". Filtre
 * optionnel par coiffeur. Toujours les vraies données facturées
 * (queue.total_price_cents), jamais estimées.
 */
router.get('/salons/:id/history', requireAutomationKey, wrap(async (req, res) => {
  const salonId = req.params.id;
  const [[salon]] = await pool.query('SELECT id FROM salons WHERE id = ? AND active = 1', [salonId]);
  if (!salon) return res.status(404).json({ error: 'Salon introuvable ou inactif' });

  const todayParis = nowInParis().dateStr;
  const start = req.query.start || new Date(new Date(todayParis + 'T00:00:00Z').getTime() - 30 * 86400000).toISOString().slice(0, 10);
  const end = req.query.end || todayParis;
  const barberId = req.query.barber_id || null;

  const conditions = ['q.salon_id = ?', "q.status = 'done'", 'q.end_at BETWEEN ? AND ?'];
  const params = [salonId, start + ' 00:00:00', end + ' 23:59:59'];
  if (barberId) { conditions.push('q.barber_id = ?'); params.push(barberId); }

  const [rows] = await pool.query(
    `SELECT q.client_name, q.end_at, q.total_price_cents, s.name AS service_name, b.name AS barber_name
     FROM queue q
     LEFT JOIN services s ON s.id = q.service_id
     LEFT JOIN barbers b ON b.id = q.barber_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY q.end_at DESC
     LIMIT 300`,
    params
  );

  res.json({
    ok: true,
    start,
    end,
    items: rows.map((r) => ({
      client_name: r.client_name,
      when: String(r.end_at),
      service_name: r.service_name,
      barber_name: r.barber_name,
      price_euros: r.total_price_cents / 100
    }))
  });
}));

/**
 * Chiffre d'affaires réellement encaissé sur n'importe quelle période
 * (pas seulement aujourd'hui) - total, nombre de prestations, et
 * répartition par coiffeur.
 */
router.get('/salons/:id/revenue', requireAutomationKey, wrap(async (req, res) => {
  const salonId = req.params.id;
  const [[salon]] = await pool.query('SELECT id FROM salons WHERE id = ? AND active = 1', [salonId]);
  if (!salon) return res.status(404).json({ error: 'Salon introuvable ou inactif' });

  const start = req.query.start || nowInParis().dateStr;
  const end = req.query.end || nowInParis().dateStr;

  const [[totalRow]] = await pool.query(
    `SELECT COUNT(*) AS done_count, COALESCE(SUM(total_price_cents), 0) AS revenue_cents
     FROM queue WHERE salon_id = ? AND status = 'done' AND end_at BETWEEN ? AND ?`,
    [salonId, start + ' 00:00:00', end + ' 23:59:59']
  );

  const [byBarber] = await pool.query(
    `SELECT b.name AS barber_name, COUNT(*) AS done_count, COALESCE(SUM(q.total_price_cents), 0) AS revenue_cents
     FROM queue q LEFT JOIN barbers b ON b.id = q.barber_id
     WHERE q.salon_id = ? AND q.status = 'done' AND q.end_at BETWEEN ? AND ?
     GROUP BY q.barber_id, b.name
     ORDER BY revenue_cents DESC`,
    [salonId, start + ' 00:00:00', end + ' 23:59:59']
  );

  res.json({
    ok: true,
    start,
    end,
    total_revenue_euros: totalRow.revenue_cents / 100,
    total_services: Number(totalRow.done_count),
    by_barber: byBarber.map((r) => ({
      barber_name: r.barber_name || 'Non assigné',
      services_count: Number(r.done_count),
      revenue_euros: r.revenue_cents / 100
    }))
  });
}));

/**
 * Rendez-vous programmés sur une période (passée ou future) - "qui a
 * RDV demain", "combien de RDV cette semaine", "qui ne s'est pas
 * présenté sans prévenir". Distinct de /history (qui ne couvre que
 * les prestations déjà terminées).
 *
 * 4 statuts possibles, calculés exactement comme dans le reste de
 * l'app (jamais réinventés en double) :
 * - confirmed : à venir, ou en cours d'attente/de coupe le jour même
 * - cancelled : annulé (par le salon ou le client) avant même le jour J
 * - completed : la prestation a bien été effectuée
 * - no_show : le client ne s'est PAS présenté sans prévenir (le RDV
 *   est passé à l'heure prévue en file d'attente, mais a été annulé
 *   depuis la file plutôt qu'honoré - typiquement un no-show constaté
 *   par le coiffeur/l'admin ce jour-là)
 */
router.get('/salons/:id/appointments', requireAutomationKey, wrap(async (req, res) => {
  const salonId = req.params.id;
  const [[salon]] = await pool.query('SELECT id FROM salons WHERE id = ? AND active = 1', [salonId]);
  if (!salon) return res.status(404).json({ error: 'Salon introuvable ou inactif' });

  const start = req.query.start || nowInParis().dateStr;
  const end = req.query.end || start;
  const barberId = req.query.barber_id || null;
  const statusFilter = req.query.status || null; // confirmed | cancelled | completed | no_show

  const conditions = ['a.salon_id = ?', 'a.scheduled_at BETWEEN ? AND ?'];
  const params = [salonId, start + ' 00:00:00', end + ' 23:59:59'];
  if (barberId) { conditions.push('a.barber_id = ?'); params.push(barberId); }

  const [rows] = await pool.query(
    `SELECT a.client_name, a.scheduled_at, a.status, q.status AS queue_status,
            s.name AS service_name, b.name AS barber_name
     FROM appointments a
     LEFT JOIN services s ON s.id = a.service_id
     LEFT JOIN barbers b ON b.id = a.barber_id
     LEFT JOIN queue q ON q.id = a.promoted_queue_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY a.scheduled_at ASC
     LIMIT 300`,
    params
  );

  const items = rows.map((r) => {
    let displayStatus = 'confirmed';
    if (r.status === 'cancelled') displayStatus = 'cancelled';
    else if (r.queue_status === 'done') displayStatus = 'completed';
    else if (r.queue_status === 'cancelled') displayStatus = 'no_show';

    return {
      client_name: r.client_name,
      when: String(r.scheduled_at),
      status: displayStatus,
      service_name: r.service_name,
      barber_name: r.barber_name
    };
  }).filter((it) => !statusFilter || it.status === statusFilter);

  res.json({ ok: true, start, end, status_filter: statusFilter, items });
}));

/**
 * Vérifie les congés/disponibilité pour UNE DATE PRECISE donnée (pas
 * seulement aujourd'hui) - comble la limite de "Statut des coiffeurs"
 * (qui ne regarde que maintenant) et "Horaires des coiffeurs" (qui ne
 * donne que le planning type sans tenir compte des congés).
 */
router.get('/salons/:id/leave-check', requireAutomationKey, wrap(async (req, res) => {
  const salonId = req.params.id;
  const [[salon]] = await pool.query('SELECT id FROM salons WHERE id = ? AND active = 1', [salonId]);
  if (!salon) return res.status(404).json({ error: 'Salon introuvable ou inactif' });

  const dateStr = req.query.date;
  if (!dateStr) return res.status(400).json({ error: 'Paramètre date requis (YYYY-MM-DD)' });

  const weekday = new Date(dateStr + 'T00:00:00Z').getUTCDay();

  const [barbers] = await pool.query(
    'SELECT id, name FROM barbers WHERE salon_id = ? AND active = 1 ORDER BY sort_order, name',
    [salonId]
  );
  const [schedules] = await pool.query(
    `SELECT bs.barber_id, bs.start_time, bs.end_time FROM barber_schedules bs
     JOIN barbers b ON b.id = bs.barber_id
     WHERE b.salon_id = ? AND bs.weekday = ? AND bs.active = 1`,
    [salonId, weekday]
  );
  const [leaves] = await pool.query(
    `SELECT bl.barber_id FROM barber_leaves bl
     JOIN barbers b ON b.id = bl.barber_id
     WHERE b.salon_id = ? AND ? BETWEEN bl.start_date AND bl.end_date`,
    [salonId, dateStr]
  );
  const onLeaveIds = new Set(leaves.map((l) => l.barber_id));

  const items = barbers.map((b) => {
    const onLeave = onLeaveIds.has(b.id);
    const schedule = schedules.find((s) => s.barber_id === b.id);
    return {
      name: b.name,
      normally_works_that_day: Boolean(schedule),
      hours: schedule ? schedule.start_time.slice(0, 5) + '-' + schedule.end_time.slice(0, 5) : null,
      on_leave_that_day: onLeave,
      actually_working: Boolean(schedule) && !onLeave
    };
  });

  res.json({ ok: true, date: dateStr, items });
}));

/**
 * Cartes cadeaux en attente d'utilisation et points de fidélité d'un
 * client précis - recherché par nom, email ou téléphone (peu importe
 * lequel, on essaie les 3).
 */
router.get('/salons/:id/client-gifts-loyalty', requireAutomationKey, wrap(async (req, res) => {
  const salonId = req.params.id;
  const [[salon]] = await pool.query('SELECT id FROM salons WHERE id = ? AND active = 1', [salonId]);
  if (!salon) return res.status(404).json({ error: 'Salon introuvable ou inactif' });

  const client = (req.query.client || '').trim();
  if (!client) return res.status(400).json({ error: 'Paramètre client requis (nom, email ou téléphone)' });

  const [gifts] = await pool.query(
    `SELECT recipient_name, amount_cents, created_at FROM gift_cards
     WHERE salon_id = ? AND used_at IS NULL
       AND (recipient_email = ? OR recipient_phone = ? OR recipient_name LIKE ?)
     ORDER BY created_at DESC`,
    [salonId, client, client, '%' + client + '%']
  );

  const clientKeyLower = client.toLowerCase();
  const [[loyalty]] = await pool.query(
    `SELECT client_name, points, rewards_available, activated_at FROM loyalty_accounts
     WHERE salon_id = ? AND (client_key = ? OR client_name LIKE ?)
     LIMIT 1`,
    [salonId, clientKeyLower, '%' + client + '%']
  );

  res.json({
    ok: true,
    pending_gift_cards: gifts.map((g) => ({
      recipient_name: g.recipient_name,
      amount_euros: g.amount_cents / 100,
      created_at: String(g.created_at).slice(0, 10)
    })),
    loyalty: loyalty ? {
      client_name: loyalty.client_name,
      points: loyalty.points,
      rewards_available: loyalty.rewards_available,
      card_activated: Boolean(loyalty.activated_at)
    } : null
  });
}));

module.exports = router;
