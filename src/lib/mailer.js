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

async function sendTest(salonId, to) {
  const { tx, from, salon } = await getTransport(salonId);
  await tx.sendMail({
    from,
    to,
    subject: 'Test SMTP — ' + salon,
    text: 'Si vous lisez ceci, la configuration SMTP fonctionne.'
  });
}

module.exports = { sendTurnSoon, sendTest, invalidateTransport };
