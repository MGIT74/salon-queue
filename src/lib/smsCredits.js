/**
 * Credits SMS par salon : une dotation MENSUELLE (credits_granted) qui se
 * remet a zero le 1er de chaque mois (mois de Paris) - non cumulable.
 * Le super admin peut ajouter un bonus (credits_bonus) valable pour le
 * mois en cours seulement. Remise a zero "a la volee" (pas de tache planifiee),
 * comme les credits de l'assistant IA.
 */
const { pool } = require('../db');

function currentMonth() {
  return new Date().toLocaleString('sv-SE', { timeZone: 'Europe/Paris' }).slice(0, 7); // 'YYYY-MM'
}

/** Remet a zero les salons dont la periode n'est pas le mois courant (un salon, ou tous). */
async function rollover(salonId) {
  const m = currentMonth();
  const where = salonId ? ' AND salon_id = ?' : '';
  await pool.query(
    'UPDATE sms_credits SET credits_used = 0, credits_bonus = 0, period_month = ? WHERE (period_month IS NULL OR period_month <> ?)' + where,
    salonId ? [m, m, salonId] : [m, m]
  );
}

/** Etat des credits du mois (cree la ligne au besoin). credits_granted = dotation + bonus du mois. */
async function getSmsCredits(salonId) {
  await pool.query('INSERT IGNORE INTO sms_credits (salon_id, period_month) VALUES (?, ?)', [salonId, currentMonth()]);
  await rollover(salonId);
  const [[row]] = await pool.query(
    `SELECT sms_enabled, credits_granted AS credits_monthly, credits_bonus,
            (credits_granted + credits_bonus) AS credits_granted, credits_used
     FROM sms_credits WHERE salon_id = ?`, [salonId]);
  return row;
}

module.exports = { currentMonth, rollover, getSmsCredits };
