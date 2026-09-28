const express = require('express');
const crypto = require('crypto');
const { pool, utcIso, getSettings, getCaisseLockedUntil } = require('../db');
const { clientKey, earnLoyaltyPoint } = require('../lib/queueMath');
const { sendGiftConfirmation } = require('../lib/mailer');
const requireAdmin = require('../middleware/auth');
const requireAdminOrBarber = require('../middleware/barberAuth');
const { wrap } = require('../lib/wrap');
const { withCashLock, HttpError } = require('../lib/cashLock');

const router = express.Router();

const PAYMENT_METHODS = ['especes', 'cb', 'autre'];

// Alphabet sans caractères ambigus à l'oral/à l'écrit (pas de 0/O, 1/I).
const GIFT_CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function generateGiftCode() {
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += GIFT_CODE_CHARS[crypto.randomInt(GIFT_CODE_CHARS.length)];
  }
  return code;
}

/**
 * Enregistre une vente en caisse — indépendante de la file d'attente,
 * pour les prestations réglées directement au comptoir et les produits
 * vendus à emporter (boissons, cosmétiques...). Accessible aux coiffeurs
 * connectés par PIN (n'importe qui de service peut encaisser), pas
 * seulement l'admin.
 *
 * Tout ce qui touche à la base (verrou de caisse, client marqué payé,
 * numéro de ticket, lignes, stock, cadeau) se fait dans UNE transaction
 * sous un verrou par salon (lib/cashLock.js) : soit la vente est entièrement
 * enregistrée, soit rien ne bouge - par exemple un client n'est plus jamais
 * marqué "encaissé" alors que la vente est refusée juste après (stock
 * insuffisant...). Le même verrou empêche qu'une clôture de caisse calcule
 * ses totaux pendant qu'une vente s'enregistre, et rend le numéro de ticket
 * unique (deux ventes simultanées obtenaient le même).
 *
 * `client_request_id` (UUID généré par la caisse pour CETTE tentative
 * d'encaissement) rend l'appel rejouable sans risque : la même demande
 * renvoyée deux fois (réseau coupé après l'enregistrement, double envoi,
 * nouvel essai après une carte débitée) retourne la vente déjà créée au lieu
 * d'en créer une seconde.
 */
const ITEM_TYPES = ['service', 'extra', 'product'];
const MAX_QTY = 999;
const MAX_UNIT_PRICE_CENTS = 10_000_000; // 100 000 €

router.post('/', requireAdminOrBarber, wrap(async (req, res) => {
  const { payment_method, items, queue_id, gift, loyalty_redeem } = req.body;
  const clientRequestId = (typeof req.body.client_request_id === 'string' && /^[0-9a-fA-F-]{16,64}$/.test(req.body.client_request_id))
    ? req.body.client_request_id : null;

  // ---- Validations qui ne demandent aucun accès à la base ----
  if (!PAYMENT_METHODS.includes(payment_method)) {
    return res.status(400).json({ error: 'Moyen de paiement invalide' });
  }
  if (!Array.isArray(items) || !items.length) {
    return res.status(400).json({ error: 'Le ticket est vide' });
  }
  if (items.length > 100) {
    return res.status(400).json({ error: 'Ticket trop long (100 lignes maximum)' });
  }

  // Un ticket "cadeau" ne peut pas venir d'un encaissement en attente
  // (ça n'aurait pas de sens : un client déjà en train de se faire
  // servir n'est pas un cadeau à l'avance pour quelqu'un d'autre), et
  // exige le nom + téléphone + email du bénéficiaire pour un
  // rapprochement fiable plus tard.
  if (gift) {
    if (queue_id) return res.status(400).json({ error: "Un cadeau ne peut pas venir d'un encaissement en attente" });
    if (!gift.recipient_name || !gift.recipient_phone || !gift.recipient_email) {
      return res.status(400).json({ error: 'Nom, téléphone et email du bénéficiaire sont requis pour un cadeau' });
    }
    // Le coiffeur actif (bulle sélectionnée) au moment de la vente
    // devient le coiffeur DÉSIGNÉ pour ce cadeau - le bénéficiaire
    // n'aura plus à en choisir un lui-même au kiosk/à la réservation en
    // ligne. Le vrai blocage se fait côté caisse.html (qui connaît
    // fidèlement l'état de sélection de bulle) - ce contrôle-ci n'est
    // qu'un filet de sécurité pour un appel direct à l'API sans session
    // de coiffeur du tout (ex: admin sans barber_id explicite dans le
    // corps de la requête).
    if (!req.actingBarberId && !req.body.barber_id) {
      return res.status(400).json({ error: 'Veuillez sélectionner votre profil (bulle coiffeur) avant de créer un cadeau' });
    }
  }

  // Normalisation des lignes : quantité ENTIÈRE (une quantité fractionnaire
  // faisait diverger le total de la vente de la somme de ses lignes, donc
  // le ticket Z), prix entier borné, type connu, textes bornés.
  const cleanItems = [];
  for (const it of items) {
    const qty = it.quantity === undefined || it.quantity === null ? 1 : Number(it.quantity);
    if (!Number.isInteger(qty) || qty < 1 || qty > MAX_QTY) {
      return res.status(400).json({ error: 'Quantité invalide (entier de 1 à ' + MAX_QTY + ')' });
    }
    const unitPrice = Math.max(0, Math.round(Number(it.unit_price_cents) || 0));
    if (unitPrice > MAX_UNIT_PRICE_CENTS) {
      return res.status(400).json({ error: 'Prix invalide' });
    }
    cleanItems.push({
      item_type: ITEM_TYPES.includes(it.item_type) ? it.item_type : 'product',
      item_id: typeof it.item_id === 'string' && it.item_id ? it.item_id.slice(0, 36) : null,
      item_name: String(it.item_name || 'Article').slice(0, 255),
      unit_price_cents: unitPrice,
      quantity: qty,
      barber_id: typeof it.barber_id === 'string' ? it.barber_id : null
    });
  }

  let outcome;
  try {
    outcome = await withCashLock(req.salon.id, async (db) => {
      // 0. Même demande déjà enregistrée : on renvoie la vente existante.
      if (clientRequestId) {
        const [[existing]] = await db.query(
          'SELECT id, total_price_cents, payment_method, barber_id, ticket_number FROM sales WHERE salon_id = ? AND client_request_id = ?',
          [req.salon.id, clientRequestId]
        );
        if (existing) {
          const [[giftRow]] = await db.query('SELECT code FROM gift_cards WHERE sale_id = ? LIMIT 1', [existing.id]);
          return { duplicate: true, sale: existing, giftCode: giftRow ? giftRow.code : null };
        }
      }

      // 1. La caisse peut être verrouillée jusqu'au lendemain suite à une
      // clôture — vérifié ici côté serveur (pas seulement visuellement).
      const settings = await getSettings(req.salon.id, db);
      const lockedUntil = await getCaisseLockedUntil(req.salon.id, settings, db);
      if (lockedUntil) {
        throw new HttpError(423,
          'La caisse est fermée suite à une clôture — réouverture prévue le ' +
          new Date(lockedUntil).toLocaleString('fr-FR', {
            day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
            timeZone: settings.timezone || 'Europe/Paris'
          }) + '.');
      }

      // 2. Client en attente d'encaissement : appartient à ce coiffeur, pas
      // déjà réglé. Le marquage "payé" est atomique (WHERE paid_at IS NULL)
      // ET annulé automatiquement si la suite échoue (transaction).
      let queueRow = null;
      if (queue_id) {
        const [[row]] = await db.query(
          'SELECT barber_id, status, paid_at, client_name, email, phone FROM queue WHERE id = ? AND salon_id = ? FOR UPDATE',
          [queue_id, req.salon.id]
        );
        if (!row) throw new HttpError(404, 'Client introuvable');
        if (req.actingBarberId && row.barber_id !== req.actingBarberId) {
          throw new HttpError(403, "Ce n'est pas votre client.");
        }
        if (row.paid_at) throw new HttpError(409, 'Ce client a déjà été encaissé.');
        const [markResult] = await db.query(
          'UPDATE queue SET paid_at = NOW() WHERE id = ? AND salon_id = ? AND paid_at IS NULL',
          [queue_id, req.salon.id]
        );
        if (markResult.affectedRows === 0) {
          throw new HttpError(409, 'Ce client vient d\'être encaissé (probablement par un autre appareil).');
        }
        queueRow = row;
      }

      // 3. Coiffeur de la vente. Un id venant du corps de la requête doit
      // appartenir à CE salon (sinon on ignorerait silencieusement une
      // référence vers le coiffeur d'un autre salon).
      let barberId = req.actingBarberId || null;
      if (!barberId && req.body.barber_id) {
        const [[b]] = await db.query('SELECT id FROM barbers WHERE id = ? AND salon_id = ?', [req.body.barber_id, req.salon.id]);
        barberId = b ? b.id : null;
      }

      // Un coiffeur "vendeur" par ligne n'a de sens que pour un produit -
      // jamais pour une prestation/supplément. Id validé (même salon, actif),
      // sinon silencieusement ignoré (pas de blocage de la vente pour ça).
      const lineBarberIds = [...new Set(cleanItems.filter((it) => it.item_type === 'product' && it.barber_id).map((it) => it.barber_id))];
      let validLineBarberIds = new Set();
      if (lineBarberIds.length) {
        const [rows] = await db.query(
          'SELECT id FROM barbers WHERE id IN (?) AND salon_id = ? AND active = 1',
          [lineBarberIds, req.salon.id]
        );
        validLineBarberIds = new Set(rows.map((r) => r.id));
      }

      // 4. Stock : vérifié sur la QUANTITÉ TOTALE par produit (deux lignes du
      // même produit comptaient chacune séparément), lignes verrouillées.
      const wantedByProduct = new Map();
      cleanItems.forEach((it) => {
        if (it.item_type === 'product' && it.item_id) {
          wantedByProduct.set(it.item_id, (wantedByProduct.get(it.item_id) || 0) + it.quantity);
        }
      });
      if (wantedByProduct.size) {
        const [stockRows] = await db.query(
          'SELECT id, name, stock_enabled, stock_quantity FROM products WHERE id IN (?) AND salon_id = ? FOR UPDATE',
          [[...wantedByProduct.keys()], req.salon.id]
        );
        for (const product of stockRows) {
          const wanted = wantedByProduct.get(product.id);
          if (product.stock_enabled && product.stock_quantity < wanted) {
            throw new HttpError(409,
              `Stock insuffisant pour "${product.name}" (${product.stock_quantity} restant, ${wanted} demandé${wanted > 1 ? 's' : ''})`);
          }
        }
      }

      // 5. Numéro de ticket séquentiel par salon (sous verrou : sans trou ni doublon).
      const [[{ next_ticket_number: ticketNumber }]] = await db.query(
        'SELECT COALESCE(MAX(ticket_number), 0) + 1 AS next_ticket_number FROM sales WHERE salon_id = ?',
        [req.salon.id]
      );

      // 6. Vente + lignes. Le total est la somme EXACTE des lignes.
      const saleId = crypto.randomUUID();
      let total = 0;
      const itemRows = cleanItems.map((it) => {
        total += it.quantity * it.unit_price_cents;
        const lineBarberId = it.item_type === 'product' && it.barber_id && validLineBarberIds.has(it.barber_id) ? it.barber_id : null;
        return [crypto.randomUUID(), saleId, it.item_type, it.item_id, it.item_name, it.unit_price_cents, it.quantity, lineBarberId];
      });
      await db.query(
        'INSERT INTO sales (id, salon_id, barber_id, payment_method, total_price_cents, ticket_number, queue_id, client_request_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [saleId, req.salon.id, barberId, payment_method, total, ticketNumber, queue_id || null, clientRequestId]
      );
      await db.query(
        'INSERT INTO sale_items (id, sale_id, item_type, item_id, item_name, unit_price_cents, quantity, barber_id) VALUES ?',
        [itemRows]
      );

      // 7. Décompte du stock (uniquement les produits à stock géré).
      for (const [productId, qty] of wantedByProduct) {
        await db.query(
          'UPDATE products SET stock_quantity = GREATEST(0, stock_quantity - ?) WHERE id = ? AND salon_id = ? AND stock_enabled = 1',
          [qty, productId, req.salon.id]
        );
      }

      // 8. Cadeau : créé dans la même transaction que la vente qui l'a payé.
      let giftInfo = null;
      if (gift) {
        const itemsSnapshot = cleanItems.map((it) => ({
          item_type: it.item_type, item_id: it.item_id, item_name: it.item_name,
          unit_price_cents: it.unit_price_cents, quantity: it.quantity
        }));
        const code = generateGiftCode();
        await db.query(
          `INSERT INTO gift_cards (id, salon_id, sale_id, recipient_name, recipient_phone, recipient_email, amount_cents, items_json, code)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [crypto.randomUUID(), req.salon.id, saleId, gift.recipient_name, gift.recipient_phone, gift.recipient_email, total, JSON.stringify(itemsSnapshot), code]
        );
        giftInfo = { code, itemsSnapshot };
      }

      return {
        duplicate: false,
        sale: { id: saleId, total_price_cents: total, payment_method, barber_id: barberId, ticket_number: ticketNumber },
        queueRow, giftInfo
      };
    });
  } catch (err) {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
    throw err;
  }

  if (outcome.duplicate) {
    // Demande déjà traitée : on renvoie la vente d'origine, sans rien refaire
    // (ni point de fidélité, ni second email).
    return res.json({
      ok: true, duplicate: true,
      sale: {
        id: outcome.sale.id, total_price_cents: outcome.sale.total_price_cents, payment_method: outcome.sale.payment_method,
        barber_id: outcome.sale.barber_id, ticket_number: outcome.sale.ticket_number
      },
      gift: outcome.giftCode ? { code: outcome.giftCode, email_sent: true } : null
    });
  }

  // ---- Après validation de la transaction : effets secondaires ----
  if (outcome.queueRow) {
    // Ce passage vient d'être réellement payé : +1 point de fidélité.
    await earnLoyaltyPoint(req.salon.id, outcome.queueRow);
    // Une récompense de fidélité était appliquée à ce ticket (gagnée à
    // un passage précédent) — on la consomme maintenant.
    if (loyalty_redeem) {
      const key = clientKey(outcome.queueRow);
      if (key) {
        await pool.query(
          `UPDATE loyalty_accounts SET rewards_available = GREATEST(rewards_available - 1, 0), updated_at = NOW()
           WHERE salon_id = ? AND client_key = ? AND rewards_available > 0`,
          [req.salon.id, key]
        );
      }
    }
  }

  let giftResult = null;
  if (outcome.giftInfo) {
    let giftEmailSent = true;
    try {
      await sendGiftConfirmation(req.salon.id, gift.recipient_email, {
        recipientName: gift.recipient_name,
        amountEur: (outcome.sale.total_price_cents / 100).toFixed(2).replace('.', ',') + ' €',
        items: outcome.giftInfo.itemsSnapshot,
        code: outcome.giftInfo.code
      });
    } catch (err) {
      // N'empêche jamais la vente si l'email échoue (ex. SMTP salon pas
      // configuré) — le code reste consultable par le super admin/admin
      // si besoin, journalisé pour investigation, ET remonté au
      // frontend (giftEmailSent = false) pour que le coiffeur sache
      // qu'il doit donner le code au client autrement (le ticket
      // imprimé ne contient pas le code cadeau aujourd'hui).
      giftEmailSent = false;
      console.error('[gift] envoi email de confirmation échoué:', err.message);
    }
    giftResult = { code: outcome.giftInfo.code, email_sent: giftEmailSent };
  }

  res.json({ ok: true, sale: outcome.sale, gift: giftResult });
}));

/**
 * Historique des ventes (admin uniquement) — pour le suivi/reporting,
 * avec filtre par plage de dates optionnel.
 */
router.get('/', requireAdminOrBarber, wrap(async (req, res) => {
  const conditions = ['s.salon_id = ?'];
  const params = [req.salon.id];
  if (req.query.date_from) { conditions.push('s.created_at >= ?'); params.push(req.query.date_from + ' 00:00:00'); }
  if (req.query.date_to) { conditions.push('s.created_at <= ?'); params.push(req.query.date_to + ' 23:59:59'); }
  if (req.query.since) {
    const mysqlDatetime = String(req.query.since).replace('T', ' ').replace('Z', '');
    conditions.push('s.created_at > ?');
    params.push(mysqlDatetime);
  }
  // Filtre "historique de caisse" : n'importe quelle vente où ce
  // coiffeur apparaît quelque part - qu'il ait fait toute la vente, OU
  // qu'il ait juste vendu un des produits dedans (sale_items.barber_id).
  if (req.query.barber_id) {
    conditions.push('(s.barber_id = ? OR EXISTS (SELECT 1 FROM sale_items si2 WHERE si2.sale_id = s.id AND si2.barber_id = ?))');
    params.push(req.query.barber_id, req.query.barber_id);
  }

  const [sales] = await pool.query(
    `SELECT s.*, b.name AS barber_name FROM sales s LEFT JOIN barbers b ON b.id = s.barber_id
     WHERE ${conditions.join(' AND ')} ORDER BY s.created_at DESC LIMIT 500`,
    params
  );
  const ids = sales.map((s) => s.id);
  let itemsBySale = {};
  if (ids.length) {
    const [items] = await pool.query('SELECT * FROM sale_items WHERE sale_id IN (?)', [ids]);
    items.forEach((it) => { (itemsBySale[it.sale_id] = itemsBySale[it.sale_id] || []).push(it); });
  }

  res.json({
    ok: true,
    items: sales.map((s) => Object.assign({}, s, {
      created_at: utcIso(s.created_at),
      items: itemsBySale[s.id] || []
    })),
    total_revenue_cents: sales.reduce((a, s) => a + s.total_price_cents, 0)
  });
}));

/**
 * Utilise un bon cadeau pour régler une coupe en attente d'encaissement
 * — ne crée AUCUNE nouvelle vente (l'argent a déjà été compté le jour
 * de l'achat du cadeau), marque juste le cadeau consommé et la coupe
 * payée.
 */
router.post('/gift-cards/:id/redeem', requireAdminOrBarber, wrap(async (req, res) => {
  const { queue_id } = req.body;
  if (!queue_id) return res.status(400).json({ error: 'queue_id requis' });

  const [[gift]] = await pool.query(
    'SELECT id, used_at FROM gift_cards WHERE id = ? AND salon_id = ?',
    [req.params.id, req.salon.id]
  );
  if (!gift) return res.status(404).json({ error: 'Bon cadeau introuvable' });
  if (gift.used_at) return res.status(409).json({ error: 'Ce bon cadeau a déjà été utilisé' });

  const [[queueRow]] = await pool.query(
    'SELECT barber_id, paid_at, client_name, email, phone FROM queue WHERE id = ? AND salon_id = ?',
    [queue_id, req.salon.id]
  );
  if (!queueRow) return res.status(404).json({ error: 'Client introuvable' });
  if (req.actingBarberId && queueRow.barber_id !== req.actingBarberId) {
    return res.status(403).json({ error: "Ce n'est pas votre client." });
  }
  if (queueRow.paid_at) return res.status(409).json({ error: 'Ce client a déjà été encaissé.' });

  // Deux marquages ATOMIQUES (WHERE ... IS NULL + vérification des
  // lignes affectées) — si deux requêtes arrivent en même temps (double
  // clic, ou tentative d'utiliser le même cadeau sur deux clients
  // différents simultanément), une seule peut effectivement réussir.
  const [giftResult] = await pool.query(
    'UPDATE gift_cards SET used_at = NOW(), used_queue_id = ? WHERE id = ? AND used_at IS NULL AND voided_at IS NULL',
    [queue_id, req.params.id]
  );
  if (giftResult.affectedRows === 0) {
    const [[giftNow]] = await pool.query('SELECT voided_at FROM gift_cards WHERE id = ?', [req.params.id]);
    if (giftNow && giftNow.voided_at) {
      return res.status(409).json({ error: 'Ce bon cadeau a été désactivé.' });
    }
    return res.status(409).json({ error: 'Ce bon cadeau vient d\'être utilisé (probablement par un autre appareil).' });
  }

  const [queueResult] = await pool.query(
    'UPDATE queue SET paid_at = NOW() WHERE id = ? AND paid_at IS NULL',
    [queue_id]
  );
  if (queueResult.affectedRows === 0) {
    // Le client vient d'être payé autrement entre-temps — on annule la
    // consommation du cadeau qu'on venait de marquer, pour ne pas le
    // perdre pour rien.
    await pool.query('UPDATE gift_cards SET used_at = NULL, used_queue_id = NULL WHERE id = ?', [req.params.id]);
    return res.status(409).json({ error: 'Ce client vient d\'être encaissé autrement.' });
  }

  // Ce passage vient d'être réglé (via le cadeau) : compte aussi comme
  // un vrai passage payé pour la fidélité.
  await earnLoyaltyPoint(req.salon.id, queueRow);

  res.json({ ok: true });
}));

/**
 * Consultation d'un cadeau par son code (public — utilisé par le
 * kiosk). Ne marque RIEN comme utilisé, juste une consultation : c'est
 * toujours la caisse qui encaisse réellement le cadeau.
 */
router.get('/gift-cards/lookup', wrap(async (req, res) => {
  const code = String(req.query.code || '').trim().toUpperCase();
  if (!code) return res.status(400).json({ error: 'Code requis' });

  const [[gift]] = await pool.query(
    `SELECT g.*, s.barber_id, b.name AS barber_name, b.photo_url AS barber_photo_url, b.active AS barber_active, b.accepts_appointments
     FROM gift_cards g
     JOIN sales s ON s.id = g.sale_id
     LEFT JOIN barbers b ON b.id = s.barber_id
     WHERE g.salon_id = ? AND g.code = ?`,
    [req.salon.id, code]
  );
  if (!gift) return res.status(404).json({ error: 'Code introuvable pour ce salon' });
  if (gift.used_at) return res.status(409).json({ error: 'Ce cadeau a déjà été utilisé' });
  if (gift.pending_appointment_id) return res.status(409).json({ error: 'Ce cadeau sert déjà à un rendez-vous en attente - annulez-le pour en reprendre un nouveau.' });

  let items = [];
  try { items = JSON.parse(gift.items_json || '[]'); } catch (e) { items = []; }

  // Le coiffeur désigné (celui dont la bulle était sélectionnée à la
  // vente) ne doit être proposé que s'il est toujours actif ET accepte
  // toujours les RDV/le kiosk aujourd'hui - sinon on retombe sur le
  // comportement normal (laisser choisir), plutôt que d'imposer un
  // coiffeur qui n'est peut-être plus disponible.
  const designatedBarber = (gift.barber_id && gift.barber_active && gift.accepts_appointments)
    ? { id: gift.barber_id, name: gift.barber_name, photo_url: gift.barber_photo_url }
    : null;

  // Un coiffeur "sans rendez-vous" (accepts_appointments=0) ne peut pas
  // être réservé en ligne - si le cadeau lui est explicitement lié, il
  // faut bloquer toute réservation en ligne plutôt que de laisser le
  // client choisir un autre coiffeur à sa place (le cadeau a été pensé
  // pour être honoré précisément par ce coiffeur-là, en salon).
  const walkInOnly = Boolean(gift.barber_id) && !gift.accepts_appointments;

  res.json({
    ok: true,
    gift: {
      id: gift.id,
      recipient_name: gift.recipient_name,
      recipient_email: gift.recipient_email,
      recipient_phone: gift.recipient_phone,
      amount_cents: gift.amount_cents,
      designated_barber: designatedBarber,
      walk_in_only: walkInOnly,
      items
    }
  });
}));

module.exports = router;
