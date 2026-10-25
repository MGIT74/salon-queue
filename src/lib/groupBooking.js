/**
 * Reservation a plusieurs : logique pure (sans base de donnees) pour pouvoir la tester a part.
 *
 * - parseHeld : lit la liste de creneaux deja choisis par les AUTRES personnes du groupe (envoyee par le
 *   navigateur a /availability, pour que le creneau d'une personne ne chevauche pas celui d'une autre chez
 *   le meme coiffeur, tant que rien n'est encore enregistre en base).
 * - heldRanges : transforme ces creneaux en plages occupees (minutes) pour un coiffeur et un jour.
 * - normalizePeople : valide et nettoie la liste des personnes d'une reservation de groupe.
 */
const MAX_PEOPLE = 6;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function toMin(t) { const p = String(t).split(':'); return Number(p[0]) * 60 + Number(p[1]); }

// "barberId|2026-10-20|10:30|45,barberId2|2026-10-20|11:15|30" -> [{ barberId, date, start, duration }]
function parseHeld(raw) {
  if (!raw) return [];
  return String(raw).split(',').map((chunk) => chunk.split('|')).filter((p) => p.length === 4)
    .map((p) => ({ barberId: p[0], date: p[1], start: TIME_RE.test(p[2]) ? toMin(p[2]) : NaN, duration: Number(p[3]) }))
    .filter((h) => h.barberId && DATE_RE.test(h.date) && Number.isFinite(h.start) && Number.isFinite(h.duration) && h.duration > 0 && h.duration <= 600)
    .slice(0, MAX_PEOPLE * 2);
}

// Plages [debut, fin + marge] (en minutes) deja prises ce jour-la chez ce coiffeur par le reste du groupe.
function heldRanges(held, barberId, dateStr, bufferMin) {
  return held.filter((h) => String(h.barberId) === String(barberId) && h.date === dateStr)
    .map((h) => [h.start, h.start + h.duration + (Number(bufferMin) || 0)]);
}

function cleanName(v) { return String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, 100); }

/**
 * body.people -> liste propre, ou { error, index } si une personne est invalide.
 * Une personne sans nom prend celui du client qui reserve (cas « moi »).
 */
function normalizePeople(body) {
  const raw = Array.isArray(body && body.people) ? body.people : null;
  if (!raw || raw.length === 0) return { error: 'Ajoutez au moins une personne.', index: -1 };
  if (raw.length > MAX_PEOPLE) return { error: 'Maximum ' + MAX_PEOPLE + ' personnes par réservation.', index: -1 };
  const bookerName = cleanName(body.client_name);
  const people = [];
  for (let i = 0; i < raw.length; i++) {
    const p = raw[i] || {};
    const name = cleanName(p.name) || bookerName;
    if (!name) return { error: 'Le prénom de la personne ' + (i + 1) + ' est requis.', index: i };
    // Sans prestation : au moins un supplement (« Supplement seul »).
    if (!p.service_id && !(Array.isArray(p.extras) && p.extras.length)) return { error: 'Choisissez une prestation ou un supplément pour ' + name + '.', index: i };
    if (!DATE_RE.test(String(p.date || '')) || !TIME_RE.test(String(p.time || ''))) return { error: 'Choisissez un créneau pour ' + name + '.', index: i };
    const extras = Array.isArray(p.extras) ? Array.from(new Set(p.extras.map(String).filter(Boolean))).slice(0, 30) : [];
    const products = (Array.isArray(p.products) ? p.products : []).filter((x) => x && x.id)
      .map((x) => ({ id: String(x.id), quantity: Math.min(99, Math.max(1, Number(x.quantity) || 1)) })).slice(0, 30);
    people.push({
      name, service_id: p.service_id ? String(p.service_id) : '', extras, products,
      barber_id: p.barber_id ? String(p.barber_id) : null, date: String(p.date), time: String(p.time)
    });
  }
  return { people };
}

module.exports = { MAX_PEOPLE, parseHeld, heldRanges, normalizePeople, cleanName, toMin };
