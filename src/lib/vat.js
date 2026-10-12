'use strict';

// TVA nommées par article.
// - L'admin gère une liste de taux (nom + %), dans Réglages > TVA.
// - Chaque prestation / supplément / produit pointe vers un taux
//   (vat_rate_id). Sans choix, c'est le premier taux de la liste.
// - Au premier accès d'un salon, la liste est créée à partir des anciens
//   réglages par catégorie (vat_rate_service/extra/product) et chaque
//   article reprend automatiquement le taux de sa catégorie.

const crypto = require('crypto');
const { pool, getSettings } = require('../db');

const TABLES = { service: 'services', extra: 'extras', product: 'products' };
const LEGACY_KEYS = { service: 'vat_rate_service', extra: 'vat_rate_extra', product: 'vat_rate_product' };

function legacyRate(settings, type) {
  const raw = settings[LEGACY_KEYS[type]];
  return (raw !== undefined && raw !== null && raw !== '') ? Number(raw) : 20;
}

function fmtRate(n) {
  return String(Number(n)).replace('.', ',');
}

async function seedFromLegacy(salonId) {
  const settings = await getSettings(salonId);
  const rates = [];
  const idByRate = {};
  for (const type of ['service', 'extra', 'product']) {
    const r = legacyRate(settings, type);
    if (!Number.isFinite(r)) continue;
    if (idByRate[r] === undefined) {
      idByRate[r] = crypto.randomUUID();
      rates.push({ id: idByRate[r], rate: r });
    }
  }
  for (let i = 0; i < rates.length; i++) {
    await pool.query(
      'INSERT INTO vat_rates (id, salon_id, name, rate, sort_order) VALUES (?, ?, ?, ?, ?)',
      [rates[i].id, salonId, 'TVA ' + fmtRate(rates[i].rate) + ' %', rates[i].rate, i]
    );
  }
  for (const type of ['service', 'extra', 'product']) {
    const r = legacyRate(settings, type);
    await pool.query(
      `UPDATE ${TABLES[type]} SET vat_rate_id = ? WHERE salon_id = ? AND vat_rate_id IS NULL`,
      [idByRate[r], salonId]
    );
  }
}

/** Liste des taux du salon (créée à la volée au premier accès). */
async function getVatRates(salonId) {
  let [rows] = await pool.query('SELECT id, name, rate, sort_order FROM vat_rates WHERE salon_id = ? ORDER BY sort_order, name', [salonId]);
  if (!rows.length) {
    await seedFromLegacy(salonId);
    [rows] = await pool.query('SELECT id, name, rate, sort_order FROM vat_rates WHERE salon_id = ? ORDER BY sort_order, name', [salonId]);
  }
  return rows.map((r) => ({ id: r.id, name: r.name, rate: Number(r.rate), sort_order: r.sort_order }));
}

/** Taux d'un article (number), avec repli sur le premier taux de la liste. */
function rateForItem(rates, vatRateId) {
  const found = vatRateId ? rates.find((r) => r.id === vatRateId) : null;
  if (found) return found.rate;
  return rates.length ? rates[0].rate : 20;
}

/** Ajoute vat_rate (nombre) et vat_rate_name à chaque article d'une liste. */
async function annotateItems(salonId, items) {
  const rates = await getVatRates(salonId);
  return items.map((it) => {
    const found = it.vat_rate_id ? rates.find((r) => r.id === it.vat_rate_id) : null;
    const eff = found || rates[0] || null;
    return Object.assign({}, it, {
      vat_rate_id: found ? found.id : (eff ? eff.id : null),
      vat_rate: eff ? eff.rate : 20,
      vat_rate_name: eff ? eff.name : ''
    });
  });
}

/** Valide un vat_rate_id reçu : '' -> null, inconnu -> undefined (erreur). */
async function normalizeVatRateId(salonId, value) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const [[row]] = await pool.query('SELECT id FROM vat_rates WHERE id = ? AND salon_id = ?', [String(value), salonId]);
  return row ? row.id : false;
}

module.exports = { getVatRates, rateForItem, annotateItems, normalizeVatRateId, TABLES };
