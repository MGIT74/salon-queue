const express = require('express');
const { pool, getSettings, setSettings, getCaisseLockedUntil } = require('../db');
const { sendTest, invalidateTransport, sendAppointmentConfirmation, sendAppointmentReminder, sendAppointmentCancelledByAdmin, sendAppointmentRescheduled, sendTurnSoon, sendSalonClosureNotice } = require('../lib/mailer');
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

const EDITABLE = [
  'salon_name', 'notify_before_min', 'logo_url', 'gift_tile_image_url',
  'smtp_host', 'smtp_port', 'smtp_user', 'smtp_pass', 'smtp_from',
  'printer_connection_type', 'printer_ip', 'printer_model',
  'tpe_ip', 'tpe_port', 'tpe_cash_register_id', 'tpe_cash_register_number',
  'tpe_reply_mode', 'tpe_callback_port',
  'email_tpl_confirmation_subject', 'email_tpl_confirmation_body',
  'email_tpl_reminder_subject', 'email_tpl_reminder_body',
  'email_tpl_cancelled_subject', 'email_tpl_cancelled_body',
  'email_tpl_rescheduled_subject', 'email_tpl_rescheduled_body',
  'email_tpl_turn_soon_subject', 'email_tpl_turn_soon_body',
  'email_tpl_closure_subject', 'email_tpl_closure_body',
  'accent_color',
  'caisse_inactivity_seconds', 'caisse_reopen_hour', 'currency',
  'rdv_slot_step_min', 'rdv_min_lead_min', 'rdv_max_advance_days',
  'rdv_buffer_min', 'rdv_cancel_deadline_min', 'rdv_prep_alert_min'
];

// Force la réouverture immédiate de la caisse (annule le verrouillage
// jusqu'au lendemain habituel), sans attendre l'heure de réouverture
// configurée. Se réactive normalement à la prochaine clôture.
router.post('/caisse/force-open', requireAdmin, wrap(async (req, res) => {
  await setSettings(req.salon.id, { caisse_force_reopen_at: new Date().toISOString() });
  res.json({ ok: true });
}));

router.get('/', requireAdmin, wrap(async (req, res) => {
  const s = await getSettings(req.salon.id);
  // Le mot de passe SMTP n'est jamais renvoyé en clair : on indique
  // seulement s'il est renseigné.
  res.json({
    ok: true,
    settings: Object.assign({}, s, { smtp_pass: undefined }),
    smtp_pass_set: Boolean(s.smtp_pass)
  });
}));

router.put('/', requireAdmin, wrap(async (req, res) => {
  const patch = {};
  EDITABLE.forEach((k) => {
    if (req.body[k] !== undefined && req.body[k] !== null) patch[k] = req.body[k];
  });
  // Champ mot de passe laissé vide = on conserve l'ancien
  if (patch.smtp_pass === '') delete patch.smtp_pass;

  // Un expéditeur sans adresse email valide n'est pas un en-tête From
  // exploitable — les fournisseurs comme Gmail rejettent silencieusement
  // ces messages. On corrige automatiquement en y accolant l'email
  // authentifié.
  if (patch.smtp_from && !patch.smtp_from.includes('@')) {
    const existing = await getSettings(req.salon.id);
    const email = patch.smtp_user || existing.smtp_user;
    if (email) patch.smtp_from = `${patch.smtp_from} <${email}>`;
  }

  await setSettings(req.salon.id, patch);
  invalidateTransport(req.salon.id);

  // Le nom du salon (Réglages) et salons.name (utilisé dans "Mes salons"
  // et la liste des enseignes du super admin) ne se synchronisaient
  // qu'à la création, puis divergeaient silencieusement. On les garde
  // désormais alignés, sans toucher au nom de l'ENSEIGNE (owners.name),
  // volontairement distinct — une même enseigne peut avoir plusieurs
  // salons portant des noms différents.
  if (patch.salon_name) {
    await pool.query('UPDATE salons SET name = ? WHERE id = ?', [patch.salon_name, req.salon.id]);
  }

  res.json({ ok: true, smtp_from: patch.smtp_from });
}));

router.post('/smtp/test', requireAdmin, wrap(async (req, res) => {
  const to = req.body.to;
  if (!to) return res.status(400).json({ error: 'Adresse de destination requise' });
  try {
    await sendTest(req.salon.id, to);
    res.json({ ok: true, sent: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}));

/**
 * Envoi de test pour un ou plusieurs des 5 modèles d'emails
 * automatiques, avec des données d'exemple - permet de vérifier le
 * rendu (personnalisé ou par défaut) sans avoir à créer un vrai RDV.
 * Chaque type est essayé indépendamment, un échec sur l'un n'empêche
 * pas les autres.
 */
router.post('/email-templates/test', requireAdmin, wrap(async (req, res) => {
  const to = req.body.to;
  const types = Array.isArray(req.body.types) ? req.body.types : [];
  if (!to) return res.status(400).json({ error: 'Adresse de destination requise' });
  if (!types.length) return res.status(400).json({ error: 'Sélectionnez au moins un modèle à tester' });

  const sampleInfo = {
    clientName: 'Jean Dupont',
    when: 'vendredi 28 août à 15h30',
    serviceName: 'Coupe + Barbe',
    barberName: 'Alex',
    cancelUrl: 'https://' + req.get('host') + '/rdv.html?salon=' + (req.salon.slug || '') + '&cancel=exemple',
    reason: 'travaux',
    startDate: '2026-08-28',
    endDate: '2026-08-28'
  };

  const senders = {
    confirmation: () => sendAppointmentConfirmation(req.salon.id, to, sampleInfo),
    reminder: () => sendAppointmentReminder(req.salon.id, to, sampleInfo),
    cancelled: () => sendAppointmentCancelledByAdmin(req.salon.id, to, sampleInfo),
    rescheduled: () => sendAppointmentRescheduled(req.salon.id, to, sampleInfo),
    'turn-soon': () => sendTurnSoon(req.salon.id, to, sampleInfo.clientName, 12),
    closure: () => sendSalonClosureNotice(req.salon.id, to, sampleInfo)
  };

  const results = {};
  for (const type of types) {
    if (!senders[type]) { results[type] = { ok: false, error: 'Type inconnu' }; continue; }
    try {
      await senders[type]();
      results[type] = { ok: true };
    } catch (err) {
      results[type] = { ok: false, error: err.message };
    }
  }

  res.json({ ok: true, results });
}));

// Réglages publics utiles à la borne (nom du salon uniquement)
router.get('/public', wrap(async (req, res) => {
  const s = await getSettings(req.salon.id);
  const caisseLockedUntil = await getCaisseLockedUntil(req.salon.id, s);

  res.json({
    ok: true,
    salon_name: s.salon_name || 'Le Salon',
    logo_url: s.logo_url || null,
    gift_tile_image_url: s.gift_tile_image_url || null,
    caisse_inactivity_seconds: s.caisse_inactivity_seconds ? Number(s.caisse_inactivity_seconds) : 15,
    caisse_reopen_hour: s.caisse_reopen_hour || '00:00',
    currency: s.currency || 'EUR',
    rdv_slot_step_min: s.rdv_slot_step_min ? Number(s.rdv_slot_step_min) : 15,
    rdv_min_lead_min: s.rdv_min_lead_min ? Number(s.rdv_min_lead_min) : 0,
    rdv_max_advance_days: s.rdv_max_advance_days ? Number(s.rdv_max_advance_days) : 0,
    rdv_buffer_min: s.rdv_buffer_min ? Number(s.rdv_buffer_min) : 0,
    rdv_cancel_deadline_min: s.rdv_cancel_deadline_min ? Number(s.rdv_cancel_deadline_min) : 0,
    rdv_prep_alert_min: s.rdv_prep_alert_min ? Number(s.rdv_prep_alert_min) : 0,
    accent_color: s.accent_color || null,
    caisse_locked_until: caisseLockedUntil
  });
}));

module.exports = router;
