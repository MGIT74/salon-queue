/**
 * Crédit produits des coiffeurs.
 *
 * - Recharge : à la caisse, comme une vente normale (ligne « Crédit produits · Prénom » qui porte
 *   credit_barber_id, voir sales.js) -> mouvement +montant lié à la vente.
 * - Prise d'un produit : depuis « Mon poste », par le coiffeur connecté avec SON code PIN (jamais
 *   « pour » un collègue) : le stock baisse de 1 et son crédit du prix du produit. Bloqué à 0 €.
 *   Seul l'admin peut annuler une prise (stock et crédit rendus).
 * - Coiffeur « gratuit » (réglé par l'admin) : ses produits sont offerts, pas de recharge ; seul le stock baisse.
 * - Admin : soldes, historique, réglages (catégories de produits autorisées, seuil d'alerte, coiffeurs gratuits).
 */
const express = require('express');
const crypto = require('crypto');
const { pool, utcIso, getSettings, setSettings } = require('../db');
const requireAdmin = require('../middleware/auth');
const requireAdminOrBarber = require('../middleware/barberAuth');
const { logActivity } = require('../lib/activityLog');
const { wrap } = require('../lib/wrap');

const router = express.Router();

async function creditSettings(salonId) {
  const s = await getSettings(salonId);
  let cats = [];
  try { cats = JSON.parse(s.barber_credit_categories || '[]'); } catch (e) { cats = []; }
  if (!Array.isArray(cats)) cats = [];
  const alert = Number(s.barber_credit_alert_cents);
  let free = [];
  try { free = JSON.parse(s.barber_credit_free || '[]'); } catch (e) { free = []; }
  if (!Array.isArray(free)) free = [];
  let discounts = {};
  try { discounts = JSON.parse(s.barber_credit_discounts || '{}'); } catch (e) { discounts = {}; }
  if (!discounts || typeof discounts !== 'object' || Array.isArray(discounts)) discounts = {};
  return { categories: cats.filter((c) => typeof c === 'string'), alert_cents: Number.isInteger(alert) && alert >= 0 ? alert : 300,
    free: free.filter((c) => typeof c === 'string'), discounts };
}

/** Remise du coiffeur (0 à 100 %) sur les produits pris avec son crédit. */
function discountOf(st, barberId) {
  const d = Number(st.discounts[barberId]);
  return Number.isInteger(d) && d > 0 && d <= 100 ? d : 0;
}
/** Prix payé par le coiffeur avec sa remise (arrondi au centime). */
function priceFor(priceCents, pct) {
  return pct ? Math.round(priceCents * (100 - pct) / 100) : priceCents;
}

async function balanceOf(db, salonId, barberId) {
  const [[r]] = await db.query(
    'SELECT COALESCE(SUM(amount_cents), 0) AS bal FROM barber_credit_moves WHERE salon_id = ? AND barber_id = ? AND undone_at IS NULL',
    [salonId, barberId]);
  return Number(r.bal);
}

/** Produits qu'un coiffeur peut prendre avec son crédit (actifs, dans les catégories choisies ; aucune = tous). */
// Catégorie autorisée ? Les cases de l'admin enregistrent l'identifiant de la catégorie (catalog_categories) ;
// l'ancien texte « category » du produit reste accepté (anciens réglages).
function inCreditCats(cats, p) {
  return !cats.length || (p.category_id && cats.indexOf(p.category_id) !== -1) || (p.category && cats.indexOf(p.category) !== -1);
}

async function allowedProducts(salonId, cats) {
  const [rows] = await pool.query(
    'SELECT id, name, price_cents, category, category_id, stock_enabled, stock_quantity, barcode FROM products WHERE salon_id = ? AND active = 1 ORDER BY sort_order, name',
    [salonId]);
  return rows.filter((p) => inCreditCats(cats, p)).map((p) => ({
    id: p.id, name: p.name, price_cents: p.price_cents, category: p.category,
    stock_enabled: Boolean(p.stock_enabled), stock_quantity: p.stock_quantity, barcode: p.barcode || null
  }));
}

function moveView(m) {
  return {
    id: m.id, kind: m.kind, amount_cents: m.amount_cents, value_cents: m.value_cents, product_id: m.product_id, product_name: m.product_name,
    note: m.note, undone: Boolean(m.undone_at), created_at: utcIso(m.created_at),
    can_undo: (m.kind === 'take' || m.kind === 'free') && !m.undone_at   // par l'admin seulement
  };
}

function needBarber(req, res) {
  if (!req.barberId) { res.status(403).json({ error: 'Connectez-vous à votre poste avec votre code.' }); return false; }
  return true;
}

// ---- Mon poste ----
router.get('/me', requireAdminOrBarber, wrap(async (req, res) => {
  if (!needBarber(req, res)) return;
  const st = await creditSettings(req.salon.id);
  const [moves] = await pool.query(
    'SELECT * FROM barber_credit_moves WHERE salon_id = ? AND barber_id = ? ORDER BY created_at DESC LIMIT 15', [req.salon.id, req.barberId]);
  res.json({
    ok: true,
    balance_cents: await balanceOf(pool, req.salon.id, req.barberId),
    alert_cents: st.alert_cents,
    free: st.free.indexOf(req.barberId) !== -1,
    discount_pct: discountOf(st, req.barberId),
    // Prix pour CE coiffeur (avec sa remise) ; price_cents reste le prix normal du produit.
    products: (await allowedProducts(req.salon.id, st.categories)).map((p) => Object.assign(p, { my_price_cents: priceFor(p.price_cents, discountOf(st, req.barberId)) })),
    moves: moves.map(moveView)
  });
}));

router.post('/take', requireAdminOrBarber, wrap(async (req, res) => {
  if (!needBarber(req, res)) return;
  const productId = typeof req.body.product_id === 'string' ? req.body.product_id.slice(0, 36) : '';
  const st = await creditSettings(req.salon.id);
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    // Verrou sur le coiffeur : deux prises en même temps ne peuvent pas passer sous 0 €.
    await conn.query('SELECT id FROM barbers WHERE id = ? AND salon_id = ? FOR UPDATE', [req.barberId, req.salon.id]);
    const [[p]] = await conn.query(
      'SELECT id, name, price_cents, category, category_id, stock_enabled, stock_quantity FROM products WHERE id = ? AND salon_id = ? AND active = 1 FOR UPDATE',
      [productId, req.salon.id]);
    if (!p || !inCreditCats(st.categories, p)) {
      await conn.rollback();
      return res.status(404).json({ error: 'Ce produit ne se prend pas avec le crédit.' });
    }
    if (p.stock_enabled && p.stock_quantity < 1) {
      await conn.rollback();
      return res.status(409).json({ error: 'Plus de « ' + p.name + ' » en stock.' });
    }
    const free = st.free.indexOf(req.barberId) !== -1;   // produits offerts : seul le stock baisse
    const pct = discountOf(st, req.barberId);
    const pay = priceFor(p.price_cents, pct);   // prix réduit du coiffeur
    const bal = await balanceOf(conn, req.salon.id, req.barberId);
    if (!free && bal < pay) {
      await conn.rollback();
      return res.status(409).json({ error: 'Crédit insuffisant (' + (bal / 100).toFixed(2).replace('.', ',') + ' €) : rechargez à la caisse.', code: 'no_credit' });
    }
    if (p.stock_enabled) await conn.query('UPDATE products SET stock_quantity = stock_quantity - 1 WHERE id = ?', [p.id]);
    const id = crypto.randomUUID();
    await conn.query(
      'INSERT INTO barber_credit_moves (id, salon_id, barber_id, kind, amount_cents, product_id, product_name, value_cents, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, req.salon.id, req.barberId, free ? 'free' : 'take', free ? 0 : -pay, p.id, p.name, p.price_cents, !free && pct ? 'Remise ' + pct + ' %' : null]);
    await conn.commit();
    res.json({ ok: true, move_id: id, free, discount_pct: free ? 0 : pct, product: { id: p.id, name: p.name, price_cents: p.price_cents, paid_cents: free ? 0 : pay }, balance_cents: free ? bal : bal - pay });
  } catch (err) {
    try { await conn.rollback(); } catch (e) {}
    throw err;
  } finally { conn.release(); }
}));

// Annuler une prise (erreur, produit rendu) : par l'ADMIN seulement, depuis Coiffeurs > Crédit produits > Historique.
// Le stock est rendu, et le crédit aussi (rien à rendre pour un produit offert).
router.post('/moves/:id/undo', requireAdmin, wrap(async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[m]] = await conn.query(
      "SELECT * FROM barber_credit_moves WHERE id = ? AND salon_id = ? AND kind IN ('take', 'free') FOR UPDATE",
      [req.params.id, req.salon.id]);
    if (!m || m.undone_at) { await conn.rollback(); return res.status(404).json({ error: 'Rien à annuler.' }); }
    await conn.query('UPDATE barber_credit_moves SET undone_at = NOW() WHERE id = ?', [m.id]);
    if (m.product_id) await conn.query('UPDATE products SET stock_quantity = stock_quantity + 1 WHERE id = ? AND salon_id = ? AND stock_enabled = 1', [m.product_id, req.salon.id]);
    await conn.commit();
    const [[b]] = await pool.query('SELECT name FROM barbers WHERE id = ?', [m.barber_id]);
    logActivity(req.salon.id, 'barber_credit_undo', 'Crédit produits : ' + (m.product_name || 'produit') + ' de ' + (b ? b.name : 'coiffeur') + ' annulé (remis en stock)');
    res.json({ ok: true, balance_cents: await balanceOf(pool, req.salon.id, m.barber_id) });
  } catch (err) {
    try { await conn.rollback(); } catch (e) {}
    throw err;
  } finally { conn.release(); }
}));

// ---- Caisse (soldes pour choisir qui recharger) et dashboard ----
router.get('/balances', requireAdminOrBarber, wrap(async (req, res) => {
  const [rows] = await pool.query(
    `SELECT b.id, b.name, b.active,
       COALESCE((SELECT SUM(m.amount_cents) FROM barber_credit_moves m WHERE m.salon_id = b.salon_id AND m.barber_id = b.id AND m.undone_at IS NULL), 0) AS balance_cents
     FROM barbers b WHERE b.salon_id = ? ORDER BY b.sort_order, b.name`, [req.salon.id]);
  const st = await creditSettings(req.salon.id);
  res.json({ ok: true, alert_cents: st.alert_cents, items: rows.filter((r) => r.active || Number(r.balance_cents) !== 0).map((r) => ({ id: r.id, name: r.name, active: Boolean(r.active), free: st.free.indexOf(r.id) !== -1, balance_cents: Number(r.balance_cents) })) });
}));

router.get('/overview', requireAdmin, wrap(async (req, res) => {
  const [rows] = await pool.query(
    `SELECT b.id, b.name, b.active,
       COALESCE(SUM(CASE WHEN m.undone_at IS NULL THEN m.amount_cents END), 0) AS balance_cents,
       COALESCE(SUM(CASE WHEN m.undone_at IS NULL AND m.kind = 'take' AND m.created_at >= DATE_FORMAT(UTC_TIMESTAMP(), '%Y-%m-01') THEN -m.amount_cents END), 0) AS month_taken_cents,
       COALESCE(SUM(CASE WHEN m.undone_at IS NULL AND m.kind = 'free' AND m.created_at >= DATE_FORMAT(UTC_TIMESTAMP(), '%Y-%m-01') THEN m.value_cents END), 0) AS month_free_cents,
       COALESCE(SUM(CASE WHEN m.undone_at IS NULL AND m.kind IN ('take', 'free') AND m.created_at >= DATE_FORMAT(UTC_TIMESTAMP(), '%Y-%m-01') THEN 1 END), 0) AS month_taken_count,
       COALESCE(SUM(CASE WHEN m.undone_at IS NULL AND m.kind = 'recharge' AND m.created_at >= DATE_FORMAT(UTC_TIMESTAMP(), '%Y-%m-01') THEN m.amount_cents END), 0) AS month_recharged_cents,
       MAX(CASE WHEN m.kind IN ('take', 'free') AND m.undone_at IS NULL THEN m.created_at END) AS last_take_at
     FROM barbers b LEFT JOIN barber_credit_moves m ON m.salon_id = b.salon_id AND m.barber_id = b.id
     WHERE b.salon_id = ? GROUP BY b.id, b.name, b.active ORDER BY b.name`, [req.salon.id]);
  const st = await creditSettings(req.salon.id);
  res.json({
    ok: true, settings: st,
    items: rows.filter((r) => r.active || Number(r.balance_cents) !== 0).map((r) => ({
      id: r.id, name: r.name, active: Boolean(r.active), free: st.free.indexOf(r.id) !== -1, discount_pct: discountOf(st, r.id), balance_cents: Number(r.balance_cents),
      month_taken_cents: Number(r.month_taken_cents), month_free_cents: Number(r.month_free_cents), month_taken_count: Number(r.month_taken_count),
      month_recharged_cents: Number(r.month_recharged_cents), last_take_at: r.last_take_at ? utcIso(r.last_take_at) : null
    }))
  });
}));

router.get('/moves', requireAdmin, wrap(async (req, res) => {
  const [rows] = await pool.query(
    'SELECT * FROM barber_credit_moves WHERE salon_id = ? AND barber_id = ? ORDER BY created_at DESC LIMIT 100',
    [req.salon.id, String(req.query.barber_id || '')]);
  res.json({ ok: true, items: rows.map(moveView) });
}));

router.put('/settings', requireAdmin, wrap(async (req, res) => {
  const cats = Array.isArray(req.body.categories) ? req.body.categories.filter((c) => typeof c === 'string').slice(0, 50) : [];
  const alert = Math.round(Number(req.body.alert_cents));
  if (!Number.isInteger(alert) || alert < 0 || alert > 100000) return res.status(400).json({ error: 'Seuil d\'alerte invalide' });
  await setSettings(req.salon.id, { barber_credit_categories: JSON.stringify(cats), barber_credit_alert_cents: alert });
  res.json({ ok: true });
}));

// Coiffeur « gratuit » : ses produits sont offerts (pas de recharge, son crédit ne bouge pas, seul le stock baisse).
router.put('/free/:barberId', requireAdmin, wrap(async (req, res) => {
  const [[b]] = await pool.query('SELECT id, name FROM barbers WHERE id = ? AND salon_id = ?', [req.params.barberId, req.salon.id]);
  if (!b) return res.status(404).json({ error: 'Coiffeur introuvable' });
  const st = await creditSettings(req.salon.id);
  const on = req.body.free === true;
  const free = st.free.filter((x) => x !== b.id).concat(on ? [b.id] : []);
  await setSettings(req.salon.id, { barber_credit_free: JSON.stringify(free) });
  logActivity(req.salon.id, 'barber_credit_free', 'Crédit produits : ' + b.name + (on ? ' prend ses produits gratuitement' : ' paie de nouveau ses produits avec son crédit'));
  res.json({ ok: true, free: on });
}));

// Remise du coiffeur sur les produits pris avec son crédit (prix réduit pour le personnel), 0 = prix normal.
router.put('/discount/:barberId', requireAdmin, wrap(async (req, res) => {
  const [[b]] = await pool.query('SELECT id, name FROM barbers WHERE id = ? AND salon_id = ?', [req.params.barberId, req.salon.id]);
  if (!b) return res.status(404).json({ error: 'Coiffeur introuvable' });
  const pct = Math.round(Number(req.body.pct));
  if (!Number.isInteger(pct) || pct < 0 || pct > 100) return res.status(400).json({ error: 'Remise entre 0 et 100 %' });
  const st = await creditSettings(req.salon.id);
  const discounts = Object.assign({}, st.discounts);
  if (pct) discounts[b.id] = pct; else delete discounts[b.id];
  await setSettings(req.salon.id, { barber_credit_discounts: JSON.stringify(discounts) });
  logActivity(req.salon.id, 'barber_credit_discount', 'Crédit produits : remise de ' + b.name + ' = ' + pct + ' %');
  res.json({ ok: true, pct });
}));

module.exports = router;
module.exports.balanceOf = balanceOf;
