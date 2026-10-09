/**
 * Attribution par LIGNE des prestations et suppléments (au-delà des produits).
 *
 * Dans la caisse, chaque ligne d'un ticket peut être attribuée à un coiffeur précis (sale_items.barber_id) - par exemple
 * une prestation réalisée par Karim mais encaissée par Fathi. Les statistiques par coiffeur de prestations / suppléments
 * viennent de la file d'attente (queue.barber_id = le coiffeur du passage) : on y applique donc des TRANSFERTS pour les lignes
 * dont le vendeur est un AUTRE coiffeur que celui du passage. Rien n'est compté deux fois : ce qui est retiré à l'un est ajouté à l'autre.
 *
 * Périmètre : uniquement les ventes liées à un passage (sales.queue_id), seules à entrer dans ces statistiques de base.
 * Période : la même que les statistiques de base (queue.end_at), pour que les chiffres restent cohérents.
 */

/**
 * @param db        pool / connexion mysql2
 * @param salonId   salon
 * @param range     { fromSql, toSql (exclu) | toInclusiveSql } (fin optionnelle) ou { sinceToday: true }
 * @returns lignes { from_barber_id, from_name, to_barber_id, to_name, services_count, cents }
 */
async function serviceLineTransfers(db, salonId, range) {
  const params = [salonId];
  let when;
  if (range && range.sinceToday) {
    when = 'q.end_at >= CURDATE()';
  } else {
    when = 'q.end_at >= ?';
    params.push(range.fromSql);
    if (range.toSql) { when += ' AND q.end_at < ?'; params.push(range.toSql); }
    if (range.toInclusiveSql) { when += ' AND q.end_at <= ?'; params.push(range.toInclusiveSql); }
  }
  const [rows] = await db.query(
    `SELECT q.barber_id AS from_barber_id, fb.name AS from_name, si.barber_id AS to_barber_id, tb.name AS to_name,
            COALESCE(SUM(CASE WHEN si.item_type = 'service' THEN si.quantity ELSE 0 END), 0) AS services_count,
            COALESCE(SUM(si.unit_price_cents * si.quantity), 0) AS cents
     FROM sale_items si
     JOIN sales s ON s.id = si.sale_id
     JOIN queue q ON q.id = s.queue_id AND q.status = 'done'
     LEFT JOIN barbers fb ON fb.id = q.barber_id
     LEFT JOIN barbers tb ON tb.id = si.barber_id
     WHERE s.salon_id = ? AND si.item_type IN ('service', 'extra') AND si.barber_id IS NOT NULL
       AND (q.barber_id IS NULL OR si.barber_id <> q.barber_id) AND ${when}
     GROUP BY q.barber_id, fb.name, si.barber_id, tb.name`,
    params
  );
  return rows.map((r) => ({
    from_barber_id: r.from_barber_id, from_name: r.from_name,
    to_barber_id: r.to_barber_id, to_name: r.to_name,
    services_count: Number(r.services_count), cents: Number(r.cents)
  }));
}

/**
 * Applique les transferts à une Map barberId -> { count, cents, name } (créée au besoin).
 * count / cents : nombre de prestations et chiffre d'affaires (prestations + suppléments) du coiffeur.
 */
function applyTransfers(map, transfers) {
  const get = (id, name) => {
    if (!map.has(id)) map.set(id, { name: name || 'Non assigné', count: 0, cents: 0 });
    return map.get(id);
  };
  transfers.forEach((t) => {
    const from = get(t.from_barber_id, t.from_name);
    from.count -= t.services_count; from.cents -= t.cents;
    const to = get(t.to_barber_id, t.to_name);
    to.count += t.services_count; to.cents += t.cents;
  });
  return map;
}

module.exports = { serviceLineTransfers, applyTransfers };
