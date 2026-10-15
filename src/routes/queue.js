const express = require('express');
const { thresholdsForSalon, rewardsFor } = require('../lib/loyaltyRules');
const crypto = require('crypto');
const { pool, utcIso, getSettings, parisLocalToUtcDate } = require('../db');
const { loadQueue, recompute, clientKey } = require('../lib/queueMath');
const { serviceLineTransfers, applyTransfers, salesRevenueByBarber } = require('../lib/lineAttribution');
const { promoteTodayAppointments, nowParisDatetimeString } = require('./appointments');
const requireAdmin = require('../middleware/auth');
const { verifyOwnerPassword } = require('../middleware/auth');
const requireAdminOrBarber = require('../middleware/barberAuth');
const { logActivity } = require('../lib/activityLog');
const { wrap } = require('../lib/wrap');

const router = express.Router();

/**
 * Rapproche chaque ligne de file avec un cadeau non utilisé pour ce
 * client (même clé que les notes), quel que soit son statut — utile
 * dès la file d'attente (le coiffeur sait avant même de commencer),
 * pas seulement à l'encaissement.
 */
async function attachGiftInfo(rows, salonId) {
  // Trié du plus ancien au plus récent : si un même client a
  // malencontreusement plusieurs cadeaux non utilisés (tests répétés,
  // ou vrais cadeaux multiples), c'est le PLUS ANCIEN qui doit sortir
  // en premier — sans ce tri, l'ordre de retour SQL n'est pas garanti
  // et pouvait faire ressortir n'importe lequel au hasard.
  const [gifts] = await pool.query(
    'SELECT * FROM gift_cards WHERE salon_id = ? AND used_at IS NULL AND voided_at IS NULL ORDER BY created_at ASC', [salonId]
  );
  if (!gifts.length) return rows;
  const giftById = {};
  const giftByKey = {};
  gifts.forEach((g) => {
    giftById[g.id] = g;
    const key = clientKey({ email: g.recipient_email, phone: g.recipient_phone, client_name: g.recipient_name });
    // Ne jamais écraser un cadeau déjà trouvé pour cette clé : le
    // premier de la boucle (donc le plus ancien, grâce au tri) reste.
    if (key && !giftByKey[key]) giftByKey[key] = g;
  });
  const toGiftPayload = (gift, explicit) => {
    let items = [];
    try { items = JSON.parse(gift.items_json || '[]'); } catch (e) { items = []; }
    return { id: gift.id, amount_cents: gift.amount_cents, items, explicit: explicit };
  };
  return rows.map((r) => {
    // Lien EXPLICITE (le client a lui-même indiqué vouloir utiliser CE
    // cadeau en le réservant avec son code) - prioritaire : cette venue
    // EST la venue prévue pour le récupérer.
    if (r.gift_card_id && giftById[r.gift_card_id]) {
      return Object.assign({}, r, { gift_card: toGiftPayload(giftById[r.gift_card_id], true) });
    }
    // Sinon, simple rapprochement par identité : ce client a AUSSI un
    // cadeau non réclamé qui traîne, mais rien n'indique qu'il vient
    // pour ça aujourd'hui - à traiter comme un rappel informatif, pas
    // comme l'objet de cette visite.
    const key = clientKey(r);
    const gift = key ? giftByKey[key] : null;
    if (!gift) return r;
    return Object.assign({}, r, { gift_card: toGiftPayload(gift, false) });
  });
}

// --- Public : état de la file (du salon résolu) --------------------------
router.get('/', wrap(async (req, res) => {
  await promoteTodayAppointments(req.salon.id);
  await recompute(req.salon.id);
  // include_done=1 : utilise par la frise de l'Agenda pour placer les
  // clients sans RDV deja termines aujourd'hui - la file, par defaut,
  // n'expose que ce qui reste actionnable (attente/en cours).
  const statuses = req.query.include_done === '1' ? ['waiting', 'in_progress', 'done'] : undefined;
  let rows = await loadQueue(req.salon.id, statuses);
  rows = await attachGiftInfo(rows, req.salon.id);
  rows.sort((a, b) => {
    if (a.status !== b.status) return a.status === 'in_progress' ? -1 : 1;
    return (a.position || 0) - (b.position || 0);
  });

  // Cette route n'exige pas d'authentification (le kiosque et l'écran
  // d'affichage en salle l'utilisent sans mot de passe) - mais renvoyait
  // jusqu'ici l'email et le téléphone de CHAQUE client de la file à
  // QUICONQUE l'appelle, authentifié ou non (aucune de ces deux pages
  // n'affiche ces champs, ils ne servaient donc qu'à fuiter). Ne les
  // inclut désormais que si l'appelant est un admin authentifié
  // (dashboard.html envoie toujours ce mot de passe) - sans bloquer la
  // requête dans le cas contraire, juste sans ces deux champs.
  const given = req.get('X-Admin-Password') || '';
  const isAdmin = given && await verifyOwnerPassword(req.salon, given);
  if (!isAdmin) {
    rows = rows.map((r) => {
      const { email, phone, ...rest } = r;
      return rest;
    });
  }

  res.json({ ok: true, queue: rows });
}));

/**
 * Coupes terminées mais pas encore encaissées, pour la caisse. Scopé au
 * coiffeur connecté par PIN (chacun encaisse ses propres clients, dans
 * l'ordre) — un admin voit tout le monde. Les encaissements "mis de
 * côté" (client parti chercher sa carte, urgence...) sont relégués à la
 * fin de la liste, pour ne jamais bloquer les suivants.
 */
/**
 * Client réglé d'AVANCE puis coupe terminée : on compare ce qui est fait (prestation + suppléments actuels)
 * à ce qui a déjà été encaissé (lignes prestation/supplément des ventes rattachées à ce passage).
 * - rien de plus : le passage est soldé (balance_paid_at posé), il disparaît de la liste ;
 * - un supplément ajouté entre-temps : le passage reste dans la liste avec balance_lines (le reste à payer).
 */
async function withPrepaidBalance(rows) {
  const prepaid = rows.filter((r) => r.prepaid_at);
  if (!prepaid.length) return rows;
  const [paidLines] = await pool.query(
    `SELECT s.queue_id, si.item_type, si.item_id, si.unit_price_cents, si.quantity FROM sales s
     JOIN sale_items si ON si.sale_id = s.id
     WHERE s.queue_id IN (?) AND si.item_type IN ('service', 'extra')`,
    [prepaid.map((r) => r.id)]
  );
  const settled = [];
  const out = rows.map((r) => {
    if (!r.prepaid_at) return r;
    const mine = paidLines.filter((l) => l.queue_id === r.id);
    const lines = [];
    const paidServiceIds = mine.filter((l) => l.item_type === 'service').map((l) => l.item_id);
    if (r.service && r.service.id && !paidServiceIds.includes(r.service.id)) {
      // Prestation changée après le paiement : seule la différence (si plus chère) reste due.
      const paidSvc = mine.filter((l) => l.item_type === 'service').reduce((a, l) => a + l.unit_price_cents * l.quantity, 0);
      const diff = (r.service.price_cents || 0) - paidSvc;
      if (diff > 0) lines.push({ item_type: 'service', item_id: r.service.id, item_name: r.service.name + ' (complément)', unit_price_cents: diff, quantity: 1 });
    }
    const paidExtraCount = {};
    mine.filter((l) => l.item_type === 'extra').forEach((l) => { paidExtraCount[l.item_id] = (paidExtraCount[l.item_id] || 0) + l.quantity; });
    (r.extras || []).forEach((e) => {
      if (paidExtraCount[e.id] > 0) { paidExtraCount[e.id]--; return; }
      lines.push({ item_type: 'extra', item_id: e.id, item_name: e.name, unit_price_cents: e.price_cents || 0, quantity: 1 });
    });
    const due = lines.reduce((a, l) => a + l.unit_price_cents * l.quantity, 0);
    if (due <= 0) { settled.push(r.id); return null; }
    return Object.assign({}, r, { prepaid: true, balance_lines: lines, balance_due_cents: due });
  }).filter(Boolean);
  if (settled.length) {
    await pool.query('UPDATE queue SET balance_paid_at = NOW() WHERE id IN (?) AND balance_paid_at IS NULL', [settled]);
  }
  return out;
}

router.get('/pending-payment', requireAdminOrBarber, wrap(async (req, res) => {
  let rows = await loadQueue(req.salon.id, ['done'], 'pending');
  rows = await withPrepaidBalance(rows);
  if (req.actingBarberId) rows = rows.filter((r) => r.barber_id === req.actingBarberId);
  rows = await attachGiftInfo(rows, req.salon.id);

  // Fidélité : cumulée au niveau du SALON, pas de toute l'enseigne -
  // un client vu ici n'a de points que ceux gagnés dans CE salon.
  // Un client sans compte ACTIVÉ n'est pas encore membre : la caisse
  // doit proposer d'activer sa carte (avec son accord), pas afficher
  // une récompense qui n'existe pas.
  const [loyaltyRows] = await pool.query(
    'SELECT client_key, points, activated_at FROM loyalty_accounts WHERE salon_id = ? AND activated_at IS NOT NULL',
    [req.salon.id]
  );
  const loyaltyByKey = {};
  loyaltyRows.forEach((l) => { loyaltyByKey[l.client_key] = l.points; });
  const loyaltyT = await thresholdsForSalon(req.salon.id);

  rows = rows.map((r) => {
    const key = clientKey(r);
    const activated = key ? Object.prototype.hasOwnProperty.call(loyaltyByKey, key) : false;
    const extra = { loyalty_member: activated };
    if (activated) {
      // Remises débloquées, chacune par son propre palier de points.
      const r = rewardsFor(loyaltyByKey[key], loyaltyT);
      extra.loyalty_points = loyaltyByKey[key];
      if (r.service || r.product) extra.loyalty_rewards = r;
    }
    return Object.assign({}, r, extra);
  });

  rows.sort((a, b) => {
    const aDef = Boolean(a.payment_deferred_at), bDef = Boolean(b.payment_deferred_at);
    if (aDef !== bDef) return aDef ? 1 : -1;
    return new Date(a.end_at || a.checkin_at) - new Date(b.end_at || b.checkin_at);
  });
  res.json({ ok: true, items: rows.map((r) => Object.assign({}, r, { deferred: Boolean(r.payment_deferred_at) })) });
}));

/**
 * Met de côté (ou reprend) un encaissement en attente — sans le perdre
 * ni bloquer le client suivant. Même vérification de propriété que le
 * reste (son propre client, ou non-assigné).
 */
router.post('/:id/defer-payment', requireAdminOrBarber, wrap(async (req, res) => {
  const [[row]] = await pool.query(
    'SELECT barber_id, status, paid_at, prepaid_at, balance_paid_at, payment_deferred_at FROM queue WHERE id = ? AND salon_id = ?',
    [req.params.id, req.salon.id]
  );
  if (!row) return res.status(404).json({ error: 'Client introuvable' });
  if (req.actingBarberId && row.barber_id && row.barber_id !== req.actingBarberId) {
    return res.status(403).json({ error: "Ce n'est pas votre client." });
  }
  if (row.paid_at && !(row.prepaid_at && !row.balance_paid_at)) return res.status(409).json({ error: 'Ce client a déjà été encaissé.' });

  const newValue = row.payment_deferred_at ? null : new Date();
  await pool.query('UPDATE queue SET payment_deferred_at = ? WHERE id = ?', [newValue, req.params.id]);
  res.json({ ok: true, deferred: Boolean(newValue) });
}));

// --- Ajout manuel d'un client (admin uniquement, pas de check-in physique) ---
router.post('/manual-client', requireAdmin, wrap(async (req, res) => {
  const { client_name, email, phone, service_id } = req.body;
  if (!client_name || !String(client_name).trim()) return res.status(400).json({ error: 'Le nom est requis' });

  let totalPriceCents = null;
  let totalDurationMin = null;
  if (service_id) {
    const [[svc]] = await pool.query(
      'SELECT price_cents, duration_min FROM services WHERE id = ? AND salon_id = ?', [service_id, req.salon.id]
    );
    if (!svc) return res.status(404).json({ error: 'Prestation introuvable' });
    totalPriceCents = svc.price_cents;
    totalDurationMin = svc.duration_min;
  }

  const id = crypto.randomUUID();
  await pool.query(
    `INSERT INTO queue (id, salon_id, client_name, email, phone, service_id, status, checkin_at, start_at, end_at, total_price_cents, total_duration_min)
     VALUES (?, ?, ?, ?, ?, ?, 'done', NOW(), NOW(), NOW(), ?, ?)`,
    [id, req.salon.id, String(client_name).trim(), email || null, phone || null, service_id || null, totalPriceCents, totalDurationMin]
  );
  // req.body.source === 'csv_import' : appelé en boucle par l'import CSV
  // (voir /manual-client/import-log plus bas) - une ligne de journal par
  // client noierait le journal, un seul résumé suffit pour tout le lot.
  if (req.body.source !== 'csv_import') {
    logActivity(req.salon.id, 'client_manual_add', 'Client "' + String(client_name).trim() + '" ajouté manuellement');
  }
  res.json({ ok: true, id });
}));

/**
 * Import CSV en lot : un seul appel pour jusqu'à 500 clients (au lieu d'un
 * appel par client, qui échouait en silence sur les gros fichiers). Les
 * doublons (même nom + email + téléphone déjà présents dans le salon, ou
 * répétés dans le lot) sont ignorés, donc relancer un import déjà passé
 * en partie ne recrée pas les fiches existantes.
 */
router.post('/manual-client/bulk', requireAdmin, wrap(async (req, res) => {
  const list = Array.isArray(req.body.clients) ? req.body.clients : [];
  if (list.length === 0) return res.status(400).json({ error: 'Aucun client à importer' });
  if (list.length > 500) return res.status(400).json({ error: 'Maximum 500 clients par lot' });

  const norm = (v) => String(v || '').trim().toLowerCase();
  const keyOf = (n, e, t) => norm(n) + '|' + norm(e) + '|' + String(t || '').replace(/\s+/g, '');

  const [existing] = await pool.query(
    'SELECT client_name, email, phone FROM queue WHERE salon_id = ?', [req.salon.id]
  );
  const seen = new Set(existing.map((r) => keyOf(r.client_name, r.email, r.phone)));

  const values = [];
  let skipped = 0;
  for (const c of list) {
    const name = String((c && c.name) || '').trim().slice(0, 255);
    if (!name) { skipped++; continue; }
    const email = String((c && c.email) || '').trim().slice(0, 255) || null;
    const phone = String((c && c.phone) || '').trim().slice(0, 50) || null;
    const k = keyOf(name, email, phone);
    if (seen.has(k)) { skipped++; continue; }
    seen.add(k);
    values.push([crypto.randomUUID(), req.salon.id, name, email, phone]);
  }
  if (values.length) {
    await pool.query(
      "INSERT INTO queue (id, salon_id, client_name, email, phone, status, checkin_at, start_at, end_at) VALUES " +
      values.map(() => "(?, ?, ?, ?, ?, 'done', NOW(), NOW(), NOW())").join(', '),
      values.flat()
    );
  }
  res.json({ ok: true, inserted: values.length, skipped });
}));

/**
 * Résumé unique après un import CSV (voir importClientsCsv côté
 * dashboard) : évite une ligne de journal par client importé.
 */
router.post('/manual-client/import-log', requireAdmin, wrap(async (req, res) => {
  const count = Number(req.body.count) || 0;
  if (count > 0) {
    logActivity(req.salon.id, 'client_csv_import', count + ' client' + (count > 1 ? 's' : '') + ' importé' + (count > 1 ? 's' : '') + ' depuis un fichier CSV');
  }
  res.json({ ok: true });
}));

// --- Public : check-in à la borne ---------------------------------------
router.post('/checkin', wrap(async (req, res) => {
  const { client_name, email, phone, service_id, barber_id, extras } = req.body;
  if (!client_name) return res.status(400).json({ error: 'Le nom est requis' });
  if (!service_id) return res.status(400).json({ error: 'La prestation est requise' });

  // Un même cadeau ne peut pas servir à créer plusieurs entrées actives
  // à la fois dans la file (le code ne marque rien comme "utilisé" tant
  // que le passage n'est pas réellement encaissé) — sans ce garde-fou,
  // un même code pouvait être réutilisé un nombre illimité de fois
  // avant ce moment-là.
  const key = clientKey({ email, phone, client_name });
  if (key) {
    const [[unusedGift]] = await pool.query(
      'SELECT id FROM gift_cards WHERE salon_id = ? AND used_at IS NULL AND voided_at IS NULL AND ' +
      '(recipient_email = ? OR recipient_phone = ? OR recipient_name = ?) LIMIT 1',
      [req.salon.id, email || '', phone || '', client_name]
    );
    if (unusedGift) {
      const [existingRows] = await pool.query(
        `SELECT id, client_name, email, phone FROM queue
         WHERE salon_id = ? AND (status IN ('waiting','in_progress') OR (status = 'done' AND paid_at IS NULL))`,
        [req.salon.id]
      );
      const alreadyActive = existingRows.some((r) => clientKey(r) === key);
      if (alreadyActive) {
        return res.status(409).json({
          error: 'Ce cadeau est déjà utilisé pour une visite en cours — impossible de le réutiliser tant que celle-ci n\'est pas terminée.'
        });
      }
    }
  }

  const id = crypto.randomUUID();

  // Le coiffeur choisi (si précisé) doit appartenir à CE salon - même
  // protection que pour les RDV (appointments.js), sinon un barber_id
  // d'un autre salon (deviné/connu) était accepté tel quel.
  let checkinBarberId = barber_id || null;
  if (checkinBarberId) {
    const [[ownedBarber]] = await pool.query(
      'SELECT id FROM barbers WHERE id = ? AND salon_id = ? AND active = 1', [checkinBarberId, req.salon.id]
    );
    if (!ownedBarber) return res.status(404).json({ error: 'Coiffeur introuvable' });
  }

  await pool.query(
    `INSERT INTO queue (id, salon_id, client_name, email, phone, service_id, barber_id, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'waiting')`,
    [id, req.salon.id, client_name, email || null, phone || null, service_id, checkinBarberId]
  );
  if (Array.isArray(extras) && extras.length) {
    const values = extras.map((extraId) => [id, extraId]);
    await pool.query('INSERT INTO queue_extras (queue_id, extra_id) VALUES ?', [values]);
  }

  // Synchronise avec l'agenda "Rendez-vous" : un client venu sans RDV
  // (check-in direct à la borne) apparaît aussi dans le calendrier, à
  // l'heure présente, déjà "promu" (promoted_queue_id posé tout de
  // suite) — les deux vues restent cohérentes sans double entrée ni
  // promotion ultérieure. Pas d'email de confirmation ici : le client
  // est déjà physiquement au salon.
  const apptId = crypto.randomUUID();
  try {
    // scheduled_at est toujours exprimé en heure de salon (réglable),
    // jamais en UTC — comme pour un RDV pris en ligne. Utiliser NOW() ici
    // stockerait l'heure serveur (UTC) dans une colonne "heure locale",
    // et l'agenda (qui affiche scheduled_at tel quel, sans conversion)
    // se déciderait alors avec un décalage selon le fuseau du salon.
    const settings = await getSettings(req.salon.id);
    await pool.query(
      `INSERT INTO appointments (id, salon_id, barber_id, client_name, email, phone, service_id, scheduled_at, status, promoted_queue_id, source)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'confirmed', ?, 'walkin')`,
      [apptId, req.salon.id, checkinBarberId, client_name, email || null, phone || null, service_id, nowParisDatetimeString(settings.timezone), id]
    );
    if (Array.isArray(extras) && extras.length) {
      await pool.query(
        'INSERT INTO appointment_extras (appointment_id, extra_id) VALUES ?',
        [extras.map((extraId) => [apptId, extraId])]
      );
    }
  } catch (err) {
    // La file d'attente ne doit jamais échouer à cause de l'agenda —
    // on journalise et on continue, le check-in reste prioritaire.
    console.error('[checkin] synchronisation agenda échouée:', err.message);
  }

  await recompute(req.salon.id);

  const rows = await loadQueue(req.salon.id);
  const me = rows.find((r) => r.id === id);
  res.json({ ok: true, entry: me });
}));

// --- Coiffeur : démarrer, terminer, annuler ------------------------------
router.post('/:id/start', requireAdminOrBarber, wrap(async (req, res) => {
  const [[row]] = await pool.query(
    'SELECT id, barber_id, checkin_at FROM queue WHERE id = ? AND salon_id = ?',
    [req.params.id, req.salon.id]
  );
  if (!row) return res.status(404).json({ error: 'Client introuvable' });

  // Un coiffeur connecté par PIN (pas admin) ne peut agir qu'au nom du
  // coiffeur actif (bulle sélectionnée - lui-même par défaut), et
  // seulement sur un client déjà assigné à ce coiffeur ou non-assigné —
  // jamais démarrer le client de quelqu'un d'autre.
  if (req.actingBarberId) {
    if (row.barber_id && row.barber_id !== req.actingBarberId) {
      return res.status(403).json({ error: 'Ce client attend un autre coiffeur.' });
    }
  }

  const barberId = req.actingBarberId || req.body.barber_id || row.barber_id || null;

  if (barberId) {
    const [[busy]] = await pool.query(
      "SELECT id, client_name FROM queue WHERE barber_id = ? AND salon_id = ? AND status = 'in_progress' LIMIT 1",
      [barberId, req.salon.id]
    );
    if (busy) {
      return res.status(409).json({
        error: 'Ce coiffeur a déjà une coupe en cours (' + busy.client_name + ').'
      });
    }

    // Respect de l'ordre d'arrivée : un client arrivé avant, éligible au
    // même coiffeur (non-assigné ou assigné à lui), doit être pris en
    // premier — sauf s'il attend spécifiquement quelqu'un d'autre, ou
    // si c'est un transfert manuel décidé par le staff (force_transfer,
    // réservé à l'admin — un coiffeur seul via son PIN ne peut pas
    // s'auto-attribuer ce contournement).
    if (!(req.body.force_transfer && !req.barberId)) {
      const [[earlier]] = await pool.query(
        `SELECT client_name FROM queue
         WHERE salon_id = ? AND status = 'waiting' AND id != ? AND checkin_at < ?
         AND (barber_id IS NULL OR barber_id = ?)
         ORDER BY checkin_at ASC LIMIT 1`,
        [req.salon.id, req.params.id, row.checkin_at, barberId]
      );
      if (earlier) {
        return res.status(409).json({
          error: earlier.client_name + ' est arrivé avant et doit être pris en premier.'
        });
      }
    }
  }

  await pool.query(
    "UPDATE queue SET status = 'in_progress', start_at = NOW(), barber_id = COALESCE(?, barber_id) WHERE id = ? AND salon_id = ?",
    [barberId, req.params.id, req.salon.id]
  );
  // Répercute le coiffeur finalement retenu sur l'entrée d'agenda liée
  // (walk-in synchronisé, ou RDV "premier disponible" promu), pour que
  // le calendrier affiche le bon nom dès que la coupe démarre.
  if (barberId) {
    await pool.query(
      'UPDATE appointments SET barber_id = COALESCE(barber_id, ?) WHERE promoted_queue_id = ?',
      [barberId, req.params.id]
    );
  }
  await recompute(req.salon.id);
  res.json({ ok: true });
}));

/**
 * Pour un coiffeur avec le Timer désactivé : passe directement de
 * "en attente" à "terminé" (prêt à encaisser), sans passer par "en
 * cours" - pas de start_at pose, donc pas de duree "reelle" suivie
 * pour ce client (le classement 'Rapidite' du Dashboard exclut deja
 * les lignes sans start_at, donc aucune fausse duree quasi-nulle n'y
 * apparait). Meme respect de l'ordre d'arrivee que /start.
 */
router.post('/:id/quick-finish', requireAdminOrBarber, wrap(async (req, res) => {
  const [[row]] = await pool.query(
    'SELECT id, barber_id, checkin_at FROM queue WHERE id = ? AND salon_id = ?',
    [req.params.id, req.salon.id]
  );
  if (!row) return res.status(404).json({ error: 'Client introuvable' });

  if (req.actingBarberId) {
    if (row.barber_id && row.barber_id !== req.actingBarberId) {
      return res.status(403).json({ error: 'Ce client attend un autre coiffeur.' });
    }
  }
  const barberId = req.actingBarberId || req.body.barber_id || row.barber_id || null;

  if (barberId && !(req.body.force_transfer && !req.barberId)) {
    const [[earlier]] = await pool.query(
      `SELECT client_name FROM queue
       WHERE salon_id = ? AND status = 'waiting' AND id != ? AND checkin_at < ?
       AND (barber_id IS NULL OR barber_id = ?)
       ORDER BY checkin_at ASC LIMIT 1`,
      [req.salon.id, req.params.id, row.checkin_at, barberId]
    );
    if (earlier) {
      return res.status(409).json({
        error: earlier.client_name + ' est arrivé avant et doit être pris en premier.'
      });
    }
  }

  await pool.query(
    "UPDATE queue SET status = 'done', end_at = NOW(), barber_id = COALESCE(?, barber_id) WHERE id = ? AND salon_id = ?",
    [barberId, req.params.id, req.salon.id]
  );
  if (barberId) {
    await pool.query(
      'UPDATE appointments SET barber_id = COALESCE(barber_id, ?) WHERE promoted_queue_id = ?',
      [barberId, req.params.id]
    );
  }
  await recompute(req.salon.id);
  res.json({ ok: true });
}));

router.post('/:id/finish', requireAdminOrBarber, wrap(async (req, res) => {
  if (req.actingBarberId) {
    const [[row]] = await pool.query(
      'SELECT barber_id FROM queue WHERE id = ? AND salon_id = ?',
      [req.params.id, req.salon.id]
    );
    if (!row) return res.status(404).json({ error: 'Client introuvable' });
    if (row.barber_id !== req.actingBarberId) {
      return res.status(403).json({ error: "Ce n'est pas votre client en cours." });
    }
  }
  await pool.query(
    "UPDATE queue SET status = 'done', end_at = NOW() WHERE id = ? AND salon_id = ?",
    [req.params.id, req.salon.id]
  );
  await recompute(req.salon.id);
  res.json({ ok: true });
}));

router.post('/:id/cancel', requireAdminOrBarber, wrap(async (req, res) => {
  if (req.actingBarberId) {
    const [[row]] = await pool.query(
      'SELECT barber_id FROM queue WHERE id = ? AND salon_id = ?',
      [req.params.id, req.salon.id]
    );
    if (!row) return res.status(404).json({ error: 'Client introuvable' });
    if (row.barber_id && row.barber_id !== req.actingBarberId) {
      return res.status(403).json({ error: "Ce n'est pas votre client." });
    }
  }
  await pool.query(
    "UPDATE queue SET status = 'cancelled' WHERE id = ? AND salon_id = ?",
    [req.params.id, req.salon.id]
  );
  await recompute(req.salon.id);
  res.json({ ok: true });
}));

// --- Coiffeur : modifier prestation et suppléments en cours de route -----
router.put('/:id', requireAdminOrBarber, wrap(async (req, res) => {
  const [[existing]] = await pool.query(
    'SELECT barber_id, status, client_name, email, phone FROM queue WHERE id = ? AND salon_id = ?',
    [req.params.id, req.salon.id]
  );
  if (!existing) return res.status(404).json({ error: 'Client introuvable' });

  if (req.actingBarberId && existing.barber_id !== req.actingBarberId) {
    return res.status(403).json({ error: "Ce n'est pas votre client." });
  }

  const { service_id, extras, barber_id, client_name, email, phone } = req.body;

  // Un coiffeur ne peut pas ajouter un supplément à une coupe EN COURS
  // s'il y a déjà quelqu'un qui attend son tour derrière lui — ça le
  // retarderait sans qu'il le sache à l'avance. On ne bloque que
  // l'AJOUT (la liste s'agrandit), pas le retrait d'un supplément.
  if (req.actingBarberId && Array.isArray(extras) && existing.status === 'in_progress') {
    const [[{ n: currentExtrasCount }]] = await pool.query(
      'SELECT COUNT(*) AS n FROM queue_extras WHERE queue_id = ?', [req.params.id]
    );
    if (extras.length > currentExtrasCount) {
      const [[nextWaiting]] = await pool.query(
        `SELECT id FROM queue WHERE salon_id = ? AND status = 'waiting'
         AND (barber_id IS NULL OR barber_id = ?) LIMIT 1`,
        [req.salon.id, req.actingBarberId]
      );
      if (nextWaiting) {
        return res.status(409).json({
          error: 'Un client attend déjà son tour — ajouter un supplément le retarderait.'
        });
      }
    }
  }

  const sets = [];
  const params = [];
  if (service_id) { sets.push('service_id = ?'); params.push(service_id); }
  if (barber_id !== undefined && !req.barberId) {
    if (barber_id) {
      // Le coiffeur choisi doit appartenir à CE salon - même protection
      // que pour les RDV et le check-in kiosk.
      const [[ownedBarber]] = await pool.query(
        'SELECT id FROM barbers WHERE id = ? AND salon_id = ? AND active = 1', [barber_id, req.salon.id]
      );
      if (!ownedBarber) return res.status(404).json({ error: 'Coiffeur introuvable' });
    }
    sets.push('barber_id = ?'); params.push(barber_id || null);
  }

  // Coordonnées du client (nom/email/téléphone) : réservé à l'admin
  // (pas au coiffeur, qui n'a de toute façon accès qu'à ses propres
  // clients via req.barberId), édition ponctuelle depuis la fiche
  // client (ex: coquille dans l'email, numéro corrigé).
  if (!req.barberId) {
    if (client_name !== undefined && String(client_name).trim()) { sets.push('client_name = ?'); params.push(String(client_name).trim()); }
    if (email !== undefined) { sets.push('email = ?'); params.push(email ? String(email).trim() : null); }
    if (phone !== undefined) { sets.push('phone = ?'); params.push(phone ? String(phone).trim() : null); }
  }

  if (sets.length) {
    params.push(req.params.id, req.salon.id);
    await pool.query(`UPDATE queue SET ${sets.join(', ')} WHERE id = ? AND salon_id = ?`, params);
  }

  if (Array.isArray(extras)) {
    await pool.query('DELETE FROM queue_extras WHERE queue_id = ?', [req.params.id]);
    if (extras.length) {
      const values = extras.map((extraId) => [req.params.id, extraId]);
      await pool.query('INSERT INTO queue_extras (queue_id, extra_id) VALUES ?', [values]);
    }
  }

  // Répercute les mêmes changements sur l'entrée d'agenda liée (si elle
  // existe), pour qu'un changement de prestation/suppléments en cours de
  // route reste visible et exact dans le calendrier Rendez-vous.
  const [[linkedAppt]] = await pool.query(
    'SELECT id FROM appointments WHERE promoted_queue_id = ?', [req.params.id]
  );
  if (linkedAppt) {
    if (service_id) {
      await pool.query('UPDATE appointments SET service_id = ? WHERE id = ?', [service_id, linkedAppt.id]);
    }
    if (Array.isArray(extras)) {
      await pool.query('DELETE FROM appointment_extras WHERE appointment_id = ?', [linkedAppt.id]);
      if (extras.length) {
        await pool.query(
          'INSERT INTO appointment_extras (appointment_id, extra_id) VALUES ?',
          [extras.map((extraId) => [linkedAppt.id, extraId])]
        );
      }
    }
  }

  await recompute(req.salon.id);
  res.json({ ok: true });
}));

// --- Chiffre d'affaires du jour -------------------------------------------
/**
 * Jours du SALON (fuseau réglé), pas jours UTC : CURDATE() de la base coupait la journée à 2h du matin
 * (heure de Paris), et l'« encaissé aujourd'hui » ne correspondait pas au Z. Renvoie le début (UTC, format
 * des colonnes created_at / end_at) du jour du salon décalé de `offset` jours, et la date du salon.
 */
async function salonDays(salonId) {
  const tz = (await getSettings(salonId)).timezone || 'Europe/Paris';
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
  const today = fmt.format(new Date());
  const shift = (n) => { const d = new Date(today + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const startSql = (n) => parisLocalToUtcDate(shift(n), '00:00:00', tz).toISOString().slice(0, 19).replace('T', ' ');
  const dayOf = (utcSql) => fmt.format(new Date(String(utcSql).replace(' ', 'T') + 'Z'));
  return { tz, today, shift, startSql, dayOf };
}

// Encaissé aujourd'hui = TOUTES les ventes de la caisse du jour (passages, tickets de comptoir, produits,
// cadeaux vendus) - exactement ce que compte le ticket Z - et plus seulement les passages de la file.
router.get('/stats/today', requireAdmin, wrap(async (req, res) => {
  const d = await salonDays(req.salon.id);
  const [[sold]] = await pool.query(
    'SELECT COALESCE(SUM(total_price_cents), 0) AS revenue_cents, COUNT(*) AS sales_count FROM sales WHERE salon_id = ? AND created_at >= ?',
    [req.salon.id, d.startSql(0)]
  );
  const [[row]] = await pool.query(
    "SELECT COUNT(*) AS done_count FROM queue WHERE salon_id = ? AND status = 'done' AND end_at >= ?",
    [req.salon.id, d.startSql(0)]
  );
  res.json({ ok: true, done: Number(row.done_count), revenue_cents: Number(sold.revenue_cents), sales_count: Number(sold.sales_count) });
}));

/**
 * Pour l'onglet Dashboard : CA + nombre de prestations terminées par
 * jour sur les 7 derniers jours (pour le graphique en barres), et le
 * coiffeur ayant généré le plus de CA aujourd'hui (pour la carte
 * "profil"). Un seul appel plutôt que plusieurs, pour un chargement
 * rapide de la page d'accueil.
 */
router.get('/stats/week', requireAdmin, wrap(async (req, res) => {
  // CA par jour (7 derniers jours du salon) = toutes les ventes de la caisse ; passages = file d'attente.
  const sd = await salonDays(req.salon.id);
  const todaySql = sd.startSql(0);
  const byDay = {};
  for (let i = 6; i >= 0; i--) byDay[sd.shift(-i)] = { date: sd.shift(-i), revenue_cents: 0, done_count: 0 };
  const [saleRows] = await pool.query('SELECT created_at, total_price_cents FROM sales WHERE salon_id = ? AND created_at >= ?', [req.salon.id, sd.startSql(-6)]);
  saleRows.forEach((r) => { const k = sd.dayOf(r.created_at); if (byDay[k]) byDay[k].revenue_cents += Number(r.total_price_cents) || 0; });
  const [doneRows] = await pool.query("SELECT end_at FROM queue WHERE salon_id = ? AND status = 'done' AND end_at >= ?", [req.salon.id, sd.startSql(-6)]);
  doneRows.forEach((r) => { const k = sd.dayOf(r.end_at); if (byDay[k]) byDay[k].done_count += 1; });
  const days = Object.values(byDay);

  const [byRevenueAll] = await pool.query(
    `SELECT b.id, b.name, b.photo_url, COALESCE(SUM(q.total_price_cents), 0) AS revenue_cents, COUNT(*) AS done_count
     FROM queue q JOIN barbers b ON b.id = q.barber_id
     WHERE q.salon_id = ? AND q.status = 'done' AND q.end_at >= ?
     GROUP BY b.id ORDER BY revenue_cents DESC`,
    [req.salon.id, todaySql]
  );
  // Lignes de ticket attribuees a un autre coiffeur que celui du passage (voir lineAttribution.js), puis top 3.
  const revMap = new Map();
  byRevenueAll.forEach((r) => revMap.set(r.id, { name: r.name, photo_url: r.photo_url, count: Number(r.done_count), cents: Number(r.revenue_cents) }));
  applyTransfers(revMap, await serviceLineTransfers(pool, req.salon.id, { fromSql: todaySql }));
  const [photoRows] = await pool.query('SELECT id, name, photo_url FROM barbers WHERE salon_id = ?', [req.salon.id]);
  const photoById = Object.fromEntries(photoRows.map((b) => [b.id, b]));
  // Classement par chiffre d'affaires ENCAISSÉ au nom de chaque coiffeur : prestations + suppléments + produits,
  // ligne par ligne, depuis les ventes de la caisse (passages de la file ou ventes de comptoir). Le nombre de
  // passages reste celui de la file.
  const soldMap = await salesRevenueByBarber(pool, req.salon.id, { fromSql: todaySql });
  const ids = new Set([...revMap.keys(), ...soldMap.keys()]);
  const byRevenue = [...ids]
    .filter((id) => id && photoById[id])
    .map((id) => {
      const sold = soldMap.get(id);
      const q = revMap.get(id);
      return {
        id, name: photoById[id].name, photo_url: photoById[id].photo_url,
        revenue_cents: sold ? sold.service_cents + sold.product_cents : 0,
        done_count: Math.max(0, q ? q.count : 0)
      };
    })
    .filter((r) => r.done_count > 0 || r.revenue_cents > 0)
    .sort((a, b) => b.revenue_cents - a.revenue_cents)
    .slice(0, 3);

  // Vitesse : duree REELLE (start_at -> end_at), pas la duree prevue au
  // catalogue - c'est la vraie rapidite d'execution qui nous interesse
  // ici. Plus la moyenne est basse, plus le coiffeur est rapide.
  const [bySpeed] = await pool.query(
    `SELECT b.id, b.name, b.photo_url, AVG(TIMESTAMPDIFF(MINUTE, q.start_at, q.end_at)) AS avg_minutes, COUNT(*) AS done_count
     FROM queue q JOIN barbers b ON b.id = q.barber_id
     WHERE q.salon_id = ? AND q.status = 'done' AND q.end_at >= ? AND q.start_at IS NOT NULL
     GROUP BY b.id ORDER BY avg_minutes ASC LIMIT 3`,
    [req.salon.id, todaySql]
  );

  // Ventes de produits : attribuees a sale_items.barber_id (qui coiffeur a
  // fait la vente au moment du ticket), avec repli sur sales.barber_id
  // pour les tickets plus anciens d'avant l'ajout de cette colonne.
  const [byProducts] = await pool.query(
    `SELECT b.id, b.name, b.photo_url,
            COALESCE(SUM(si.unit_price_cents * si.quantity), 0) AS product_revenue_cents,
            COALESCE(SUM(si.quantity), 0) AS product_count
     FROM sale_items si
     JOIN sales s ON s.id = si.sale_id
     JOIN barbers b ON b.id = COALESCE(si.barber_id, s.barber_id)
     WHERE s.salon_id = ? AND si.item_type = 'product' AND s.created_at >= ?
     GROUP BY b.id ORDER BY product_revenue_cents DESC LIMIT 3`,
    [req.salon.id, todaySql]
  );

  res.json({
    ok: true,
    days: days,
    leaderboard: {
      by_revenue: byRevenue.map((r) => ({
        id: r.id, name: r.name, photo_url: r.photo_url,
        revenue_cents: Number(r.revenue_cents), done_count: Number(r.done_count)
      })),
      by_speed: bySpeed.map((r) => ({
        id: r.id, name: r.name, photo_url: r.photo_url,
        avg_minutes: Math.round(Number(r.avg_minutes)), done_count: Number(r.done_count)
      })),
      by_products: byProducts.map((r) => ({
        id: r.id, name: r.name, photo_url: r.photo_url,
        product_revenue_cents: Number(r.product_revenue_cents), product_count: Number(r.product_count)
      }))
    }
  });
}));

// --- Coiffeur : historique complet des clients (tous statuts) -----------
router.get('/history', requireAdmin, wrap(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const perPage = Math.min(100, Math.max(1, parseInt(req.query.per_page, 10) || 25));
  const offset = (page - 1) * perPage;

  const conditions = ['q.salon_id = ?'];
  const params = [req.salon.id];

  if (req.query.date_from) {
    conditions.push('q.checkin_at >= ?');
    params.push(req.query.date_from + ' 00:00:00');
  }
  if (req.query.date_to) {
    conditions.push('q.checkin_at <= ?');
    params.push(req.query.date_to + ' 23:59:59');
  }
  const whereClause = conditions.join(' AND ');

  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total FROM queue q WHERE ${whereClause}`,
    params
  );

  const [rows] = await pool.query(
    `SELECT q.*, s.name AS service_name
     FROM queue q LEFT JOIN services s ON s.id = q.service_id
     WHERE ${whereClause}
     ORDER BY q.checkin_at DESC, q.id DESC LIMIT ? OFFSET ?`,
    [...params, perPage, offset]
  );

  const ids = rows.map((r) => r.id);
  let extrasByQueue = {};
  if (ids.length) {
    const [links] = await pool.query(
      `SELECT qe.queue_id, e.name FROM queue_extras qe
       JOIN extras e ON e.id = qe.extra_id WHERE qe.queue_id IN (?)`,
      [ids]
    );
    links.forEach((l) => {
      (extrasByQueue[l.queue_id] = extrasByQueue[l.queue_id] || []).push(l.name);
    });
  }

  const [notes] = await pool.query('SELECT client_key, note FROM client_notes WHERE salon_id = ?', [req.salon.id]);
  const noteByKey = Object.fromEntries(notes.map((n) => [n.client_key, n.note]));

  const items = rows.map((r) => Object.assign({}, r, {
    position: r.queue_position,
    checkin_at: utcIso(r.checkin_at),
    start_at: utcIso(r.start_at),
    end_at: utcIso(r.end_at),
    extra_names: extrasByQueue[r.id] || [],
    note: noteByKey[clientKey(r)] || ''
  }));
  res.json({
    ok: true,
    items,
    total,
    page,
    per_page: perPage,
    total_pages: Math.max(1, Math.ceil(total / perPage))
  });
}));

// --- Coiffeur : suppression définitive (nettoyage de données test) ------
router.delete('/:id', requireAdmin, wrap(async (req, res) => {
  const [[before]] = await pool.query('SELECT client_name FROM queue WHERE id = ? AND salon_id = ?', [req.params.id, req.salon.id]);

  // La vente correspondante (si le client a ete encaisse) doit
  // disparaitre en meme temps - sinon le Dashboard (CA calcule depuis
  // queue) et la Caisse/les tickets Z (CA calcule depuis sales)
  // divergent silencieusement. Mais si cette vente appartient DEJA a
  // une cloture passee (ticket Z deja imprime, figE), on refuse : les
  // chiffres d'une periode cloturee ne doivent plus jamais changer
  // retroactivement (conformite legale des logiciels de caisse).
  const [[sale]] = await pool.query(
    'SELECT id, total_price_cents, created_at FROM sales WHERE queue_id = ? AND salon_id = ?',
    [req.params.id, req.salon.id]
  );
  if (sale) {
    const [[closedPeriod]] = await pool.query(
      'SELECT id FROM cash_closings WHERE salon_id = ? AND period_end > ? LIMIT 1',
      [req.salon.id, sale.created_at]
    );
    if (closedPeriod) {
      return res.status(409).json({
        error: 'Impossible de supprimer : la vente correspondante appartient déjà à une clôture de caisse passée (ticket Z imprimé). Les chiffres d\'une période clôturée ne peuvent plus être modifiés.'
      });
    }
  }

  await pool.query('DELETE FROM queue WHERE id = ? AND salon_id = ?', [req.params.id, req.salon.id]);
  if (sale) {
    await pool.query('DELETE FROM sales WHERE id = ? AND salon_id = ?', [sale.id, req.salon.id]);
  }
  await recompute(req.salon.id);
  if (before) {
    logActivity(req.salon.id, 'client_delete', 'Fiche client "' + before.client_name + '" supprimée définitivement' +
      (sale ? ' (vente associée de ' + (sale.total_price_cents / 100).toFixed(2) + ' € également annulée)' : ''));
  }
  res.json({ ok: true, deleted: true });
}));

// Note sur un client (préférences, habitudes...), pour la retrouver la
// prochaine fois qu'il revient. Un coiffeur connecté par PIN ne peut
// noter que son propre client en cours.
router.put('/:id/note', requireAdminOrBarber, wrap(async (req, res) => {
  const [[row]] = await pool.query(
    'SELECT client_name, email, phone, barber_id FROM queue WHERE id = ? AND salon_id = ?',
    [req.params.id, req.salon.id]
  );
  if (!row) return res.status(404).json({ error: 'Client introuvable' });
  if (req.actingBarberId && row.barber_id && row.barber_id !== req.actingBarberId) {
    return res.status(403).json({ error: "Ce n'est pas votre client." });
  }

  const key = clientKey(row);
  if (!key) return res.status(400).json({ error: 'Impossible de rattacher une note à ce client' });

  const note = String(req.body.note || '').trim();
  if (note) {
    await pool.query(
      `INSERT INTO client_notes (id, salon_id, client_key, note) VALUES (UUID(), ?, ?, ?)
       ON DUPLICATE KEY UPDATE note = VALUES(note), updated_at = NOW()`,
      [req.salon.id, key, note]
    );
  } else {
    await pool.query('DELETE FROM client_notes WHERE salon_id = ? AND client_key = ?', [req.salon.id, key]);
  }

  res.json({ ok: true });
}));

/**
 * Tous les passages d'un même client (peu importe le statut), retrouvé
 * par sa clé de rapprochement — combien de fois il est venu, quand,
 * pour quelle prestation.
 */
router.get('/:id/client-history', requireAdminOrBarber, wrap(async (req, res) => {
  const [[row]] = await pool.query(
    'SELECT client_name, email, phone FROM queue WHERE id = ? AND salon_id = ?',
    [req.params.id, req.salon.id]
  );
  if (!row) return res.status(404).json({ error: 'Client introuvable' });

  const key = clientKey(row);
  if (!key) return res.json({ ok: true, items: [] });

  // Un salon reste indépendant des autres de la même enseigne (même
  // principe que la fidélité/les comptes client) - historique limité
  // à CE salon uniquement, plus toute l'enseigne. La source (RDV en
  // ligne ou passage sans-RDV) vient de la ligne appointments liée à
  // ce passage, si elle existe (toujours créée automatiquement,
  // qu'il s'agisse d'un vrai RDV ou d'un check-in kiosk).
  const [allRows] = await pool.query(
    `SELECT q.id, q.client_name, q.email, q.phone, q.status, q.checkin_at, q.start_at, q.end_at,
            q.total_price_cents, s.name AS service_name, a.source AS source
     FROM queue q
     LEFT JOIN services s ON s.id = q.service_id
     LEFT JOIN appointments a ON a.promoted_queue_id = q.id
     WHERE q.salon_id = ?
     ORDER BY q.checkin_at DESC LIMIT 1000`,
    [req.salon.id]
  );

  const items = allRows
    .filter((r) => clientKey(r) === key)
    .map((r) => Object.assign({}, r, {
      checkin_at: utcIso(r.checkin_at),
      start_at: utcIso(r.start_at),
      end_at: utcIso(r.end_at)
    }));

  res.json({ ok: true, items });
}));

/**
 * Meme historique, mais a partir du nom/email/telephone directement -
 * utilise pour un RDV pas encore promu en file (RDV futur), qui n'a
 * donc pas encore d'entree de file existante a interroger.
 */
router.get('/client-history-by-contact', requireAdminOrBarber, wrap(async (req, res) => {
  const key = clientKey({ email: req.query.email, phone: req.query.phone, client_name: req.query.name });
  if (!key) return res.json({ ok: true, items: [] });

  const [allRows] = await pool.query(
    `SELECT q.id, q.client_name, q.email, q.phone, q.status, q.checkin_at, q.start_at, q.end_at,
            q.total_price_cents, s.name AS service_name, a.source AS source
     FROM queue q
     LEFT JOIN services s ON s.id = q.service_id
     LEFT JOIN appointments a ON a.promoted_queue_id = q.id
     WHERE q.salon_id = ?
     ORDER BY q.checkin_at DESC LIMIT 1000`,
    [req.salon.id]
  );

  const items = allRows
    .filter((r) => clientKey(r) === key)
    .map((r) => Object.assign({}, r, {
      checkin_at: utcIso(r.checkin_at),
      start_at: utcIso(r.start_at),
      end_at: utcIso(r.end_at)
    }));

  res.json({ ok: true, items });
}));

/**
 * Autocomplétion "client connu" pour l'ajout manuel d'un RDV (admin
 * ou coiffeur) - dès 3 caractères tapés, propose les clients dont le
 * nom correspond déjà, avec leur email/téléphone pré-remplis
 * automatiquement au clic. Combine l'historique de passages (queue)
 * ET les RDV déjà pris (appointments), dédupliqué par clientKey
 * (email > téléphone > nom), le plus récent d'abord.
 */
router.get('/clients-search', requireAdminOrBarber, wrap(async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (q.length < 3) return res.json({ ok: true, items: [] });
  const like = '%' + q + '%';
  // Recherche aussi par email ou téléphone (chiffres seuls : « 06 12 » retrouve 0612…).
  const digits = q.replace(/\D/g, '');
  const phoneLike = digits.length >= 3 ? '%' + digits + '%' : null;
  const phoneSql = (col) => (phoneLike ? ` OR REPLACE(REPLACE(REPLACE(${col}, ' ', ''), '.', ''), '-', '') LIKE ?` : '');
  const params = (extra) => [req.salon.id, like, like].concat(phoneLike ? [phoneLike] : []).concat(extra || []);

  const [fromQueue] = await pool.query(
    'SELECT client_name, email, phone, checkin_at AS ref_at FROM queue WHERE salon_id = ? AND (client_name LIKE ? OR email LIKE ?' + phoneSql('phone') + ') ORDER BY checkin_at DESC LIMIT 20',
    params()
  );
  const [fromAppointments] = await pool.query(
    'SELECT client_name, email, phone, created_at AS ref_at FROM appointments WHERE salon_id = ? AND (client_name LIKE ? OR email LIKE ?' + phoneSql('phone') + ') ORDER BY created_at DESC LIMIT 20',
    params()
  );
  // Comptes clients (espace client) : prioritaires, avec leurs proches (enfants…) pour la réservation à plusieurs.
  const [accounts] = await pool.query(
    'SELECT id, name AS client_name, email, phone, created_at AS ref_at FROM clients WHERE salon_id = ? AND (name LIKE ? OR email LIKE ?' + phoneSql('phone') + ') ORDER BY created_at DESC LIMIT 10',
    params()
  );
  const relativesByClient = {};
  if (accounts.length) {
    const [rels] = await pool.query('SELECT id, client_id, name FROM client_relatives WHERE client_id IN (?) ORDER BY created_at ASC', [accounts.map((a) => a.id)]);
    rels.forEach((r) => { (relativesByClient[r.client_id] = relativesByClient[r.client_id] || []).push({ id: r.id, name: r.name }); });
  }

  const byKey = {};
  [...fromQueue, ...fromAppointments].forEach((r) => {
    const key = clientKey(r);
    if (!key) return;
    const existing = byKey[key];
    if (!existing || new Date(r.ref_at) > new Date(existing.ref_at)) byKey[key] = r;
  });
  accounts.forEach((a) => {
    const key = clientKey(a);
    if (!key) return;
    const prev = byKey[key];
    byKey[key] = Object.assign({}, a, {
      ref_at: prev && new Date(prev.ref_at) > new Date(a.ref_at) ? prev.ref_at : a.ref_at,
      phone: a.phone || (prev && prev.phone) || '',
      account_id: a.id
    });
  });

  const items = Object.values(byKey)
    .sort((a, b) => (b.account_id ? 1 : 0) - (a.account_id ? 1 : 0) || new Date(b.ref_at) - new Date(a.ref_at))
    .slice(0, 8)
    .map((r) => ({
      name: r.client_name, email: r.email || '', phone: r.phone || '',
      account_id: r.account_id || null,
      relatives: r.account_id ? (relativesByClient[r.account_id] || []) : []
    }));

  res.json({ ok: true, items });
}));

/** Proches (enfants…) enregistrés dans le compte d'un client de CE salon - réservation à plusieurs côté salon. */
async function salonClientAccount(req, res) {
  const [[c]] = await pool.query('SELECT id FROM clients WHERE id = ? AND salon_id = ?', [String(req.params.id || ''), req.salon.id]);
  if (!c) { res.status(404).json({ error: 'Compte client introuvable' }); return null; }
  return c;
}
router.get('/client-accounts/:id/relatives', requireAdminOrBarber, wrap(async (req, res) => {
  const c = await salonClientAccount(req, res); if (!c) return;
  const [rows] = await pool.query('SELECT id, name FROM client_relatives WHERE client_id = ? ORDER BY created_at ASC', [c.id]);
  res.json({ ok: true, relatives: rows });
}));
/** Le salon ajoute un proche au compte du client (case « Enregistrer dans ses proches ») : visible ensuite dans son espace client. */
router.post('/client-accounts/:id/relatives', requireAdminOrBarber, wrap(async (req, res) => {
  const c = await salonClientAccount(req, res); if (!c) return;
  const name = String((req.body && req.body.name) || '').replace(/\s+/g, ' ').trim().slice(0, 100);
  if (!name) return res.status(400).json({ error: 'Le prénom est requis' });
  const [[same]] = await pool.query('SELECT id, name FROM client_relatives WHERE client_id = ? AND LOWER(name) = LOWER(?)', [c.id, name]);
  if (same) return res.json({ ok: true, item: same, existing: true });
  const [[count]] = await pool.query('SELECT COUNT(*) AS n FROM client_relatives WHERE client_id = ?', [c.id]);
  if (count.n >= 12) return res.status(400).json({ error: 'Maximum 12 proches enregistrés.' });
  const id = crypto.randomUUID();
  await pool.query('INSERT INTO client_relatives (id, client_id, name) VALUES (?, ?, ?)', [id, c.id, name]);
  const [[acc]] = await pool.query('SELECT name FROM clients WHERE id = ?', [c.id]);
  logActivity(req.salon.id, 'client_relative_add', 'Proche "' + name + '" ajouté au compte de ' + (acc ? acc.name : 'un client'));
  res.json({ ok: true, item: { id, name } });
}));

module.exports = router;
