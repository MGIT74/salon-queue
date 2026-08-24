const nodemailer = require('nodemailer');
const { getSettings } = require('../db');

// Un transport par salon, chacun avec sa propre config SMTP.
const cache = new Map();

async function getTransport(salonId) {
  if (cache.has(salonId)) return cache.get(salonId);
  const s = await getSettings(salonId);
  if (!s.smtp_host) throw new Error('SMTP non configuré (Dashboard > Réglages)');

  const entry = {
    from: s.smtp_from || s.smtp_user,
    salon: s.salon_name || 'Le Salon',
    tx: nodemailer.createTransport({
      host: s.smtp_host,
      port: Number(s.smtp_port || 587),
      secure: Number(s.smtp_port) === 465,
      auth: s.smtp_user ? { user: s.smtp_user, pass: s.smtp_pass } : undefined
    })
  };
  cache.set(salonId, entry);
  return entry;
}

function invalidateTransport(salonId) {
  if (salonId) cache.delete(salonId);
  else cache.clear();
}

/**
 * Remplace les jetons {{nom}} d'un modèle personnalisé par les
 * valeurs réelles - jamais utilisé si le modèle est vide (le
 * comportement par défaut, codé en dur, reste alors inchangé).
 */
function applyTemplate(customText, tokens) {
  let out = customText;
  Object.keys(tokens).forEach((k) => {
    out = out.split('{{' + k + '}}').join(tokens[k] == null ? '' : String(tokens[k]));
  });
  return out;
}

async function sendTurnSoon(salonId, to, name, waitMin) {
  const { tx, from, salon } = await getTransport(salonId);
  const s = await getSettings(salonId);
  const tokens = { client_name: name, wait_min: waitMin, salon };
  const customSubject = s.email_tpl_turn_soon_subject ? applyTemplate(s.email_tpl_turn_soon_subject, tokens) : '';
  const customBody = s.email_tpl_turn_soon_body ? applyTemplate(s.email_tpl_turn_soon_body, tokens) : '';

  await tx.sendMail({
    from,
    to,
    subject: customSubject || 'Votre tour approche',
    text: customBody ||
      (`Bonjour ${name},\n\nVotre tour est estimé dans environ ${waitMin} minutes.\n` +
       `Merci de revenir vers le salon d'ici là.\n\n${salon}`),
    html: customBody
      ? customBody.replace(/\n/g, '<br>')
      : (`<p>Bonjour ${name},</p>` +
         `<p>Votre tour est estimé dans environ <strong>${waitMin} minutes</strong>.</p>` +
         `<p>Merci de revenir vers le salon d'ici là.</p>` +
         `<p>${salon}</p>`)
  });
}

/**
 * Rappel d'un RDV programmé à l'avance, N minutes avant l'heure fixée
 * (notify_before_min) - distinct de sendTurnSoon (file d'attente
 * physique en temps réel), qui ne convient pas ici : un horaire de
 * RDV est fixe et connu, pas une estimation dynamique de position.
 */
async function sendAppointmentReminder(salonId, to, info) {
  const { tx, from, salon } = await getTransport(salonId);
  const s = await getSettings(salonId);
  const tokens = { client_name: info.clientName, service_name: info.serviceName, when: info.when, salon };
  const customSubject = s.email_tpl_reminder_subject ? applyTemplate(s.email_tpl_reminder_subject, tokens) : '';
  const customBody = s.email_tpl_reminder_body ? applyTemplate(s.email_tpl_reminder_body, tokens) : '';

  await tx.sendMail({
    from,
    to,
    subject: customSubject || `Rappel — votre rendez-vous chez ${salon}`,
    text: customBody || `Bonjour ${info.clientName},\n\nPetit rappel : votre rendez-vous (${info.serviceName}) est prévu ${info.when}.\n\n${salon}`,
    html: customBody
      ? customBody.replace(/\n/g, '<br>')
      : (`<p>Bonjour ${info.clientName},</p>` +
         `<p>Petit rappel : votre rendez-vous (<strong>${info.serviceName}</strong>) est prévu <strong>${info.when}</strong>.</p>` +
         `<p>${salon}</p>`)
  });
}

async function sendLoyaltyActivation(salonId, to, info) {
  const { tx, from, salon } = await getTransport(salonId);
  await tx.sendMail({
    from,
    to,
    subject: 'Votre carte de fidélité est activée — ' + salon,
    text: `Bonjour ${info.clientName},\n\n` +
          `Votre carte de fidélité chez ${salon} vient d'être activée !\n\n` +
          `À chaque passage réglé, vous gagnez 1 point. Tous les ${info.threshold} points, ` +
          `vous obtenez une récompense (réduction sur une prestation ou un produit), ` +
          `utilisable dès votre prochaine visite.\n\n${salon}`,
    html: `<p>Bonjour ${info.clientName},</p>` +
          `<p>Votre carte de fidélité chez ${salon} vient d'être activée !</p>` +
          `<p>À chaque passage réglé, vous gagnez 1 point. Tous les <strong>${info.threshold} points</strong>, ` +
          `vous obtenez une récompense (réduction sur une prestation ou un produit), ` +
          `utilisable dès votre prochaine visite.</p>` +
          `<p>${salon}</p>`
  });
}

async function sendGiftConfirmation(salonId, to, info) {
  const { tx, from, salon } = await getTransport(salonId);
  const itemsList = info.items.map((it) => `${it.quantity} × ${it.item_name}`).join(', ');
  await tx.sendMail({
    from,
    to,
    subject: 'Votre cadeau — ' + salon,
    text: `Bonjour ${info.recipientName},\n\n` +
          `Un cadeau de ${info.amountEur} vous a été offert chez ${salon} !\n\n` +
          `Contenu : ${itemsList}\n\n` +
          `Votre code : ${info.code}\n\n` +
          `Présentez-vous en salon et indiquez ce code à l'accueil ou saisissez-le sur la borne ` +
          `("Utiliser un cadeau") pour en profiter.\n\n${salon}`,
    html: `<p>Bonjour ${info.recipientName},</p>` +
          `<p>Un cadeau de <strong>${info.amountEur}</strong> vous a été offert chez ${salon} !</p>` +
          `<p>Contenu : ${itemsList}</p>` +
          `<p style="font-size:20px;font-weight:700;letter-spacing:2px">${info.code}</p>` +
          `<p>Présentez-vous en salon et indiquez ce code à l'accueil, ou saisissez-le sur la borne ` +
          `(« Utiliser un cadeau ») pour en profiter.</p>` +
          `<p>${salon}</p>`
  });
}

async function sendTest(salonId, to) {
  const { tx, from, salon } = await getTransport(salonId);
  await tx.sendMail({
    from,
    to,
    subject: 'Test SMTP — ' + salon,
    text: 'Si vous lisez ceci, la configuration SMTP fonctionne.'
  });
}

async function sendAppointmentConfirmation(salonId, to, info) {
  const { tx, from, salon } = await getTransport(salonId);
  const s = await getSettings(salonId);
  const tokens = {
    client_name: info.clientName, when: info.when, service_name: info.serviceName,
    barber_name: info.barberName || '', salon, cancel_url: info.cancelUrl
  };
  const customSubject = s.email_tpl_confirmation_subject ? applyTemplate(s.email_tpl_confirmation_subject, tokens) : '';
  const customBody = s.email_tpl_confirmation_body ? applyTemplate(s.email_tpl_confirmation_body, tokens) : '';

  await tx.sendMail({
    from,
    to,
    subject: customSubject || ('Confirmation de votre rendez-vous — ' + salon),
    text: customBody ||
      (`Bonjour ${info.clientName},\n\n` +
       `Votre rendez-vous chez ${salon} est confirmé :\n` +
       `${info.when} — ${info.serviceName}${info.barberName ? ' avec ' + info.barberName : ''}\n\n` +
       `Besoin d'annuler ? ${info.cancelUrl}\n\n${salon}`),
    html: customBody
      ? customBody.replace(/\n/g, '<br>')
      : (`<p>Bonjour ${info.clientName},</p>` +
         `<p>Votre rendez-vous chez ${salon} est confirmé :</p>` +
         `<p><strong>${info.when}</strong><br>${info.serviceName}${info.barberName ? ' avec ' + info.barberName : ''}</p>` +
         `<p><a href="${info.cancelUrl}">Annuler ce rendez-vous</a></p>` +
         `<p>${salon}</p>`)
  });
}

/**
 * Annulation à l'initiative du SALON (pas du client) - texte
 * volontairement différent (excuses), distinct de l'annulation
 * self-service (client via son lien/compte), qui n'envoie aucun
 * email puisque le client sait déjà qu'il vient d'annuler lui-même.
 */
async function sendAppointmentCancelledByAdmin(salonId, to, info) {
  const { tx, from, salon } = await getTransport(salonId);
  const s = await getSettings(salonId);
  const customMessage = info.customMessage ? String(info.customMessage).trim() : '';
  const defaultReasonText = customMessage || "N'hésitez pas à nous recontacter pour reprendre un nouveau rendez-vous.";
  const tokens = {
    client_name: info.clientName, when: info.when, service_name: info.serviceName,
    salon, custom_message: defaultReasonText
  };
  const customSubject = s.email_tpl_cancelled_subject ? applyTemplate(s.email_tpl_cancelled_subject, tokens) : '';
  const customBody = s.email_tpl_cancelled_body ? applyTemplate(s.email_tpl_cancelled_body, tokens) : '';

  await tx.sendMail({
    from,
    to,
    subject: customSubject || ('Votre rendez-vous a été annulé — ' + salon),
    text: customBody ||
      (`Bonjour ${info.clientName},\n\n` +
       `Nous sommes désolés de vous informer que votre rendez-vous du ${info.when} ` +
       `(${info.serviceName}) chez ${salon} a dû être annulé.\n` +
       `${defaultReasonText}\n\n` +
       `Toutes nos excuses pour la gêne occasionnée.\n\n${salon}`),
    html: customBody
      ? customBody.replace(/\n/g, '<br>')
      : (`<p>Bonjour ${info.clientName},</p>` +
         `<p>Nous sommes désolés de vous informer que votre rendez-vous du <strong>${info.when}</strong> ` +
         `(${info.serviceName}) chez ${salon} a dû être annulé.</p>` +
         `<p>${defaultReasonText.replace(/\n/g, '<br>')}</p>` +
         `<p>Toutes nos excuses pour la gêne occasionnée.</p>` +
         `<p>${salon}</p>`)
  });
}

/**
 * Confirmation qu'un RDV a été modifié (nouvel horaire/coiffeur) à
 * l'initiative du salon.
 */
async function sendAppointmentRescheduled(salonId, to, info) {
  const { tx, from, salon } = await getTransport(salonId);
  const s = await getSettings(salonId);
  const tokens = {
    client_name: info.clientName, when: info.when, service_name: info.serviceName,
    barber_name: info.barberName || '', salon, cancel_url: info.cancelUrl
  };
  const customSubject = s.email_tpl_rescheduled_subject ? applyTemplate(s.email_tpl_rescheduled_subject, tokens) : '';
  const customBody = s.email_tpl_rescheduled_body ? applyTemplate(s.email_tpl_rescheduled_body, tokens) : '';

  await tx.sendMail({
    from,
    to,
    subject: customSubject || ('Votre rendez-vous a été modifié — ' + salon),
    text: customBody ||
      (`Bonjour ${info.clientName},\n\n` +
       `Votre rendez-vous chez ${salon} a été modifié.\n\n` +
       `Nouvel horaire : ${info.when} — ${info.serviceName}${info.barberName ? ' avec ' + info.barberName : ''}\n\n` +
       `Besoin d'annuler ? ${info.cancelUrl}\n\n${salon}`),
    html: customBody
      ? customBody.replace(/\n/g, '<br>')
      : (`<p>Bonjour ${info.clientName},</p>` +
         `<p>Votre rendez-vous chez ${salon} a été modifié.</p>` +
         `<p>Nouvel horaire :<br><strong>${info.when}</strong><br>${info.serviceName}${info.barberName ? ' avec ' + info.barberName : ''}</p>` +
         `<p><a href="${info.cancelUrl}">Annuler ce rendez-vous</a></p>` +
         `<p>${salon}</p>`)
  });
}

async function sendClientVerificationEmail(salonId, to, verifyUrl) {
  const { tx, from, salon } = await getTransport(salonId);
  await tx.sendMail({
    from,
    to,
    subject: 'Confirmez votre adresse email — ' + salon,
    text: `Bienvenue ! Cliquez sur ce lien pour confirmer votre adresse email et activer votre compte ` +
          `chez ${salon} (valable 24 heures) :\n\n${verifyUrl}\n\n` +
          `Si vous n'êtes pas à l'origine de cette inscription, ignorez simplement cet email.`,
    html: `<p>Bienvenue ! Cliquez sur ce lien pour confirmer votre adresse email et activer votre compte ` +
          `chez ${salon} (valable 24 heures) :</p>` +
          `<p><a href="${verifyUrl}">${verifyUrl}</a></p>` +
          `<p>Si vous n'êtes pas à l'origine de cette inscription, ignorez simplement cet email.</p>`
  });
}

async function sendClientPasswordReset(salonId, to, resetUrl) {
  const { tx, from, salon } = await getTransport(salonId);
  await tx.sendMail({
    from,
    to,
    subject: 'Réinitialisation de votre mot de passe — ' + salon,
    text: `Cliquez sur ce lien pour choisir un nouveau mot de passe (valable 1 heure) :\n\n${resetUrl}\n\n` +
          `Si vous n'êtes pas à l'origine de cette demande, ignorez simplement cet email.`,
    html: `<p>Cliquez sur ce lien pour choisir un nouveau mot de passe (valable 1 heure) :</p>` +
          `<p><a href="${resetUrl}">${resetUrl}</a></p>` +
          `<p>Si vous n'êtes pas à l'origine de cette demande, ignorez simplement cet email.</p>`
  });
}

/**
 * Fermeture exceptionnelle du salon (férié, fermeture urgente...) -
 * envoyée à tous les clients connus du salon. Message par défaut
 * générique, ou message personnalisé fourni par l'admin (ex: raison
 * précise d'une fermeture d'urgence).
 */
async function sendSalonClosureNotice(salonId, to, info) {
  const { tx, from, salon } = await getTransport(salonId);
  const s = await getSettings(salonId);
  const sameDay = info.startDate === info.endDate;
  const whenText = sameDay
    ? new Date(info.startDate + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
    : new Date(info.startDate + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' }) + ' au ' +
      new Date(info.endDate + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

  // Priorité : message ponctuel tapé pour CETTE fermeture précise >
  // modèle personnalisé enregistré dans Notifications email > message
  // par défaut codé en dur.
  const perInstanceMessage = info.customMessage ? String(info.customMessage).trim() : '';
  const tokens = {
    client_name: info.clientName, start_date: whenText, end_date: whenText,
    when: whenText, reason: info.reason || '', salon
  };
  const customSubject = s.email_tpl_closure_subject ? applyTemplate(s.email_tpl_closure_subject, tokens) : '';
  const templateBody = s.email_tpl_closure_body ? applyTemplate(s.email_tpl_closure_body, tokens) : '';

  const defaultBody = `${salon} sera exceptionnellement fermé ${sameDay ? 'le' : 'du'} ${whenText}` +
    (info.reason ? ` (${info.reason})` : '') + `.\n\nMerci de votre compréhension.`;
  const bodyText = perInstanceMessage || templateBody || defaultBody;

  await tx.sendMail({
    from,
    to,
    subject: customSubject || `Fermeture exceptionnelle — ${salon}`,
    text: `Bonjour ${info.clientName},\n\n${bodyText}\n\n${salon}`,
    html: `<p>Bonjour ${info.clientName},</p>` +
          `<p>${bodyText.replace(/\n/g, '<br>')}</p>` +
          `<p>${salon}</p>`
  });
}

module.exports = {
  sendTurnSoon, sendTest, sendGiftConfirmation, sendLoyaltyActivation, sendAppointmentConfirmation,
  sendAppointmentReminder, sendAppointmentCancelledByAdmin, sendAppointmentRescheduled,
  sendClientVerificationEmail, sendClientPasswordReset, sendSalonClosureNotice, invalidateTransport
};
