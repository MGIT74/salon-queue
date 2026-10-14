// Conges d'un coiffeur au JOUR PRES : le calendrier annuel coche / decoche des jours, la base garde des plages
// (barber_leaves : start_date, end_date, note, repeat_yearly). Ces fonctions pures font l'aller-retour
// plages <-> jours, y compris « Repeter chaque annee » (les memes jours sont aussi poses sur les annees suivantes).
const REPEAT_YEARS = 5; // annees futures remplies automatiquement quand on coche « Répéter chaque année »
const MAX_DAYS = 6000;  // garde-fou : jamais plus de jours en memoire

const toUtc = (s) => new Date(s + 'T00:00:00Z');
const fmt = (d) => d.toISOString().slice(0, 10);
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s)) && !Number.isNaN(toUtc(String(s)).getTime()) && fmt(toUtc(String(s))) === String(s);
const addDays = (s, n) => { const d = toUtc(s); d.setUTCDate(d.getUTCDate() + n); return fmt(d); };

// Plages (lignes de la base) -> Map jour -> { note, repeat }
function expand(rows) {
  const map = new Map();
  for (const r of rows) {
    const a = String(r.start_date).slice(0, 10), b = String(r.end_date).slice(0, 10);
    if (!isDate(a) || !isDate(b) || b < a) continue;
    let d = a, guard = 0;
    while (d <= b && map.size < MAX_DAYS && guard++ < MAX_DAYS) {
      map.set(d, { note: r.note || null, repeat: Boolean(r.repeat_yearly) });
      d = addDays(d, 1);
    }
  }
  return map;
}

// Meme jour (mois-jour) dans une autre annee ; null si inexistant (29 fevrier).
function sameDayInYear(dateStr, year) {
  const md = dateStr.slice(5);
  const out = String(year) + '-' + md;
  return fmt(toUtc(out)) === out ? out : null;
}

// Applique « ces jours : en conge (on) ou non, avec ou sans repetition annuelle ».
function applyDays(map, dates, on, repeat, currentYear) {
  const uniq = [...new Set(dates.filter(isDate))].slice(0, 500);
  for (const day of uniq) {
    const prev = map.get(day);
    const year = Number(day.slice(0, 4));
    // Un jour qui se repetait : on retire toutes ses copies (les autres annees) avant de decider.
    if (prev && prev.repeat) {
      for (let y = year - 50; y <= year + 50; y++) {
        if (y === year) continue;
        const o = sameDayInYear(day, y);
        if (o && map.has(o) && map.get(o).repeat) map.delete(o);
      }
    }
    if (!on) { map.delete(day); continue; }
    map.set(day, { note: prev ? prev.note : null, repeat: Boolean(repeat) });
    if (repeat) {
      for (let y = Math.max(year, currentYear) + 1; y <= Math.max(year, currentYear) + REPEAT_YEARS; y++) {
        const o = sameDayInYear(day, y);
        if (o && !map.has(o)) map.set(o, { note: map.get(day).note, repeat: true });
      }
      // annees entre le jour choisi et l'annee courante (jour choisi dans le passe) : non remplies, volontairement
    }
  }
  return map;
}

// Map -> plages (jours consecutifs de meme note / meme repetition fusionnes)
function compress(map) {
  const days = [...map.keys()].sort();
  const out = [];
  for (const d of days) {
    const m = map.get(d), last = out[out.length - 1];
    if (last && addDays(last.end_date, 1) === d && last.note === m.note && last.repeat_yearly === m.repeat) last.end_date = d;
    else out.push({ start_date: d, end_date: d, note: m.note, repeat_yearly: m.repeat });
  }
  return out;
}

module.exports = { expand, applyDays, compress, sameDayInYear, REPEAT_YEARS, isDate };
