const express = require('express');
const { pool, getSettings, setSettings, getCaisseLockedUntil, getPlatformSettings } = require('../db');
const { sendTest, invalidateTransport, sendAppointmentConfirmation, sendAppointmentReminder, sendAppointmentCancelledByAdmin, sendAppointmentRescheduled, sendTurnSoon, sendSalonClosureNotice } = require('../lib/mailer');
const requireAdmin = require('../middleware/auth');
const { logActivity } = require('../lib/activityLog');
const { wrap } = require('../lib/wrap');

const router = express.Router();

const EDITABLE = [
  'salon_name', 'notify_before_min', 'logo_url', 'gift_tile_image_url', 'loyalty_card_image_url', 'gift_card_image_url', 'timezone',
  'smtp_host', 'smtp_port', 'smtp_user', 'smtp_pass', 'smtp_from',
  'printer_connection_type', 'printer_ip', 'printer_model',
  'tpe_ip', 'tpe_port', 'tpe_cash_register_id', 'tpe_cash_register_number',
  'tpe_reply_mode', 'tpe_callback_port', 'tpe_protocol', 'tpe_bridge_url',
  'email_tpl_confirmation_subject', 'email_tpl_confirmation_body',
  'email_tpl_reminder_subject', 'email_tpl_reminder_body',
  'email_tpl_cancelled_subject', 'email_tpl_cancelled_body',
  'email_tpl_rescheduled_subject', 'email_tpl_rescheduled_body',
  'email_tpl_turn_soon_subject', 'email_tpl_turn_soon_body',
  'email_tpl_closure_subject', 'email_tpl_closure_body',
  'accent_color', 'login_image_url',
  'caisse_inactivity_seconds', 'caisse_reopen_hour', 'currency',
  'rdv_slot_step_min', 'rdv_min_lead_min', 'rdv_max_advance_days',
  'rdv_buffer_min', 'rdv_cancel_deadline_min', 'rdv_prep_alert_min',
  // Informations légales (ticket de caisse) - voir CGI / loi anti-fraude TVA.
  'legal_address', 'legal_phone', 'legal_email', 'legal_website',
  'legal_siret', 'legal_vat_number', 'legal_form', 'legal_share_capital',
  'legal_rcs_city', 'legal_naf_code', 'legal_register_number',
  // TVA par catégorie - un taux pour les prestations, un pour les
  // suppléments, un pour les produits (jamais par article individuel).
  'vat_rate_service', 'vat_rate_extra', 'vat_rate_product'
];

// Force la réouverture immédiate de la caisse (annule le verrouillage
// jusqu'au lendemain habituel), sans attendre l'heure de réouverture
// configurée. Se réactive normalement à la prochaine clôture.
router.post('/caisse/force-open', requireAdmin, wrap(async (req, res) => {
  await setSettings(req.salon.id, { caisse_force_reopen_at: new Date().toISOString() });
  logActivity(req.salon.id, 'caisse_force_open', 'Caisse déverrouillée manuellement (mot de passe admin)');
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

  // Un fuseau invalide planterait silencieusement tous les calculs
  // d'heure de salon (créneaux, clôtures, "en poste") - on vérifie que
  // c'est un identifiant IANA reconnu avant de l'accepter.
  // Même précaution que pour les photos du catalogue (catalog.js) :
  // cette valeur est ensuite injectée dans un style="background:url(...)"
  // côté page de connexion - format strictement restreint.
  const SAFE_IMAGE_URL = /^(data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]+|https:\/\/[^\s"'<>]+)$/i;
  if (patch.login_image_url && !SAFE_IMAGE_URL.test(patch.login_image_url)) {
    return res.status(400).json({ error: "Format d'image invalide" });
  }

  if (patch.timezone) {
    try { new Intl.DateTimeFormat('en-US', { timeZone: patch.timezone }); }
    catch (e) { return res.status(400).json({ error: 'Fuseau horaire invalide' }); }
  }

  // Un expéditeur sans adresse email valide n'est pas un en-tête From
  // exploitable — les fournisseurs comme Gmail rejettent silencieusement
  // ces messages. On corrige automatiquement en y accolant l'email
  // authentifié.
  if (patch.smtp_from && !patch.smtp_from.includes('@')) {
    const existing = await getSettings(req.salon.id);
    const email = patch.smtp_user || existing.smtp_user;
    if (email) patch.smtp_from = `${patch.smtp_from} <${email}>`;
  }

  // Un SIRET mal formé ne serait détecté qu'au moment de l'impression
  // d'un ticket - vaut mieux prévenir tout de suite (14 chiffres).
  if (patch.legal_siret && !/^\d{14}$/.test(patch.legal_siret.replace(/\s/g, ''))) {
    return res.status(400).json({ error: 'Le SIRET doit comporter exactement 14 chiffres' });
  }

  // Les 3 taux de TVA doivent être des pourcentages plausibles - un
  // taux invalide fausserait silencieusement le calcul HT/TVA de
  // chaque ticket imprimé.
  for (const k of ['vat_rate_service', 'vat_rate_extra', 'vat_rate_product']) {
    if (patch[k] !== undefined && patch[k] !== '') {
      const n = Number(patch[k]);
      if (!Number.isFinite(n) || n < 0 || n > 100) {
        return res.status(400).json({ error: 'Le taux de TVA doit être un pourcentage entre 0 et 100' });
      }
    }
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
    // Message utilisateur utile ici (échec SMTP configuré par l'admin,
    // ex: "authentification refusée") - pas un détail interne.
    res.status(400).json({ error: 'Envoi du test impossible : ' + err.message });
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
  // Utilisée par l'écran de connexion "générique" (aucun salon précis
  // dans l'URL) - distincte de login_image_url ci-dessous, propre à
  // CE salon (utilisée elle sur la page de connexion CLIENT du salon).
  const platform = await getPlatformSettings();

  res.json({
    ok: true,
    platform_login_image_url: platform.login_image_url || null,
    salon_name: s.salon_name || 'Le Salon',
    logo_url: s.logo_url || null,
    gift_tile_image_url: s.gift_tile_image_url || null,
    loyalty_card_image_url: s.loyalty_card_image_url || null,
    gift_card_image_url: s.gift_card_image_url || null,
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
    login_image_url: s.login_image_url || null,
    timezone: s.timezone || 'Europe/Paris',
    legal: {
      address: s.legal_address || '',
      phone: s.legal_phone || '',
      email: s.legal_email || '',
      website: s.legal_website || '',
      siret: s.legal_siret || '',
      vat_number: s.legal_vat_number || '',
      legal_form: s.legal_form || '',
      share_capital: s.legal_share_capital || '',
      rcs_city: s.legal_rcs_city || '',
      naf_code: s.legal_naf_code || '',
      register_number: s.legal_register_number || ''
    },
    vat_rates: {
      service: s.vat_rate_service !== undefined && s.vat_rate_service !== '' ? Number(s.vat_rate_service) : 20,
      extra: s.vat_rate_extra !== undefined && s.vat_rate_extra !== '' ? Number(s.vat_rate_extra) : 20,
      product: s.vat_rate_product !== undefined && s.vat_rate_product !== '' ? Number(s.vat_rate_product) : 20
    },
    // TPE : la caisse a besoin de savoir si elle doit passer par le pont
    // local (tpe_bridge_url) au lieu de l'API serveur - l'IP du terminal
    // n'est joignable que depuis le réseau du salon, jamais depuis le
    // serveur cloud.
    tpe_bridge_url: s.tpe_bridge_url || null,
    caisse_locked_until: caisseLockedUntil
  });
}));

module.exports = router;
