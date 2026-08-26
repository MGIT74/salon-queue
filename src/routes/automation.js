const express = require('express');
const { pool, getSettings } = require('../db');
const requireAutomationKey = require('../middleware/automationAuth');
const { computeSlotsForBarber } = require('./appointments');
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

  const todayStr = new Date().toISOString().slice(0, 10);
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
  const { emails, subject, message } = req.body;
  if (!Array.isArray(emails) || emails.length === 0) return res.status(400).json({ error: 'Liste emails requise' });
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

module.exports = router;
