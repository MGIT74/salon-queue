const express = require('express');
const crypto = require('crypto');
const { pool, utcIso } = require('../db');
const { loadQueue, recompute, clientKey } = require('../lib/queueMath');
const { promoteTodayAppointments, nowParisDatetimeString } = require('./appointments');
const requireAdmin = require('../middleware/auth');
const requireAdminOrBarber = require('../middleware/barberAuth');

const router = express.Router();

function wrap(fn) {
  return function (req, res) {
    fn(req, res).catch((err) => {
      console.error(err);
      res.status(500).json({ error: err.message });
    });
  };
}

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
    'SELECT * FROM gift_cards WHERE salon_id = ? AND used_at IS NULL ORDER BY created_at ASC', [salonId]
  );
  if (!gifts.length) return rows;
  const giftByKey = {};
  gifts.forEach((g) => {
    const key = clientKey({ email: g.recipient_email, phone: g.recipient_phone, client_name: g.recipient_name });
    // Ne jamais écraser un cadeau déjà trouvé pour cette clé : le
    // premier de la boucle (donc le plus ancien, grâce au tri) reste.
    if (key && !giftByKey[key]) giftByKey[key] = g;
  });
  return rows.map((r) => {
    const key = clientKey(r);
    const gift = key ? giftByKey[key] : null;
    if (!gift) return r;
    let items = [];
    try { items = JSON.parse(gift.items_json || '[]'); } catch (e) { items = []; }
    return Object.assign({}, r, { gift_card: { id: gift.id, amount_cents: gift.amount_cents, items } });
  });
}

// --- Public : état de la file (du salon résolu) --------------------------
router.get('/', wrap(async (req, res) => {
  await promoteTodayAppointments(req.salon.id);
  await recompute(req.salon.id);
  let rows = await loadQueue(req.salon.id);
  rows = await attachGiftInfo(rows, req.salon.id);
  rows.sort((a, b) => {
    if (a.status !== b.status) return a.status === 'in_progress' ? -1 : 1;
    return (a.position || 0) - (b.position || 0);
  });
  res.json({ ok: true, queue: rows });
}));

/**
 * Coupes terminées mais pas encore encaissées, pour la caisse. Scopé au
 * coiffeur connecté par PIN (chacun encaisse ses propres clients, dans
 * l'ordre) — un admin voit tout le monde. Les encaissements "mis de
 * côté" (client parti chercher sa carte, urgence...) sont relégués à la
 * fin de la liste, pour ne jamais bloquer les suivants.
 */
router.get('/pending-payment', requireAdminOrBarber, wrap(async (req, res) => {
  let rows = await loadQueue(req.salon.id, ['done'], true);
  if (req.barberId) rows = rows.filter((r) => r.barber_id === req.barberId);
  rows = await attachGiftInfo(rows, req.salon.id);

  // Fidélité : cumulée au niveau du SALON, pas de toute l'enseigne -
  // un client vu ici n'a de points que ceux gagnés dans CE salon.
  // Un client sans compte ACTIVÉ n'est pas encore membre : la caisse
  // doit proposer d'activer sa carte (avec son accord), pas afficher
  // une récompense qui n'existe pas.
  const [loyaltyRows] = await pool.query(
    'SELECT client_key, rewards_available, activated_at FROM loyalty_accounts WHERE salon_id = ? AND activated_at IS NOT NULL',
    [req.salon.id]
  );
  const loyaltyByKey = {};
  loyaltyRows.forEach((l) => { loyaltyByKey[l.client_key] = l.rewards_available; });

  rows = rows.map((r) => {
    const key = clientKey(r);
    const activated = key ? Object.prototype.hasOwnProperty.call(loyaltyByKey, key) : false;
    const extra = { loyalty_member: activated };
    if (activated && loyaltyByKey[key] > 0) extra.loyalty_rewards_available = loyaltyByKey[key];
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
    'SELECT barber_id, status, paid_at, payment_deferred_at FROM queue WHERE id = ? AND salon_id = ?',
    [req.params.id, req.salon.id]
  );
  if (!row) return res.status(404).json({ error: 'Client introuvable' });
  if (req.barberId && row.barber_id && row.barber_id !== req.barberId) {
    return res.status(403).json({ error: "Ce n'est pas votre client." });
  }
  if (row.paid_at) return res.status(409).json({ error: 'Ce client a déjà été encaissé.' });

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
  res.json({ ok: true, id });
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
      'SELECT id FROM gift_cards WHERE salon_id = ? AND used_at IS NULL AND ' +
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
    // scheduled_at est toujours exprimé en heure de salon (Europe/Paris),
    // jamais en UTC — comme pour un RDV pris en ligne. Utiliser NOW() ici
    // stockerait l'heure serveur (UTC) dans une colonne "heure locale",
    // et l'agenda (qui affiche scheduled_at tel quel, sans conversion)
    // se déciderait alors avec 1h à 2h de décalage.
    await pool.query(
      `INSERT INTO appointments (id, salon_id, barber_id, client_name, email, phone, service_id, scheduled_at, status, promoted_queue_id, source)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'confirmed', ?, 'walkin')`,
      [apptId, req.salon.id, checkinBarberId, client_name, email || null, phone || null, service_id, nowParisDatetimeString(), id]
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

  // Un coiffeur connecté par PIN (pas admin) ne peut agir qu'en son propre
  // nom, et seulement sur un client déjà assigné à lui ou non-assigné —
  // jamais démarrer le client de quelqu'un d'autre.
  if (req.barberId) {
    if (row.barber_id && row.barber_id !== req.barberId) {
      return res.status(403).json({ error: 'Ce client attend un autre coiffeur.' });
    }
  }

  const barberId = req.barberId || req.body.barber_id || row.barber_id || null;

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

router.post('/:id/finish', requireAdminOrBarber, wrap(async (req, res) => {
  if (req.barberId) {
    const [[row]] = await pool.query(
      'SELECT barber_id FROM queue WHERE id = ? AND salon_id = ?',
      [req.params.id, req.salon.id]
    );
    if (!row) return res.status(404).json({ error: 'Client introuvable' });
    if (row.barber_id !== req.barberId) {
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
  if (req.barberId) {
    const [[row]] = await pool.query(
      'SELECT barber_id FROM queue WHERE id = ? AND salon_id = ?',
      [req.params.id, req.salon.id]
    );
    if (!row) return res.status(404).json({ error: 'Client introuvable' });
    if (row.barber_id && row.barber_id !== req.barberId) {
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

  if (req.barberId && existing.barber_id !== req.barberId) {
    return res.status(403).json({ error: "Ce n'est pas votre client." });
  }

  const { service_id, extras, barber_id, client_name, email, phone } = req.body;

  // Un coiffeur ne peut pas ajouter un supplément à une coupe EN COURS
  // s'il y a déjà quelqu'un qui attend son tour derrière lui — ça le
  // retarderait sans qu'il le sache à l'avance. On ne bloque que
  // l'AJOUT (la liste s'agrandit), pas le retrait d'un supplément.
  if (req.barberId && Array.isArray(extras) && existing.status === 'in_progress') {
    const [[{ n: currentExtrasCount }]] = await pool.query(
      'SELECT COUNT(*) AS n FROM queue_extras WHERE queue_id = ?', [req.params.id]
    );
    if (extras.length > currentExtrasCount) {
      const [[nextWaiting]] = await pool.query(
        `SELECT id FROM queue WHERE salon_id = ? AND status = 'waiting'
         AND (barber_id IS NULL OR barber_id = ?) LIMIT 1`,
        [req.salon.id, req.barberId]
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
router.get('/stats/today', requireAdmin, wrap(async (req, res) => {
  const [[row]] = await pool.query(
    `SELECT COUNT(*) AS done_count, COALESCE(SUM(total_price_cents), 0) AS revenue_cents
     FROM queue WHERE salon_id = ? AND status = 'done' AND end_at >= CURDATE()`,
    [req.salon.id]
  );
  res.json({ ok: true, done: Number(row.done_count), revenue_cents: Number(row.revenue_cents) });
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
  await pool.query('DELETE FROM queue WHERE id = ? AND salon_id = ?', [req.params.id, req.salon.id]);
  await recompute(req.salon.id);
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
  if (req.barberId && row.barber_id && row.barber_id !== req.barberId) {
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
router.get('/:id/client-history', requireAdmin, wrap(async (req, res) => {
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
router.get('/client-history-by-contact', requireAdmin, wrap(async (req, res) => {
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

  const [fromQueue] = await pool.query(
    'SELECT client_name, email, phone, checkin_at AS ref_at FROM queue WHERE salon_id = ? AND client_name LIKE ? ORDER BY checkin_at DESC LIMIT 20',
    [req.salon.id, like]
  );
  const [fromAppointments] = await pool.query(
    'SELECT client_name, email, phone, created_at AS ref_at FROM appointments WHERE salon_id = ? AND client_name LIKE ? ORDER BY created_at DESC LIMIT 20',
    [req.salon.id, like]
  );

  const byKey = {};
  [...fromQueue, ...fromAppointments].forEach((r) => {
    const key = clientKey(r);
    if (!key) return;
    const existing = byKey[key];
    if (!existing || new Date(r.ref_at) > new Date(existing.ref_at)) byKey[key] = r;
  });

  const items = Object.values(byKey)
    .sort((a, b) => new Date(b.ref_at) - new Date(a.ref_at))
    .slice(0, 8)
    .map((r) => ({ name: r.client_name, email: r.email || '', phone: r.phone || '' }));

  res.json({ ok: true, items });
}));

module.exports = router;
