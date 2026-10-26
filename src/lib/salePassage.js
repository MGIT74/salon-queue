/**
 * Encaissement groupé : une seule vente peut régler PLUSIEURS passages (un groupe de RDV, ou un client qui paie
 * pour un autre). sales.queue_id = le passage de celui qui paie ; chaque ligne garde son passage dans
 * sale_items.queue_id. Une vente « concerne » donc un passage par sales.queue_id OU par une de ses lignes.
 */
const PASSAGE_OF_LINE = 'COALESCE(si.queue_id, s.queue_id)';

/** Vente qui a réglé ce passage (ou null). */
async function saleForPassage(db, salonId, queueId) {
  const [[sale]] = await db.query(
    `SELECT s.id, s.queue_id, s.total_price_cents, s.created_at FROM sales s
     WHERE s.salon_id = ? AND (s.queue_id = ? OR s.id IN (SELECT si.sale_id FROM sale_items si WHERE si.queue_id = ?))
     ORDER BY s.created_at LIMIT 1`,
    [salonId, queueId, queueId]
  );
  return sale || null;
}

/** Nombre de passages différents réglés par une vente (1 pour une vente classique). */
async function passageCountOfSale(db, saleId) {
  const [[r]] = await db.query(
    `SELECT COUNT(DISTINCT ${PASSAGE_OF_LINE}) AS n FROM sale_items si JOIN sales s ON s.id = si.sale_id WHERE s.id = ?`,
    [saleId]
  );
  return Number(r && r.n) || 0;
}

module.exports = { PASSAGE_OF_LINE, saleForPassage, passageCountOfSale };
