const nodemailer = require('nodemailer');
const { pool } = require('../db');

// Distinct du mailer par salon (src/lib/mailer.js, qui prévient les CLIENTS
// d'un salon avant leur tour). Celui-ci envoie des emails transactionnels
// de la PLATEFORME elle-même aux propriétaires de salon (réinitialisation
// de mot de passe...) — configuré depuis le dashboard super admin, stocké
// en base (table platform_settings), pas dans le fichier .env.
let cached = null;

async function getTransport() {
  if (cached) return cached;

  const [rows] = await pool.query('SELECT `key`, value FROM platform_settings');
  const s = {};
  rows.forEach((r) => { s[r.key] = r.value; });

  if (!s.smtp_host) {
    throw new Error("Email de la plateforme non configuré (Super Admin > Email plateforme)");
  }

  cached = {
    from: s.smtp_from || s.smtp_user,
    tx: nodemailer.createTransport({
      host: s.smtp_host,
      port: Number(s.smtp_port || 587),
      secure: Number(s.smtp_port) === 465,
      auth: s.smtp_user ? { user: s.smtp_user, pass: s.smtp_pass } : undefined
    })
  };
  return cached;
}

function invalidateTransport() {
  cached = null;
}

async function sendPasswordReset(to, resetUrl) {
  const { tx, from } = await getTransport();
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

async function sendVerificationEmail(to, verifyUrl) {
  const { tx, from } = await getTransport();
  await tx.sendMail({
    from,
    to,
    subject: 'Confirmez votre adresse email',
    text: `Bienvenue ! Cliquez sur ce lien pour confirmer votre adresse email et activer votre compte ` +
          `(valable 24 heures) :\n\n${verifyUrl}\n\n` +
          `Si vous n'êtes pas à l'origine de cette inscription, ignorez simplement cet email.`,
    html: `<p>Bienvenue ! Cliquez sur ce lien pour confirmer votre adresse email et activer votre compte ` +
          `(valable 24 heures) :</p>` +
          `<p><a href="${verifyUrl}">${verifyUrl}</a></p>` +
          `<p>Si vous n'êtes pas à l'origine de cette inscription, ignorez simplement cet email.</p>`
  });
}

async function sendTestEmail(to) {
  const { tx, from } = await getTransport();
  await tx.sendMail({
    from,
    to,
    subject: 'Test SMTP — plateforme',
    text: 'Si vous lisez ceci, la configuration SMTP de la plateforme fonctionne.'
  });
}

module.exports = { sendPasswordReset, sendVerificationEmail, sendTestEmail, invalidateTransport };
