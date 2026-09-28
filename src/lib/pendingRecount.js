const { pool } = require('../db');

/**
 * Recomptage du fond de caisse en attente pour un salon, ou null.
 *
 * Règle unique, partagée par la connexion d'un coiffeur à la caisse et par
 * le rafraîchissement de la page : seule la clôture la PLUS RÉCENTE compte.
 * Une ancienne clôture jamais confirmée (test, avant la mise en place du
 * recomptage) ne doit pas faire ressurgir la popup.
 */
async function getPendingRecount(salonId) {
  const [[lastClosing]] = await pool.query(
    'SELECT id, starting_cash_cents, recount_confirmed_at FROM cash_closings WHERE salon_id = ? ORDER BY period_end DESC LIMIT 1',
    [salonId]
  );
  if (!lastClosing || lastClosing.recount_confirmed_at) return null;
  return { closing_id: lastClosing.id, expected_cents: lastClosing.starting_cash_cents };
}

module.exports = { getPendingRecount };
