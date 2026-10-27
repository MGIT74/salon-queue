const express = require('express');
const { serviceNameSql } = require('../lib/extrasOnly');
const { contactError, isValidEmail, isValidPhone } = require('../lib/contact');
const { thresholdsForSalon, rewardsFor } = require('../lib/loyaltyRules');
const { safeBaseUrl } = require('../lib/safeUrl');
const crypto = require('crypto');
const { pool, getSettings } = require('../db');
const { hashPassword, verifyPassword } = require('../lib/password');
const { sendClientVerificationEmail, sendClientPasswordReset, sendClientSecurityNotice } = require('../lib/mailer');
const { activateOnAccountCreation } = require('../lib/loyalty');
const { clientKey } = require('../lib/queueMath');
const { loginRateLimiter, signupRateLimiter } = require('../middleware/rateLimiter');
const { nowParisDatetimeString } = require('./appointments');
const { wrap } = require('../lib/wrap');

const { guardPasswordAttempt, failPasswordAttempt, clearPasswordAttempt } = require('../middleware/rateLimiter');
const router = express.Router();

// base_url contient déjà ?salon=xxx si l'espace client est ouvert pour
// un salon précis - ne jamais recoller un second '?' par-dessus (même
// bug déjà rencontré et corrigé sur le lien d'annulation de RDV).
function appendParam(baseUrl, key, value) {
  const url = String(baseUrl || '').replace(/\/$/, '');
  return url + (url.includes('?') ? '&' : '?') + key + '=' + value;
}

/**
 * Authentifie le client via l'en-tête X-Client-Token (jeton opaque,
 * cf. client_sessions). Ne fait AUCUN lien avec l'auth admin/coiffeur -
 * espace totalement séparé.
 */
async function requireClient(req, res, next) {
  const token = req.headers['x-client-token'];
  if (!token) return res.status(401).json({ error: 'Non connecté' });
  const [[row]] = await pool.query(
    `SELECT c.* FROM client_sessions cs JOIN clients c ON c.id = cs.client_id
     WHERE cs.token = ? AND cs.expires_at > NOW()`,
    [token]
  );
  if (!row) return res.status(401).json({ error: 'Session expirée, reconnectez-vous' });
  req.clientAccount = row;
  next();
}

router.post('/signup', signupRateLimiter('client-signup'), wrap(async (req, res) => {
  const { name, email, phone, password } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'Nom, email et mot de passe requis' });
  if (!phone) return res.status(400).json({ error: 'Le téléphone est requis' });
  if (password.length < 6) return res.status(400).json({ error: 'Le mot de passe doit contenir au moins 6 caractères' });
  const contactErr = contactError({ name, email, phone }, { emailRequired: true, phoneRequired: true });
  if (contactErr) return res.status(400).json({ error: contactErr });

  const salonId = req.salon.id;
  const [[existing]] = await pool.query(
    'SELECT id FROM clients WHERE salon_id = ? AND email = ?', [salonId, email]
  );
  if (existing) return res.status(409).json({ error: 'Un compte existe déjà avec cet email' });

  const passwordHash = await hashPassword(password);
  const verifyToken = crypto.randomBytes(32).toString('hex');
  const verifyExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const id = crypto.randomUUID();

  // owner_id est OBLIGATOIRE dans la table clients (NOT NULL, sans valeur par defaut). Le passage "par salon" (10/08)
  // l'avait retire de cette requete : sur une base STRICTE (neuve - c'est le cas de la production) l'inscription
  // repondait 500 "Erreur interne du serveur" (Field 'owner_id' doesn't have a default value). Le client appartient
  // au proprietaire de SON salon.
  await pool.query(
    `INSERT INTO clients (id, owner_id, salon_id, name, email, phone, password_hash, verify_token, verify_token_expires)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, req.salon.owner_id, salonId, name, email, phone, passwordHash, verifyToken, verifyExpires]
  );

  // Le compte est cree dans tous les cas ; mais le client doit confirmer son email pour pouvoir se connecter. Si
  // l'envoi echoue (SMTP non configure pour ce salon : Dashboard > Reglages), on le DIT : sinon l'ecran affirmait
  // "un email vient de vous etre envoye" alors qu'il n'arrivera jamais, et le client restait bloque sans comprendre.
  let emailSent = true;
  try {
    const verifyUrl = appendParam(safeBaseUrl(req, req.body.base_url), 'verify', verifyToken);
    await sendClientVerificationEmail(req.salon.id, email, verifyUrl);
  } catch (err) {
    emailSent = false;
    console.error('[client signup] envoi email échoué:', err.message);
  }

  // Carte de fidélité créée et activée d'office avec le compte (plus besoin de la
  // faire activer à la caisse). Une erreur ici ne doit jamais faire échouer l'inscription.
  try {
    await activateOnAccountCreation(salonId, { client_name: name, email, phone });
  } catch (err) {
    console.error('[fidélité] activation à la création du compte échouée:', err.message);
  }

  res.json({ ok: true, needs_email_verification: true, email_sent: emailSent });
}));

router.post('/verify-email', wrap(async (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: 'Lien invalide' });
  const [[client]] = await pool.query(
    'SELECT id, pending_email FROM clients WHERE verify_token = ? AND verify_token_expires > NOW() AND salon_id = ?', [token, req.salon.id]
  );
  if (!client) return res.status(400).json({ error: 'Ce lien est invalide ou a expiré.' });
  await pool.query(
    'UPDATE clients SET email = COALESCE(pending_email, email), pending_email = NULL, email_verified = 1, verify_token = NULL, verify_token_expires = NULL WHERE id = ?',
    [client.id]
  );
  res.json({ ok: true });
}));

router.post('/resend-verification', signupRateLimiter('client-resend'), wrap(async (req, res) => {
  const email = String(req.body.email || '').trim();
  const genericMsg = "Si un compte existe avec cet email et n'est pas encore confirmé, un nouveau lien vient d'être envoyé.";
  if (!email) return res.json({ ok: true, message: genericMsg });
  try {
    const [[client]] = await pool.query(
      'SELECT id FROM clients WHERE salon_id = ? AND email = ? AND email_verified = 0', [req.salon.id, email]
    );
    if (client) {
      const verifyToken = crypto.randomBytes(32).toString('hex');
      const verifyExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);
      await pool.query('UPDATE clients SET verify_token = ?, verify_token_expires = ? WHERE id = ?', [verifyToken, verifyExpires, client.id]);
      const verifyUrl = appendParam(safeBaseUrl(req, req.body.base_url), 'verify', verifyToken);
      await sendClientVerificationEmail(req.salon.id, email, verifyUrl);
    }
  } catch (err) {
    console.error('[client resend-verification]', err.message);
  }
  res.json({ ok: true, message: genericMsg });
}));

router.post('/login', loginRateLimiter('client-login'), wrap(async (req, res) => {
  const email = String(req.body.email || '').trim();
  const password = String(req.body.password || '');
  if (!email || !password) return res.status(400).json({ error: 'Email et mot de passe requis' });

  const [[client]] = await pool.query(
    'SELECT * FROM clients WHERE salon_id = ? AND email = ?', [req.salon.id, email]
  );
  if (!client || !(await verifyPassword(password, client.password_hash))) {
    return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
  }
  if (!client.email_verified) {
    return res.status(403).json({ error: 'Confirmez votre email avant de vous connecter (lien envoyé à l\'inscription).', needs_email_verification: true });
  }

  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000); // 90 jours
  await pool.query(
    'INSERT INTO client_sessions (token, client_id, expires_at) VALUES (?, ?, ?)',
    [token, client.id, expiresAt]
  );
  res.json({ ok: true, token });
}));

router.post('/logout', requireClient, wrap(async (req, res) => {
  await pool.query('DELETE FROM client_sessions WHERE token = ?', [req.headers['x-client-token']]);
  res.json({ ok: true });
}));

router.post('/forgot-password', signupRateLimiter('client-forgot'), wrap(async (req, res) => {
  const email = String(req.body.email || '').trim();
  const genericMsg = "Si un compte existe avec cet email, un lien de réinitialisation vient d'être envoyé.";
  if (!email) return res.json({ ok: true, message: genericMsg });
  try {
    const [[client]] = await pool.query('SELECT id FROM clients WHERE salon_id = ? AND email = ?', [req.salon.id, email]);
    if (client) {
      const token = crypto.randomBytes(32).toString('hex');
      const expires = new Date(Date.now() + 60 * 60 * 1000);
      await pool.query('UPDATE clients SET reset_token = ?, reset_token_expires = ? WHERE id = ?', [token, expires, client.id]);
      const resetUrl = appendParam(safeBaseUrl(req, req.body.base_url), 'reset', token);
      await sendClientPasswordReset(req.salon.id, email, resetUrl);
    }
  } catch (err) {
    console.error('[client forgot-password]', err.message);
  }
  res.json({ ok: true, message: genericMsg });
}));

router.post('/reset-password', wrap(async (req, res) => {
  const { token, password } = req.body;
  if (!token || !password) return res.status(400).json({ error: 'Lien et mot de passe requis' });
  if (password.length < 6) return res.status(400).json({ error: 'Le mot de passe doit contenir au moins 6 caractères' });
  const [[client]] = await pool.query('SELECT id FROM clients WHERE reset_token = ? AND reset_token_expires > NOW()', [token]);
  if (!client) return res.status(400).json({ error: 'Ce lien est invalide ou a expiré. Refaites une demande.' });
  const passwordHash = await hashPassword(password);
  await pool.query('UPDATE clients SET password_hash = ?, reset_token = NULL, reset_token_expires = NULL WHERE id = ?', [passwordHash, client.id]);
  // Nouveau mot de passe : toutes les sessions ouvertes avec l'ancien (ex. un téléphone perdu) sont fermées.
  await pool.query('DELETE FROM client_sessions WHERE client_id = ?', [client.id]);
  res.json({ ok: true });
}));

/**
 * Profil + fidélité + RDV à venir + historique récent. Le
 * rapprochement avec l'historique de passages se fait UNIQUEMENT via
 * l'email du compte (cf. clientKey() : email en priorité) - un client
 * ayant réservé/payé autrefois sous un email différent (ou en tant que
 * passage sans-RDV sans email) ne remontera pas ici, limite connue.
 *
 * - upcoming_appointments : TOUS les RDV confirmés pas encore honorés
 *   (plus une seule fois la plus proche) -> chacun annulable.
 * - recent_visits : les derniers passages déjà TERMINÉS ou ANNULÉS
 *   (jamais un RDV encore en cours - déjà couvert ci-dessus) -> pour
 *   re-réserver, plusieurs affichés, pas juste le dernier.
 */
router.get('/me', requireClient, wrap(async (req, res) => {
  const c = req.clientAccount;
  const key = clientKey({ email: c.email });

  const [[loyalty]] = await pool.query(
    'SELECT points, rewards_available, activated_at FROM loyalty_accounts WHERE salon_id = ? AND client_key = ?',
    [c.salon_id, key]
  );
  const loyaltyActivated = Boolean(loyalty && loyalty.activated_at);

  const salonSettings = await getSettings(c.salon_id);

  // scheduled_at est une heure de SALON (réglable), jamais de l'UTC -
  // comparaison avec l'heure de salon actuelle, pas UTC_TIMESTAMP().
  // Exclut aussi un RDV déjà honoré en avance (client pris plus tôt que
  // prévu, cf. le correctif des créneaux dynamiques) : son statut reste
  // 'confirmed' indéfiniment côté appointments, seule la file liée
  // (promoted_queue_id) sait qu'il est déjà 'done'.
  const [upcomingRows] = await pool.query(
    `SELECT a.id, a.scheduled_at, a.cancel_token, a.service_id, a.barber_id, a.client_note, a.client_name, a.group_id,
            ${serviceNameSql()} AS service_name, COALESCE(bsp.price_cents, s.price_cents) AS service_price_cents,
            bar.name AS barber_name, sl.slug AS salon_slug, sl.name AS salon_name
     FROM appointments a
     JOIN services s ON s.id = a.service_id
     LEFT JOIN barber_service_prices bsp ON bsp.barber_id = a.barber_id AND bsp.service_id = a.service_id
     LEFT JOIN barbers bar ON bar.id = a.barber_id
     LEFT JOIN queue q ON q.id = a.promoted_queue_id
     JOIN salons sl ON sl.id = a.salon_id
     WHERE a.salon_id = ? AND LOWER(TRIM(a.email)) = ? AND a.status = 'confirmed' AND a.scheduled_at >= ?
       AND (q.status IS NULL OR q.status NOT IN ('done', 'cancelled'))
     ORDER BY a.scheduled_at ASC LIMIT 20`,
    [c.salon_id, key, nowParisDatetimeString(salonSettings.timezone)]
  );

  const upcomingAppointments = [];
  for (const upcoming of upcomingRows) {
    const [extraRows] = await pool.query(
      `SELECT e.name, COALESCE(bep.price_cents, e.price_cents) AS price_cents FROM appointment_extras ae JOIN extras e ON e.id = ae.extra_id
       LEFT JOIN barber_extra_prices bep ON bep.barber_id = ? AND bep.extra_id = ae.extra_id WHERE ae.appointment_id = ?`,
      [upcoming.barber_id, upcoming.id]
    );
    const totalCents = upcoming.service_price_cents + extraRows.reduce((sum, e) => sum + e.price_cents, 0);
    upcomingAppointments.push({
      id: upcoming.id,
      scheduled_at: upcoming.scheduled_at,
      service_name: upcoming.service_name,
      barber_name: upcoming.barber_name,
      extras: extraRows.map((e) => e.name),
      price_cents: totalCents,
      client_note: upcoming.client_note || '',
      cancel_token: upcoming.cancel_token,
      // Rendez-vous pris POUR un proche (reservation a plusieurs) : son prenom, pour l'afficher dans la liste.
      person_name: upcoming.client_name && String(upcoming.client_name).trim().toLowerCase() !== String(c.name || '').trim().toLowerCase() ? upcoming.client_name : null,
      group_id: upcoming.group_id || null
    });
  }

  // Seulement le DERNIER passage PAYÉ (jamais un en cours, en attente
  // d'encaissement, annulé ou supprimé car offert) - une liste de
  // plusieurs n'apportait pas grand-chose en pratique (souvent la même
  // prestation répétée), contrairement aux RDV à venir qui eux
  // méritent d'être tous visibles.
  const [recentVisits] = await pool.query(
    `SELECT q.id, q.checkin_at, q.status, s.name AS service_name, q.service_id, q.barber_id, b.name AS barber_name,
            sl.slug AS salon_slug, sl.name AS salon_name
     FROM queue q
     JOIN salons sl ON sl.id = q.salon_id
     LEFT JOIN services s ON s.id = q.service_id
     LEFT JOIN barbers b ON b.id = q.barber_id
     WHERE q.salon_id = ? AND LOWER(TRIM(q.email)) = ? AND q.status = 'done' AND (q.paid_at IS NOT NULL OR q.prepaid_at IS NOT NULL)
     ORDER BY q.checkin_at DESC LIMIT 1`,
    [c.salon_id, key]
  );

  // Cartes cadeaux reçues par ce client sur ce salon (même clé de
  // rapprochement que RDV/passages ci-dessus : email, en priorité).
  const [giftCards] = await pool.query(
    `SELECT id, code, amount_cents, items_json, used_at, pending_appointment_id, created_at
     FROM gift_cards
     WHERE salon_id = ? AND LOWER(TRIM(recipient_email)) = ?
     ORDER BY created_at DESC LIMIT 20`,
    [c.salon_id, key]
  );

  const [relativeRows] = await pool.query('SELECT id, name FROM client_relatives WHERE client_id = ? ORDER BY created_at ASC', [c.id]);

  res.json({
    ok: true,
    profile: { name: c.name, email: c.email, phone: c.phone },
    relatives: relativeRows,
    loyalty_activated: loyaltyActivated,
    loyalty: loyaltyActivated ? Object.assign({ points: loyalty.points, rewards_available: loyalty.rewards_available },
      await (async () => { const t = await thresholdsForSalon(c.salon_id); return { thresholds: t, rewards: rewardsFor(loyalty.points, t) }; })()) : null,
    upcoming_appointments: upcomingAppointments,
    recent_visits: recentVisits,
    gift_cards: giftCards.map((g) => {
      let items = [];
      try { items = JSON.parse(g.items_json || '[]'); } catch (e) { items = []; }
      return {
        id: g.id, code: g.code, amount_cents: g.amount_cents,
        // Seulement le nom et la quantité - jamais le prix unitaire de
        // chaque article, qui n'a pas à être visible du bénéficiaire
        // (seul le montant total du cadeau est pertinent pour lui).
        items: items.map((it) => ({ name: it.item_name, quantity: it.quantity, type: it.item_type })),
        used: Boolean(g.used_at), pending: Boolean(g.pending_appointment_id), created_at: g.created_at
      };
    })
  });
}));

router.put('/me', requireClient, wrap(async (req, res) => {
  const { name, email, phone, new_password, current_password } = req.body;
  const sets = [];
  const params = [];

  if (name) { sets.push('name = ?'); params.push(name); }

  if (phone !== undefined) {
    if (!String(phone).trim()) return res.status(400).json({ error: 'Le téléphone est requis' });
    if (!isValidPhone(phone)) return res.status(400).json({ error: 'Numéro de téléphone invalide (exemple : 06 12 34 56 78).' });
    sets.push('phone = ?'); params.push(String(phone).trim());
  }

  // Ne jamais modifier l'adresse active avant confirmation du nouvel email.
  if (email && String(email).trim().toLowerCase() !== String(req.clientAccount.email).trim().toLowerCase()) {
    const newEmail = String(email).trim().toLowerCase();
    if (!isValidEmail(newEmail)) return res.status(400).json({ error: 'Adresse email invalide (exemple : prenom@gmail.com).' });
    const [[existing]] = await pool.query(
      'SELECT id FROM clients WHERE salon_id = ? AND (email = ? OR pending_email = ?) AND id != ?',
      [req.clientAccount.salon_id, newEmail, newEmail, req.clientAccount.id]
    );
    if (existing) return res.status(409).json({ error: 'Cet email est déjà utilisé par un autre compte' });
    const verifyToken = crypto.randomBytes(32).toString('hex');
    const verifyExpires = new Date(Date.now() + 15 * 60 * 1000);
    const verifyUrl = appendParam(safeBaseUrl(req, req.body.base_url), 'verify', verifyToken);
    try {
      await sendClientVerificationEmail(req.clientAccount.salon_id, newEmail, verifyUrl, { change: true });
    } catch (err) {
      console.error('[client email change] envoi email échoué:', err.message);
      return res.status(503).json({ error: 'Envoi de la vérification impossible. Réessayez plus tard.' });
    }
    sets.push('pending_email = ?', 'verify_token = ?', 'verify_token_expires = ?');
    params.push(newEmail, verifyToken, verifyExpires);
    req.emailChangePending = true;
    // Avertir l'ancienne adresse sans divulguer le lien de confirmation.
    try { await sendClientSecurityNotice(req.clientAccount.salon_id, req.clientAccount.email, 'Demande de changement d’adresse email', 'Une demande de changement de votre adresse email a été effectuée. Si ce n’était pas vous, contactez le salon immédiatement.'); }
    catch (err) { console.error('[client email change] notification:', err.message); }
  }

  if (new_password) {
    const passwordAttemptKeys = await guardPasswordAttempt(req, res, 'client-password-change', req.clientAccount.id);
    if (!passwordAttemptKeys) return;
    if (!current_password || !(await verifyPassword(current_password, req.clientAccount.password_hash))) {
      await failPasswordAttempt(passwordAttemptKeys);
      return res.status(403).json({ error: 'Mot de passe actuel incorrect' });
    }
    await clearPasswordAttempt(passwordAttemptKeys);
    if (new_password.length < 6) return res.status(400).json({ error: 'Le nouveau mot de passe doit contenir au moins 6 caractères' });
    sets.push('password_hash = ?'); params.push(await hashPassword(new_password));
    req.passwordChanged = true;
  }

  if (!sets.length) return res.json({ ok: true });

  params.push(req.clientAccount.id);
  await pool.query(`UPDATE clients SET ${sets.join(', ')} WHERE id = ?`, params);
  if (req.passwordChanged) {
    await pool.query('DELETE FROM client_sessions WHERE client_id = ? AND token != ?', [req.clientAccount.id, req.headers['x-client-token']]);
    try { await sendClientSecurityNotice(req.clientAccount.salon_id, req.clientAccount.email, 'Mot de passe modifié', 'Le mot de passe de votre compte a été modifié. Si ce n’était pas vous, réinitialisez-le immédiatement.'); }
    catch (err) { console.error('[client password change] notification:', err.message); }
  }
  res.json({ ok: true, email_verification_pending: Boolean(req.emailChangePending) });
}));

/**
 * Modifie la note du client sur UN de ses rendez-vous à venir précis
 * (allergie, préférence...) - jamais la note privée du coiffeur
 * (client_notes), qui reste un outil séparé réservé au staff.
 * Vérifie que ce RDV appartient bien au client connecté (même email)
 * avant toute modification.
 */
router.put('/appointments/:id/note', requireClient, wrap(async (req, res) => {
  const c = req.clientAccount;
  const key = clientKey({ email: c.email });
  const note = req.body.note ? String(req.body.note).slice(0, 500) : null;

  const [[appt]] = await pool.query(
    `SELECT a.id FROM appointments a WHERE a.id = ? AND a.salon_id = ? AND LOWER(TRIM(a.email)) = ? AND a.status = 'confirmed'`,
    [req.params.id, c.salon_id, key]
  );
  if (!appt) return res.status(404).json({ error: 'Rendez-vous introuvable' });

  await pool.query('UPDATE appointments SET client_note = ? WHERE id = ?', [note, appt.id]);
  res.json({ ok: true });
}));

/* ---------- Mes proches (reservation a plusieurs) ---------- */
const MAX_RELATIVES = 12;
function cleanRelativeName(v) { return String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, 100); }

router.get('/relatives', requireClient, wrap(async (req, res) => {
  const [rows] = await pool.query('SELECT id, name FROM client_relatives WHERE client_id = ? ORDER BY created_at ASC', [req.clientAccount.id]);
  res.json({ ok: true, items: rows });
}));

router.post('/relatives', requireClient, wrap(async (req, res) => {
  const name = cleanRelativeName(req.body.name);
  if (!name) return res.status(400).json({ error: 'Le prénom est requis' });
  const [[count]] = await pool.query('SELECT COUNT(*) AS n FROM client_relatives WHERE client_id = ?', [req.clientAccount.id]);
  if (count.n >= MAX_RELATIVES) return res.status(400).json({ error: 'Maximum ' + MAX_RELATIVES + ' proches enregistrés.' });
  // Meme prenom deja enregistre : on le renvoie tel quel (pas de doublon).
  const [[same]] = await pool.query('SELECT id, name FROM client_relatives WHERE client_id = ? AND LOWER(name) = LOWER(?)', [req.clientAccount.id, name]);
  if (same) return res.json({ ok: true, item: same, existing: true });
  const id = crypto.randomUUID();
  await pool.query('INSERT INTO client_relatives (id, client_id, name) VALUES (?, ?, ?)', [id, req.clientAccount.id, name]);
  res.json({ ok: true, item: { id, name } });
}));

router.put('/relatives/:id', requireClient, wrap(async (req, res) => {
  const name = cleanRelativeName(req.body.name);
  if (!name) return res.status(400).json({ error: 'Le prénom est requis' });
  const [r] = await pool.query('UPDATE client_relatives SET name = ? WHERE id = ? AND client_id = ?', [name, req.params.id, req.clientAccount.id]);
  if (!r.affectedRows) return res.status(404).json({ error: 'Proche introuvable' });
  res.json({ ok: true, item: { id: req.params.id, name } });
}));

router.delete('/relatives/:id', requireClient, wrap(async (req, res) => {
  const [r] = await pool.query('DELETE FROM client_relatives WHERE id = ? AND client_id = ?', [req.params.id, req.clientAccount.id]);
  if (!r.affectedRows) return res.status(404).json({ error: 'Proche introuvable' });
  res.json({ ok: true });
}));

module.exports = router;
