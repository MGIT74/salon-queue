const nodemailer = require('nodemailer');

// Distinct du mailer par salon (src/lib/mailer.js, qui prévient les CLIENTS
// d'un salon avant leur tour). Celui-ci envoie des emails transactionnels
// de la PLATEFORME elle-même aux propriétaires de salon (réinitialisation
// de mot de passe...) — configuré via des variables d'environnement dédiées,
// pas depuis les Réglages d'un salon.
let cached = null;

function getTransport() {
  if (cached) return cached;
  const host = process.env.PLATFORM_SMTP_HOST;
  if (!host) {
    throw new Error("Email de la plateforme non configuré (PLATFORM_SMTP_HOST manquant dans l'environnement)");
  }
  cached = {
    from: process.env.PLATFORM_SMTP_FROM || process.env.PLATFORM_SMTP_USER,
    tx: nodemailer.createTransport({
      host,
      port: Number(process.env.PLATFORM_SMTP_PORT || 587),
      secure: Number(process.env.PLATFORM_SMTP_PORT) === 465,
      auth: process.env.PLATFORM_SMTP_USER
        ? { user: process.env.PLATFORM_SMTP_USER, pass: process.env.PLATFORM_SMTP_PASS }
        : undefined
    })
  };
  return cached;
}

async function sendPasswordReset(to, resetUrl) {
  const { tx, from } = getTransport();
  await tx.sendMail({
    from,
    to,
    subject: 'Réinitialisation de votre mot de passe',
    text: `Cliquez sur ce lien pour choisir un nouveau mot de passe (valable 1 heure) :\n\n${resetUrl}\n\n` +
          `Si vous n'êtes pas à l'origine de cette demande, ignorez simplement cet email.`,
    html: `<p>Cliquez sur ce lien pour choisir un nouveau mot de passe (valable 1 heure) :</p>` +
          `<p><a href="${resetUrl}">${resetUrl}</a></p>` +
          `<p>Si vous n'êtes pas à l'origine de cette demande, ignorez simplement cet email.</p>`
  });
}

async function sendTestEmail(to) {
  const { tx, from } = getTransport();
  await tx.sendMail({
    from,
    to,
    subject: 'Test SMTP — plateforme',
    text: 'Si vous lisez ceci, la configuration SMTP de la plateforme fonctionne.'
  });
}

module.exports = { sendPasswordReset, sendTestEmail };
