const nodemailer = require('nodemailer');
const { getSettings } = require('../db');

// Le transport est reconstruit quand les réglages changent (invalidateTransport)
let cached = null;

async function getTransport() {
  if (cached) return cached;
  const s = await getSettings();
  if (!s.smtp_host) throw new Error('SMTP non configuré (Dashboard > Réglages)');

  cached = {
    from: s.smtp_from || s.smtp_user,
    salon: s.salon_name || 'Le Salon',
    tx: nodemailer.createTransport({
      host: s.smtp_host,
      port: Number(s.smtp_port || 587),
      secure: Number(s.smtp_port) === 465,
      auth: s.smtp_user ? { user: s.smtp_user, pass: s.smtp_pass } : undefined
    })
  };
  return cached;
}

function invalidateTransport() { cached = null; }

async function sendTurnSoon(to, name, waitMin) {
  const { tx, from, salon } = await getTransport();
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

async function sendTest(to) {
  const { tx, from, salon } = await getTransport();
  await tx.sendMail({
    from,
    to,
    subject: 'Test SMTP — ' + salon,
    text: 'Si vous lisez ceci, la configuration SMTP fonctionne.'
  });
}

module.exports = { sendTurnSoon, sendTest, invalidateTransport };
