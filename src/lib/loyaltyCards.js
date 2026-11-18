'use strict';

// Fidélité à PLUSIEURS cartes (Marketing > Cartes de fidélité).
// - L'admin crée, modifie, publie / dépublie des cartes. Chaque carte a :
//   . ses paliers : N points -> une récompense (remise % sur une prestation, remise % sur un produit, ou un
//     article offert) ;
//   . ses articles qui rapportent des points : tous, ou seulement les prestations / suppléments / produits cochés.
// - Un client peut avoir plusieurs cartes activées (une ligne loyalty_accounts par carte), chacune avec ses points.
// - 1 point par passage payé, sur chaque carte activée (et publiée) dont au moins un article coché est sur le ticket.
// - L'activation se fait par le coiffeur en caisse ; une carte « activée à la création du compte » l'est aussi
//   automatiquement quand le client crée son compte en ligne (comportement de la carte d'avant).
// La carte qui existait avant (réglages loyalty_*_threshold / _discount_pct) devient la première carte :
// ensureDefaultCards() la crée au démarrage et y rattache les points déjà gagnés.

const crypto = require('crypto');
const { pool, getOwnerSettings } = require('../db');
const { thresholdsFrom } = require('./loyaltyRules');

const REWARDS = ['service_pct', 'product_pct', 'free_item'];
const KINDS = ['service', 'extra', 'product'];
const KIND_TABLE = { service: 'services', extra: 'extras', product: 'products' };

/** Crée la première carte de chaque enseigne qui n'en a pas encore, à partir de l'ancienne carte unique. */
async function ensureDefaultCards() {
  const [owners] = await pool.query(
    'SELECT o.id FROM owners o WHERE NOT EXISTS (SELECT 1 FROM loyalty_cards c WHERE c.owner_id = o.id)'
  );
  for (const o of owners) {
    const s = await getOwnerSettings(o.id);
    const t = thresholdsFrom(s);
    const pct = (k, d) => { const n = Number(s[k]); return Number.isFinite(n) && n >= 0 && n <= 100 ? Math.round(n) : d; };
    const id = crypto.randomUUID();
    await pool.query(
      `INSERT INTO loyalty_cards (id, owner_id, name, published, auto_on_signup, scope_all, uses_salon_image, position)
       VALUES (?, ?, 'Carte de fidélité', 1, 1, 1, 1, 0)`, [id, o.id]);
    await pool.query(
      `INSERT INTO loyalty_card_tiers (id, card_id, position, points, reward, pct) VALUES (?, ?, 0, ?, 'service_pct', ?), (?, ?, 1, ?, 'product_pct', ?)`,
      [crypto.randomUUID(), id, t.service, pct('loyalty_service_discount_pct', 50), crypto.randomUUID(), id, t.product, pct('loyalty_product_discount_pct', 20)]);
  }
  // Points déjà gagnés : rattachés à la première carte de l'enseigne.
  const [res] = await pool.query(
    `UPDATE loyalty_accounts la
     SET la.card_id = (SELECT c.id FROM loyalty_cards c WHERE c.owner_id = la.owner_id ORDER BY c.position, c.created_at LIMIT 1)
     WHERE la.card_id IS NULL`
  );
  return { created: owners.length, attached: res.affectedRows || 0 };
}

/** Nom d'un article (pour « Barbe offerte »). */
async function itemNames(pairs) {
  const out = {};
  for (const kind of KINDS) {
    const ids = [...new Set(pairs.filter((p) => p.kind === kind && p.id).map((p) => p.id))];
    if (!ids.length) continue;
    const [rows] = await pool.query(`SELECT id, name FROM ${KIND_TABLE[kind]} WHERE id IN (?)`, [ids]);
    rows.forEach((r) => { out[kind + ':' + r.id] = r.name; });
  }
  return out;
}

function tierLabel(t) {
  if (t.reward === 'service_pct') return '−' + t.pct + ' % sur une prestation';
  if (t.reward === 'product_pct') return '−' + t.pct + ' % sur un produit';
  return (t.free_item_name || 'Article') + ' offert';
}

/**
 * Cartes d'une enseigne, avec paliers et articles. opts.publishedOnly : seulement les cartes publiées ;
 * opts.withImage : inclut l'image (lourde) de la carte.
 */
async function cardsForOwner(ownerId, opts) {
  opts = opts || {};
  const [cards] = await pool.query(
    `SELECT id, name, published, auto_on_signup, scope_all, uses_salon_image, position${opts.withImage ? ', image_url' : ', (image_url IS NOT NULL AND image_url <> \'\') AS has_image'}
     FROM loyalty_cards WHERE owner_id = ?${opts.publishedOnly ? ' AND published = 1' : ''} ORDER BY position, created_at`, [ownerId]);
  if (!cards.length && !opts._retried) {
    // Enseigne créée après le démarrage : elle reçoit sa première carte (comme toutes les autres).
    const [[any]] = await pool.query('SELECT COUNT(*) AS n FROM loyalty_cards WHERE owner_id = ?', [ownerId]);
    if (!Number(any.n)) { await ensureDefaultCards(); return cardsForOwner(ownerId, Object.assign({}, opts, { _retried: true })); }
  }
  if (!cards.length) return [];
  const ids = cards.map((c) => c.id);
  const [[tiers], [items]] = await Promise.all([
    pool.query('SELECT * FROM loyalty_card_tiers WHERE card_id IN (?) ORDER BY points, position', [ids]),
    pool.query('SELECT card_id, kind, item_id FROM loyalty_card_items WHERE card_id IN (?)', [ids])
  ]);
  const names = await itemNames(tiers.filter((t) => t.reward === 'free_item').map((t) => ({ kind: t.free_item_kind, id: t.free_item_id })));
  return cards.map((c) => ({
    id: c.id, name: c.name, published: Boolean(c.published), auto_on_signup: Boolean(c.auto_on_signup),
    scope_all: Boolean(c.scope_all), uses_salon_image: Boolean(c.uses_salon_image), position: c.position,
    image_url: opts.withImage ? (c.image_url || null) : undefined, has_image: opts.withImage ? Boolean(c.image_url) : Boolean(c.has_image),
    tiers: tiers.filter((t) => t.card_id === c.id).map((t) => {
      const o = { id: t.id, points: t.points, reward: t.reward, pct: t.pct, free_item_kind: t.free_item_kind, free_item_id: t.free_item_id,
        free_item_name: t.reward === 'free_item' ? (names[t.free_item_kind + ':' + t.free_item_id] || null) : null };
      o.label = tierLabel(o);
      return o;
    }),
    items: items.filter((i) => i.card_id === c.id).map((i) => ({ kind: i.kind, id: i.item_id }))
  }));
}

async function ownerOfSalon(salonId) {
  const [[s]] = await pool.query('SELECT owner_id FROM salons WHERE id = ?', [salonId]);
  return s ? s.owner_id : null;
}

async function cardsForSalon(salonId, opts) {
  const ownerId = await ownerOfSalon(salonId);
  return ownerId ? cardsForOwner(ownerId, opts) : [];
}

/** La carte rapporte-t-elle un point pour ces articles ? (tous les articles, ou au moins un article coché) */
function cardMatches(card, items) {
  if (card.scope_all) return true;
  const set = new Set(card.items.map((i) => i.kind + ':' + i.id));
  return (items || []).some((it) => it && it.item_id && set.has((it.item_type || it.kind) + ':' + it.item_id));
}

/** Paliers atteints avec ces points. */
function availableTiers(card, points) {
  const p = Number(points) || 0;
  return card.tiers.filter((t) => p >= t.points);
}

/** Résumé d'une carte d'un client (pour la caisse, le dashboard, l'espace client). */
function accountView(card, account) {
  return {
    card_id: card.id, name: card.name, points: account.points, activated: Boolean(account.activated_at),
    account_id: account.id, tiers: card.tiers, available: availableTiers(card, account.points).map((t) => t.id)
  };
}

/** Comptes de fidélité (toutes cartes) d'un client dans un salon, avec leur carte. */
async function clientCards(salonId, key, opts) {
  opts = opts || {};
  if (!key) return [];
  const cards = await cardsForSalon(salonId);
  let [accounts] = await pool.query('SELECT id, card_id, points, activated_at, disabled_by FROM loyalty_accounts WHERE salon_id = ? AND client_key = ?', [salonId, key]);
  if (accounts.some((a) => !a.card_id)) {
    await ensureDefaultCards();
    [accounts] = await pool.query('SELECT id, card_id, points, activated_at, disabled_by FROM loyalty_accounts WHERE salon_id = ? AND client_key = ?', [salonId, key]);
  }
  const out = [];
  // Espace client : dès que le client a (ou a eu) une carte, TOUTES les cartes publiées apparaissent ;
  // il active / désactive lui-même celles qu'il veut (sauf une carte désactivée par le salon).
  const member = opts.forClient && accounts.length > 0;
  // Détails pour le client (bouton « i ») : noms des articles qui rapportent des points.
  const names = member ? await itemNames([].concat(...cards.filter((c) => !c.scope_all).map((c) => c.items))) : {};
  cards.forEach((card) => {
    const acc = accounts.find((a) => a.card_id === card.id);
    const extra = { published: card.published, scope_all: card.scope_all, uses_salon_image: card.uses_salon_image, has_image: card.has_image, rule: ruleText(card) };
    if (member) extra.earn_items = card.scope_all ? [] : card.items.map((i) => ({ kind: i.kind, name: names[i.kind + ':' + i.id] })).filter((i) => i.name);
    if (acc && (acc.activated_at || opts.includeInactive || member)) {
      out.push(Object.assign(accountView(card, acc), extra, { locked: acc.disabled_by === 'admin' }));
    } else if (!acc && member && card.published) {
      out.push(Object.assign({ card_id: card.id, name: card.name, points: 0, activated: false, account_id: null, tiers: card.tiers, available: [] }, extra, { locked: false }));
    }
  });
  return out;
}

/**
 * Le client active ou désactive une carte depuis son compte. Les points sont gardés quand il désactive.
 * Une carte désactivée par le salon (admin) ne peut pas être réactivée par le client.
 */
async function clientSetCard(salonId, key, client, cardId, on) {
  const ownerId = await ownerOfSalon(salonId);
  const cards = ownerId ? await cardsForOwner(ownerId, { publishedOnly: true }) : [];
  const card = cards.find((c) => c.id === cardId);
  if (!card) throw Object.assign(new Error('Carte introuvable'), { status: 404 });
  const [accounts] = await pool.query('SELECT id, card_id, activated_at, disabled_by FROM loyalty_accounts WHERE salon_id = ? AND client_key = ?', [salonId, key]);
  if (!accounts.length) throw Object.assign(new Error('Votre fidélité n\'est pas encore activée : demandez à votre coiffeur lors de votre prochain passage'), { status: 403 });
  const acc = accounts.find((a) => a.card_id === card.id);
  if (acc && acc.disabled_by === 'admin') throw Object.assign(new Error('Cette carte a été désactivée par le salon'), { status: 403 });
  if (on) {
    if (acc) await pool.query('UPDATE loyalty_accounts SET activated_at = COALESCE(activated_at, NOW()), disabled_by = NULL WHERE id = ?', [acc.id]);
    else {
      try {
        await pool.query(
          `INSERT INTO loyalty_accounts (id, owner_id, salon_id, card_id, client_key, client_name, recipient_email, activated_at)
           VALUES (UUID(), ?, ?, ?, ?, ?, ?, NOW())`, [ownerId, salonId, card.id, key, client.name || '', client.email || null]);
      } catch (err) { if (!(err && err.code === 'ER_DUP_ENTRY')) throw err; }
    }
  } else if (acc && acc.activated_at) {
    await pool.query("UPDATE loyalty_accounts SET activated_at = NULL, disabled_by = 'client' WHERE id = ?", [acc.id]);
  }
  return card;
}

/**
 * +1 point par passage payé sur chaque carte activée ET publiée du client dont un article coché est sur le ticket.
 * items : lignes du ticket de CE client ({ item_type, item_id }). Sans lignes connues (cadeau utilisé...) : les
 * cartes « tous les articles » seulement, plus celles qui cochent la prestation du passage.
 */
async function earnPoints(salonId, row, items) {
  const { clientKey } = require('./queueMath');
  const key = clientKey(row);
  if (!key) return 0;
  let [accounts] = await pool.query(
    'SELECT id, card_id FROM loyalty_accounts WHERE salon_id = ? AND client_key = ? AND activated_at IS NOT NULL', [salonId, key]);
  if (!accounts.length) return 0;
  if (accounts.some((a) => !a.card_id)) {   // compte créé sans carte (ancien code) : rattaché à la 1re carte
    await ensureDefaultCards();
    [accounts] = await pool.query('SELECT id, card_id FROM loyalty_accounts WHERE salon_id = ? AND client_key = ? AND activated_at IS NOT NULL', [salonId, key]);
  }
  const cards = await cardsForSalon(salonId, { publishedOnly: true });
  const lines = (items && items.length) ? items : (row.service_id ? [{ item_type: 'service', item_id: row.service_id }] : []);
  let n = 0;
  for (const acc of accounts) {
    const card = cards.find((c) => c.id === acc.card_id);
    if (!card || !cardMatches(card, lines)) continue;
    await pool.query('UPDATE loyalty_accounts SET points = points + 1, client_name = ?, updated_at = NOW() WHERE id = ?', [row.client_name, acc.id]);
    n++;
  }
  return n;
}

/**
 * Utilise un palier : retire ses points de la carte du client (s'il les a). redeem = { card_id, tier_id }, ou
 * l'ancien format 'service' / 'product' (caisse pas encore rechargée) : 1er palier de ce type de la 1re carte.
 */
async function redeem(salonId, key, redeemReq) {
  if (!key || !redeemReq) return false;
  const cards = await cardsForSalon(salonId);
  let card, tier;
  if (typeof redeemReq === 'string') {
    const reward = redeemReq === 'product' ? 'product_pct' : 'service_pct';
    card = cards[0];
    tier = card && card.tiers.find((t) => t.reward === reward);
  } else {
    card = cards.find((c) => c.id === redeemReq.card_id);
    tier = card && card.tiers.find((t) => t.id === redeemReq.tier_id);
  }
  if (!card || !tier) return false;
  await pool.query('UPDATE loyalty_accounts SET card_id = ? WHERE salon_id = ? AND client_key = ? AND card_id IS NULL', [cards[0].id, salonId, key]);
  const [r] = await pool.query(
    `UPDATE loyalty_accounts SET points = points - ?, updated_at = NOW()
     WHERE salon_id = ? AND client_key = ? AND card_id = ? AND points >= ?`,
    [tier.points, salonId, key, card.id, tier.points]);
  return r.affectedRows > 0;
}

/** Texte des règles d'une carte (email d'activation). */
function ruleText(card) {
  const tiers = card.tiers.map((t) => t.points + ' point' + (t.points > 1 ? 's' : '') + ' : ' + t.label).join(' · ');
  return (card.scope_all ? '' : 'Points gagnés sur certains articles seulement. ') + (tiers ? 'Récompenses — ' + tiers + '.' : '');
}

/** Valide et enregistre une carte (création ou modification). Renvoie l'id. */
async function saveCard(ownerId, body, cardId) {
  const name = String(body.name || '').trim().slice(0, 120);
  if (!name) throw Object.assign(new Error('Donnez un nom à la carte'), { status: 400 });
  const tiersIn = Array.isArray(body.tiers) ? body.tiers.slice(0, 20) : [];
  if (!tiersIn.length) throw Object.assign(new Error('Ajoutez au moins un palier'), { status: 400 });
  const tiers = tiersIn.map((t, i) => {
    const points = Number(t.points);
    if (!Number.isInteger(points) || points < 1 || points > 100000) throw Object.assign(new Error('Palier ' + (i + 1) + ' : le nombre de points doit être un entier d\'au moins 1'), { status: 400 });
    if (!REWARDS.includes(t.reward)) throw Object.assign(new Error('Palier ' + (i + 1) + ' : récompense inconnue'), { status: 400 });
    const o = { id: (typeof t.id === 'string' && /^[0-9a-f-]{36}$/i.test(t.id)) ? t.id : crypto.randomUUID(), points, reward: t.reward, pct: null, kind: null, item: null };
    if (t.reward === 'free_item') {
      if (!KINDS.includes(t.free_item_kind) || typeof t.free_item_id !== 'string' || !t.free_item_id) throw Object.assign(new Error('Palier ' + (i + 1) + ' : choisissez l\'article offert'), { status: 400 });
      o.kind = t.free_item_kind; o.item = t.free_item_id.slice(0, 60);
    } else {
      const pct = Number(t.pct);
      if (!Number.isInteger(pct) || pct < 1 || pct > 100) throw Object.assign(new Error('Palier ' + (i + 1) + ' : la remise doit être entre 1 et 100 %'), { status: 400 });
      o.pct = pct;
    }
    return o;
  });
  const scopeAll = body.scope_all !== false;
  const items = scopeAll ? [] : (Array.isArray(body.items) ? body.items : [])
    .filter((i) => i && KINDS.includes(i.kind) && typeof i.id === 'string' && i.id).slice(0, 500);
  if (!scopeAll && !items.length) throw Object.assign(new Error('Cochez au moins un article qui rapporte des points (ou choisissez « Tous les articles »)'), { status: 400 });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    let id = cardId;
    if (id) {
      const [[c]] = await conn.query('SELECT id FROM loyalty_cards WHERE id = ? AND owner_id = ?', [id, ownerId]);
      if (!c) throw Object.assign(new Error('Carte introuvable'), { status: 404 });
      const sets = ['name = ?', 'published = ?', 'auto_on_signup = ?', 'scope_all = ?'];
      const params = [name, body.published === false ? 0 : 1, body.auto_on_signup ? 1 : 0, scopeAll ? 1 : 0];
      if (body.image_url !== undefined) { sets.push('image_url = ?', 'uses_salon_image = 0'); params.push(body.image_url ? String(body.image_url).slice(0, 3000000) : null); }
      await conn.query('UPDATE loyalty_cards SET ' + sets.join(', ') + ' WHERE id = ?', params.concat([id]));
    } else {
      id = crypto.randomUUID();
      const [[pos]] = await conn.query('SELECT COALESCE(MAX(position), -1) + 1 AS p FROM loyalty_cards WHERE owner_id = ?', [ownerId]);
      await conn.query(
        'INSERT INTO loyalty_cards (id, owner_id, name, published, auto_on_signup, scope_all, image_url, position) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [id, ownerId, name, body.published === false ? 0 : 1, body.auto_on_signup ? 1 : 0, scopeAll ? 1 : 0, body.image_url ? String(body.image_url).slice(0, 3000000) : null, pos.p]);
    }
    // Paliers : ceux qui gardent leur id restent les mêmes (une remise déjà proposée en caisse reste valable).
    // Un id qui n'appartient pas à CETTE carte est remplacé par un nouveau (jamais de palier d'une autre carte modifié).
    const [own] = await conn.query('SELECT id FROM loyalty_card_tiers WHERE card_id = ?', [id]);
    const ownIds = new Set(own.map((r) => r.id));
    tiers.forEach((t) => { if (!ownIds.has(t.id)) t.id = crypto.randomUUID(); });
    await conn.query('DELETE FROM loyalty_card_tiers WHERE card_id = ? AND id NOT IN (?)', [id, tiers.map((t) => t.id)]);
    for (const [i, t] of tiers.entries()) {
      await conn.query(
        `INSERT INTO loyalty_card_tiers (id, card_id, position, points, reward, pct, free_item_kind, free_item_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE position = VALUES(position), points = VALUES(points), reward = VALUES(reward), pct = VALUES(pct),
           free_item_kind = VALUES(free_item_kind), free_item_id = VALUES(free_item_id)`,
        [t.id, id, i, t.points, t.reward, t.pct, t.kind, t.item]);
    }
    await conn.query('DELETE FROM loyalty_card_items WHERE card_id = ?', [id]);
    if (items.length) {
      await conn.query('INSERT IGNORE INTO loyalty_card_items (card_id, kind, item_id) VALUES ?', [items.map((i) => [id, i.kind, i.id.slice(0, 60)])]);
    }
    await conn.commit();
    return id;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

module.exports = {
  REWARDS, ensureDefaultCards, cardsForOwner, cardsForSalon, cardMatches, availableTiers, accountView,
  clientCards, clientSetCard, earnPoints, redeem, ruleText, saveCard, tierLabel
};
