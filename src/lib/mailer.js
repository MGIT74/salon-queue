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

async function sendTurnSoon(salonId, to, name, waitMin) {
  const { tx, from, salon } = await getTransport(salonId);
  await tx.sendMail({
    from,
    to,
    subject: 'Votre tour approche',
    text: `Bonjour ${name},\n\nVotre tour est estimé dans environ ${waitMin} minutes.\n` +
          `Merci de revenir vers le salon d'ici là.\n\n${salon}`,
    html: `<p>Bonjour ${name},</p>` +
          `<p>Votre tour est estimé dans environ <strong>${waitMin} minutes</strong>.</p>` +
          `<p>Merci de revenir vers le salon d'ici là.</p>` +
          `<p>${salon}</p>`
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

module.exports = { sendTurnSoon, sendTest, sendGiftConfirmation, sendLoyaltyActivation, invalidateTransport };
