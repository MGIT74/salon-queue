'use strict';
/**
 * Le client a-t-il un compte client dans ce salon ?
 * Un RDV / un passage n'est pas relié au compte : on rapproche par l'EMAIL (comme la fidélité et le dashboard),
 * sinon par le TÉLÉPHONE du compte (9 derniers chiffres). Un proche (« Mes proches » : enfant...) réserve avec
 * l'email / le téléphone du parent : si le prénom réservé est un de ses proches, c'est « proche de <parent> ».
 *
 * Résultat : { kind: 'account' | 'relative' | 'none' | 'unknown', holder_name, created_at, email_verified, relative_name }
 *  - unknown : ni email ni téléphone, impossible de savoir.
 */
const { pool, utcIso } = require('../db');

const digits = (p) => String(p || '').replace(/\D/g, '');
const phoneKey = (p) => { const d = digits(p); return d.length >= 9 ? d.slice(-9) : ''; };
const firstWord = (s) => String(s || '').trim().split(/\s+/)[0].toLowerCase();

/** Comptes du salon, indexés par email et par téléphone (+ leurs proches). */
async function loadSalonAccounts(salonId) {
  const [rows] = await pool.query(
    'SELECT id, name, email, phone, email_verified, created_at FROM clients WHERE salon_id = ?', [salonId]);
  const byEmail = new Map(), byPhone = new Map(), byId = new Map();
  rows.forEach((c) => {
    byId.set(c.id, c);
    const e = String(c.email || '').trim().toLowerCase();
    if (e) byEmail.set(e, c);
    const p = phoneKey(c.phone);
    if (p && !byPhone.has(p)) byPhone.set(p, c);
  });
  const relatives = new Map();   // client_id -> [prénoms en minuscules]
  if (rows.length) {
    const [rels] = await pool.query('SELECT client_id, name FROM client_relatives WHERE client_id IN (?)', [rows.map((c) => c.id)]);
    rels.forEach((r) => { if (!relatives.has(r.client_id)) relatives.set(r.client_id, []); relatives.get(r.client_id).push(String(r.name || '').trim().toLowerCase()); });
  }
  return { byEmail, byPhone, byId, relatives };
}

function resolve(idx, contact) {
  const email = String(contact.email || '').trim().toLowerCase();
  const pk = phoneKey(contact.phone);
  if (!email && !pk) return { kind: 'unknown' };
  const acc = (email && idx.byEmail.get(email)) || (pk && idx.byPhone.get(pk)) || null;
  if (!acc) return { kind: 'none' };
  const out = {
    kind: 'account', holder_name: acc.name, created_at: acc.created_at ? utcIso(acc.created_at) : null,
    email_verified: Boolean(acc.email_verified)
  };
  // Réservé pour un proche : le prénom réservé n'est pas celui du titulaire mais celui d'un de ses proches.
  const booked = firstWord(contact.name);
  const rels = idx.relatives.get(acc.id) || [];
  if (booked && booked !== firstWord(acc.name)) {
    const rel = rels.find((r) => r === booked || firstWord(r) === booked);
    if (rel) { out.kind = 'relative'; out.relative_name = String(contact.name || '').trim(); }
  }
  return out;
}

async function accountForContact(salonId, contact) {
  return resolve(await loadSalonAccounts(salonId), contact || {});
}

module.exports = { loadSalonAccounts, resolve, accountForContact, phoneKey };
