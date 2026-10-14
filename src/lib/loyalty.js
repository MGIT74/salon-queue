'use strict';

// Fidélité : activation automatique à la CRÉATION DU COMPTE client en ligne.
// Avant, la carte n'était activée qu'à la caisse, à la demande du coiffeur.
// Désormais un client qui crée son compte (page de réservation) reçoit sa
// carte tout de suite, avec l'email d'activation habituel.
//
// Ne touche JAMAIS à une carte déjà existante : un client dont la carte a été
// désactivée par l'admin (points conservés) n'est pas réactivé de force.

const { pool, getOwnerSettings } = require('../db');
const { clientKey } = require('./queueMath');
const { sendLoyaltyActivation } = require('./mailer');
const { logActivity } = require('./activityLog');

/**
 * @returns {Promise<boolean>} true si une carte vient d'être créée et activée.
 */
async function activateOnAccountCreation(salonId, { client_name, email, phone }) {
  const name = String(client_name || '').trim();
  const mail = String(email || '').trim();
  if (!name || !mail) return false;
  const key = clientKey({ email: mail, phone, client_name: name });
  if (!key) return false;

  const [[existing]] = await pool.query(
    'SELECT id FROM loyalty_accounts WHERE salon_id = ? AND client_key = ?',
    [salonId, key]
  );
  if (existing) return false;

  const [[salon]] = await pool.query('SELECT owner_id FROM salons WHERE id = ?', [salonId]);
  if (!salon) return false;

  try {
    await pool.query(
      `INSERT INTO loyalty_accounts (id, owner_id, salon_id, client_key, client_name, recipient_email, activated_at)
       VALUES (UUID(), ?, ?, ?, ?, ?, NOW())`,
      [salon.owner_id, salonId, key, name, mail]
    );
  } catch (err) {
    // Deux inscriptions simultanées du même client : la seconde trouve la carte déjà créée.
    if (err && err.code === 'ER_DUP_ENTRY') return false;
    throw err;
  }

  logActivity(salonId, 'loyalty_activate', 'Carte de fidélité activée automatiquement (création du compte client) : ' + name);

  try {
    const t = require('./loyaltyRules').thresholdsFrom(await getOwnerSettings(salon.owner_id));
    await sendLoyaltyActivation(salonId, mail, { clientName: name, serviceThreshold: t.service, productThreshold: t.product });
  } catch (err) {
    console.error('[fidélité] envoi email d\'activation échoué:', err.message);
  }
  return true;
}

module.exports = { activateOnAccountCreation };
