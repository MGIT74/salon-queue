const express = require('express');
const { pool, getSettings } = require('../db');
const requireAutomationKey = require('../middleware/automationAuth');
const { computeSlotsForBarber, nowInParis, nowParisDatetimeString, parisLocalToUtcDate } = require('./appointments');
const sms = require('../lib/sms');
const { sendCustomClientEmail } = require('../lib/mailer');
const { wrap } = require('../lib/wrap');
const { serviceLineTransfers, applyTransfers } = require('../lib/lineAttribution');

const router = express.Router();

/**
 * Resume des encaissements REELS de la caisse (table sales) sur une
 * periode : nombre de tickets, total, repartition par moyen de paiement
 * (un paiement partage est ventile en especes + carte) et par type de
 * ligne (prestation, supplement, produit, carte cadeau...). C'est ce que
 * le coiffeur voit passer en caisse - different de la file d'attente.
 */
async function registerSummary(salonId, fromSql, toSql) {
  const [sales] = await pool.query(
    `SELECT id, payment_method, total_price_cents, cash_cents
     FROM sales WHERE salon_id = ? AND created_at BETWEEN ? AND ?`,
    [salonId, fromSql, toSql]
  );
  const byMethod = {};
  let total = 0;
  sales.forEach((s) => {
    total += Number(s.total_price_cents);
    if (s.payment_method === 'partage' && s.cash_cents != null) {
      const cash = Number(s.cash_cents);
      byMethod.especes = (byMethod.especes || 0) + cash;
      byMethod.cb = (byMethod.cb || 0) + (Number(s.total_price_cents) - cash);
    } else {
      byMethod[s.payment_method] = (byMethod[s.payment_method] || 0) + Number(s.total_price_cents);
    }
  });
  const [byType] = await pool.query(
    `SELECT si.item_type, COALESCE(SUM(si.quantity), 0) AS qty, COALESCE(SUM(si.unit_price_cents * si.quantity), 0) AS cents
     FROM sale_items si JOIN sales s ON s.id = si.sale_id
     WHERE s.salon_id = ? AND s.created_at BETWEEN ? AND ? GROUP BY si.item_type`,
    [salonId, fromSql, toSql]
  );
  const euros = (c) => Math.round(Number(c)) / 100;
  return {
    tickets_count: sales.length,
    total_euros: euros(total),
    by_payment_method_euros: Object.fromEntries(Object.entries(byMethod).map(([k, v]) => [k, euros(v)])),
    by_item_type: byType.map((r) => ({ type: r.item_type, quantity: Number(r.qty), total_euros: euros(r.cents) }))
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

  const todayStr = nowInParis(settings.timezone).dateStr;
  let freeSlots = 0;
  for (const b of barbers) {
    const slots = await computeSlotsForBarber(b.id, todayStr, durationMin, settings, { skipLead: true });
    freeSlots += slots.length;
  }

  const register_today = await registerSummary(salonId, todayStr + ' 00:00:00', todayStr + ' 23:59:59');

  res.json({
    ok: true,
    salon_name: salon.name,
    date: todayStr,
    // Encaissements reels passes en caisse aujourd'hui (tickets, total, especes/carte, produits...).
    register_today,
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
    'SELECT id, name, active, accepts_appointments, timer_enabled FROM barbers WHERE salon_id = ? ORDER BY sort_order, name',
    [salonId]
  );

  const settings = await getSettings(salonId);
  const nowParis = nowInParis(settings.timezone);
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
      // Coiffeur sans chrono/file d'attente en temps reel (ex. loueur
      // de fauteuil independant) : pas de suivi de retard, la
      // reservation en ligne se base uniquement sur horaires + duree
      // des prestations pour lui.
      timer_enabled: Boolean(b.timer_enabled),
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

  const settings = await getSettings(salonId);
  const todayParis = nowInParis(settings.timezone).dateStr;
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
 * Transactions reellement passees en CAISSE sur une periode (ticket par
 * ticket) : numero, heure, coiffeur, moyen de paiement (avec la part
 * especes d'un paiement partage) et chaque ligne vendue (prestation,
 * supplement, produit, carte cadeau) avec le coiffeur qui l'a realisee.
 * Plus un resume (total, par moyen de paiement, par type de ligne).
 * Aujourd'hui par defaut. Lecture seule, vraies donnees uniquement.
 */
router.get('/salons/:id/sales', requireAutomationKey, wrap(async (req, res) => {
  const salonId = req.params.id;
  const [[salon]] = await pool.query('SELECT id FROM salons WHERE id = ? AND active = 1', [salonId]);
  if (!salon) return res.status(404).json({ error: 'Salon introuvable ou inactif' });

  const settings = await getSettings(salonId);
  const today = nowInParis(settings.timezone).dateStr;
  const start = /^\d{4}-\d{2}-\d{2}$/.test(req.query.start || '') ? req.query.start : today;
  const end = /^\d{4}-\d{2}-\d{2}$/.test(req.query.end || '') ? req.query.end : today;
  const fromSql = start + ' 00:00:00';
  const toSql = end + ' 23:59:59';

  const [rows] = await pool.query(
    `SELECT s.id, s.ticket_number, s.created_at, s.payment_method, s.total_price_cents, s.cash_cents, b.name AS barber_name
     FROM sales s LEFT JOIN barbers b ON b.id = s.barber_id
     WHERE s.salon_id = ? AND s.created_at BETWEEN ? AND ?
     ORDER BY s.created_at DESC LIMIT 200`,
    [salonId, fromSql, toSql]
  );

  const linesBySale = new Map();
  if (rows.length) {
    const [lines] = await pool.query(
      `SELECT si.sale_id, si.item_type, si.item_name, si.unit_price_cents, si.quantity, b.name AS barber_name
       FROM sale_items si LEFT JOIN barbers b ON b.id = si.barber_id
       WHERE si.sale_id IN (?)`,
      [rows.map((r) => r.id)]
    );
    lines.forEach((l) => {
      if (!linesBySale.has(l.sale_id)) linesBySale.set(l.sale_id, []);
      linesBySale.get(l.sale_id).push({
        type: l.item_type,
        name: l.item_name,
        quantity: Number(l.quantity),
        unit_price_euros: l.unit_price_cents / 100,
        done_by: l.barber_name || null
      });
    });
  }

  const summary = await registerSummary(salonId, fromSql, toSql);
  res.json({
    ok: true,
    start,
    end,
    summary,
    shown: rows.length,
    sales: rows.map((r) => ({
      ticket_number: r.ticket_number,
      when: String(r.created_at),
      barber_name: r.barber_name || null,
      payment_method: r.payment_method,
      cash_part_euros: r.payment_method === 'partage' && r.cash_cents != null ? r.cash_cents / 100 : null,
      total_euros: r.total_price_cents / 100,
      lines: linesBySale.get(r.id) || []
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

  const settings = await getSettings(salonId);
  const start = req.query.start || nowInParis(settings.timezone).dateStr;
  const end = req.query.end || nowInParis(settings.timezone).dateStr;

  const [[totalRow]] = await pool.query(
    `SELECT COUNT(*) AS done_count, COALESCE(SUM(total_price_cents), 0) AS revenue_cents
     FROM queue WHERE salon_id = ? AND status = 'done' AND end_at BETWEEN ? AND ?`,
    [salonId, start + ' 00:00:00', end + ' 23:59:59']
  );

  const [byBarberServices] = await pool.query(
    `SELECT q.barber_id, b.name AS barber_name, COUNT(*) AS done_count, COALESCE(SUM(q.total_price_cents), 0) AS revenue_cents
     FROM queue q LEFT JOIN barbers b ON b.id = q.barber_id
     WHERE q.salon_id = ? AND q.status = 'done' AND q.end_at BETWEEN ? AND ?
     GROUP BY q.barber_id, b.name`,
    [salonId, start + ' 00:00:00', end + ' 23:59:59']
  );

  // Produits vendus (vendeur de la ligne, ou à défaut le coiffeur de
  // toute la vente) - séparé des prestations ci-dessus, puis fusionné
  // par coiffeur juste en dessous, pour ne rien compter deux fois.
  const [byBarberProducts] = await pool.query(
    `SELECT COALESCE(si.barber_id, s.barber_id) AS barber_id, b.name AS barber_name,
            COUNT(*) AS product_count, COALESCE(SUM(si.unit_price_cents * si.quantity), 0) AS product_revenue_cents
     FROM sale_items si JOIN sales s ON s.id = si.sale_id
     LEFT JOIN barbers b ON b.id = COALESCE(si.barber_id, s.barber_id)
     WHERE s.salon_id = ? AND si.item_type = 'product' AND s.created_at BETWEEN ? AND ?
     GROUP BY COALESCE(si.barber_id, s.barber_id), b.name`,
    [salonId, start + ' 00:00:00', end + ' 23:59:59']
  );

  // Prestations / suppléments attribués ligne par ligne à un autre coiffeur que celui du passage (voir lineAttribution.js).
  const svcMap = new Map();
  byBarberServices.forEach((r) => {
    svcMap.set(r.barber_id, { name: r.barber_name, count: Number(r.done_count), cents: Number(r.revenue_cents) });
  });
  applyTransfers(svcMap, await serviceLineTransfers(pool, salonId, { fromSql: start + ' 00:00:00', toInclusiveSql: end + ' 23:59:59' }));

  const byBarberMap = new Map();
  svcMap.forEach((v, barberId) => {
    byBarberMap.set(barberId, {
      barber_name: v.name || 'Non assigné',
      services_count: v.count,
      service_revenue_cents: v.cents,
      product_count: 0,
      product_revenue_cents: 0
    });
  });
  byBarberProducts.forEach((r) => {
    const entry = byBarberMap.get(r.barber_id) || {
      barber_name: r.barber_name || 'Non assigné',
      services_count: 0, service_revenue_cents: 0,
      product_count: 0, product_revenue_cents: 0
    };
    entry.product_count = Number(r.product_count);
    entry.product_revenue_cents = Number(r.product_revenue_cents);
    byBarberMap.set(r.barber_id, entry);
  });

  const byBarber = [...byBarberMap.values()].sort((a, b) =>
    (b.service_revenue_cents + b.product_revenue_cents) - (a.service_revenue_cents + a.product_revenue_cents)
  );

  const totalProductRevenueCents = byBarberProducts.reduce((sum, r) => sum + Number(r.product_revenue_cents), 0);

  res.json({
    ok: true,
    start,
    end,
    total_revenue_euros: (Number(totalRow.revenue_cents) + totalProductRevenueCents) / 100,
    total_services: Number(totalRow.done_count),
    by_barber: byBarber.map((r) => ({
      barber_name: r.barber_name,
      services_count: r.services_count,
      service_revenue_euros: r.service_revenue_cents / 100,
      product_count: r.product_count,
      product_revenue_euros: r.product_revenue_cents / 100,
      revenue_euros: (r.service_revenue_cents + r.product_revenue_cents) / 100
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

  const settings = await getSettings(salonId);
  const start = req.query.start || nowInParis(settings.timezone).dateStr;
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
     WHERE salon_id = ? AND used_at IS NULL AND voided_at IS NULL
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

/* ============================================================
 * RAPPEL SMS 24h avant le RDV (envoi fait par n8n via Brevo)
 *
 * 1) GET  /sms-reminders/due   : n8n (tous les jours a 10h) demande les SMS a envoyer.
 *    L'app decide tout (salons actifs, RDV de demain,
 *    credits, message, expediteur) ; n8n n'a plus qu'a envoyer.
 * 2) POST /sms-reminders/result : n8n annonce envoye / echec ; seul un
 *    envoi reussi consomme des credits (nombre de segments Brevo).
 * ============================================================ */

const SMS_PENDING_TTL_MIN = 30;   // un "pending" plus vieux est considere perdu (n8n a plante) et peut etre redonne
const SMS_MAX_ATTEMPTS = 3;
// Envoi quotidien (n8n, tous les jours a 10h) : on rappelle les RDV de DEMAIN (date du salon).

function addHoursLocal(localStr, hours) {
  const m = String(localStr).match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})/);
  const t = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) + hours * 3600000;
  return new Date(t).toISOString().slice(0, 19).replace('T', ' ');
}

async function getSmsCredits(salonId) {
  await pool.query('INSERT IGNORE INTO sms_credits (salon_id) VALUES (?)', [salonId]);
  const [[row]] = await pool.query('SELECT sms_enabled, credits_granted, credits_used FROM sms_credits WHERE salon_id = ?', [salonId]);
  return row;
}

router.get('/sms-reminders/due', requireAutomationKey, wrap(async (req, res) => {
  const [salons] = await pool.query('SELECT id, name FROM salons WHERE active = 1 ORDER BY created_at');
  const items = [];
  const skipped = { disabled_salons: 0, no_credit: 0, invalid_phone: 0 };

  for (const salon of salons) {
    const settings = await getSettings(salon.id);
    if (settings.sms_reminder_enabled !== '1') { skipped.disabled_salons++; continue; }
    const credits = await getSmsCredits(salon.id);
    if (!credits.sms_enabled) { skipped.disabled_salons++; continue; }

    const nowLocal = nowParisDatetimeString(settings.timezone);
    const tomorrow = addHoursLocal(nowLocal, 24).slice(0, 10);
    const from = tomorrow + ' 00:00:00';
    const to = tomorrow + ' 23:59:59';

    const [appts] = await pool.query(
      `SELECT a.id, a.client_name, a.phone, a.scheduled_at, a.created_at, b.name AS barber_name,
              l.status AS log_status, l.attempts AS log_attempts,
              (l.updated_at > DATE_SUB(NOW(), INTERVAL ? MINUTE)) AS log_recent
       FROM appointments a
       LEFT JOIN barbers b ON b.id = a.barber_id
       LEFT JOIN sms_log l ON l.appointment_id = a.id AND l.kind = 'reminder'
       WHERE a.salon_id = ? AND a.status = 'confirmed' AND a.source <> 'walkin'
         AND a.phone IS NOT NULL AND a.phone <> ''
         AND a.scheduled_at >= ? AND a.scheduled_at <= ?
       ORDER BY a.scheduled_at`,
      [SMS_PENDING_TTL_MIN, salon.id, from, to]
    );

    // Credits disponibles = accordes - consommes - SMS deja remis a n8n et pas encore confirmes.
    const [[pend]] = await pool.query(
      `SELECT COALESCE(SUM(segments), 0) AS n FROM sms_log
       WHERE salon_id = ? AND status = 'pending' AND updated_at > DATE_SUB(NOW(), INTERVAL ? MINUTE)`,
      [salon.id, SMS_PENDING_TTL_MIN]
    );
    let remaining = Number(credits.credits_granted) - Number(credits.credits_used) - Number(pend.n);

    const senderName = sms.sanitizeSender(settings.sms_sender, settings.salon_name || salon.name);
    const stripAcc = settings.sms_strip_accents !== '0';

    for (const a of appts) {
      if (a.log_status === 'sent') continue;
      if (a.log_status === 'pending' && Number(a.log_recent)) continue;
      if (a.log_status === 'failed' && Number(a.log_attempts) >= SMS_MAX_ATTEMPTS) continue;

      const phone = sms.normalizePhone(a.phone);
      if (!phone) { skipped.invalid_phone++; continue; }

      const when = sms.formatAppointmentWhen(a.scheduled_at);
      const message = sms.buildMessage(settings.sms_reminder_template, {
        client_name: a.client_name, date: when.date, heure: when.heure, salon: settings.salon_name || salon.name,
        coiffeur: a.barber_name || ''
      }, { stripAccents: stripAcc });
      const segments = sms.countSegments(message);

      if (segments > remaining) {
        // Plus de credits : NON envoye, mais trace (etiquette "non envoye" cote salon et super admin).
        await pool.query(
          `INSERT INTO sms_log (id, salon_id, appointment_id, kind, client_name, phone, sender, message, segments, status, scheduled_at)
           VALUES (UUID(), ?, ?, 'reminder', ?, ?, ?, ?, ?, 'no_credit', ?)
           ON DUPLICATE KEY UPDATE status = 'no_credit', message = VALUES(message), segments = VALUES(segments), phone = VALUES(phone), sender = VALUES(sender)`,
          [salon.id, a.id, a.client_name, phone, senderName, message, segments, a.scheduled_at]
        );
        skipped.no_credit++;
        continue;
      }

      remaining -= segments;
      await pool.query(
        `INSERT INTO sms_log (id, salon_id, appointment_id, kind, client_name, phone, sender, message, segments, status, attempts, scheduled_at)
         VALUES (UUID(), ?, ?, 'reminder', ?, ?, ?, ?, ?, 'pending', 1, ?)
         ON DUPLICATE KEY UPDATE status = 'pending', attempts = attempts + 1, message = VALUES(message), segments = VALUES(segments),
                                 phone = VALUES(phone), sender = VALUES(sender), error = NULL`,
        [salon.id, a.id, a.client_name, phone, senderName, message, segments, a.scheduled_at]
      );
      items.push({
        appointment_id: a.id, salon_id: salon.id, salon_name: salon.name, client_name: a.client_name,
        phone, sender: senderName, message, segments, unicode: !sms.isGsm(message), scheduled_at: String(a.scheduled_at)
      });
    }
  }

  res.json({ ok: true, count: items.length, skipped, items });
}));

router.post('/sms-reminders/result', requireAutomationKey, wrap(async (req, res) => {
  const appointmentId = String(req.body.appointment_id || '');
  const status = req.body.status === 'sent' ? 'sent' : 'failed';
  const [[log]] = await pool.query(
    "SELECT id, salon_id, segments, status FROM sms_log WHERE appointment_id = ? AND kind = 'reminder'", [appointmentId]
  );
  if (!log) return res.status(404).json({ error: 'Aucun SMS en attente pour ce rendez-vous' });
  if (log.status === 'sent') return res.json({ ok: true, already: true }); // idempotent : jamais deux debits

  if (status === 'sent') {
    // Le vrai nombre de segments facture par Brevo (smsCount) fait foi s'il est fourni.
    const used = Math.max(1, Math.min(10, Number(req.body.segments) || Number(log.segments) || 1));
    const [r] = await pool.query(
      "UPDATE sms_log SET status = 'sent', segments = ?, provider_message_id = ?, sent_at = NOW(), error = NULL WHERE id = ? AND status <> 'sent'",
      [used, String(req.body.provider_message_id || '').slice(0, 100) || null, log.id]
    );
    if (r.affectedRows) {
      await pool.query('INSERT IGNORE INTO sms_credits (salon_id) VALUES (?)', [log.salon_id]);
      await pool.query('UPDATE sms_credits SET credits_used = credits_used + ? WHERE salon_id = ?', [used, log.salon_id]);
    }
    return res.json({ ok: true, credits_debited: used });
  }

  await pool.query("UPDATE sms_log SET status = 'failed', error = ? WHERE id = ? AND status <> 'sent'",
    [String(req.body.error || 'Erreur inconnue').slice(0, 500), log.id]);
  res.json({ ok: true });
}));


module.exports = router;
