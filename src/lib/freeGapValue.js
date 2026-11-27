'use strict';
/**
 * Valeur des créneaux libres d'une journée : ce qu'on aurait VRAIMENT pu vendre dans chaque trou.
 *
 * - Chaque trou (entre deux clients, ou entre un client et le début / la fin de la journée ou une pause) est rempli
 *   avec la meilleure combinaison des prestations ET des suppléments seuls du coiffeur (ses prix, ses durées) :
 *   un trou de 5 min peut recevoir un supplément de 5 min, un trou de 3 min sans rien d'aussi court vaut 0.
 * - « Déplacement magique » : un RDV peut être avancé ou reculé de 5 min au plus, ce qui fait passer jusqu'à 5 min
 *   d'un trou au trou voisin. On choisit le décalage de chaque RDV qui rapporte le plus.
 */

const NUDGE_MAX_MIN = 5;
const MAX_GAP_MIN = 24 * 60;

/**
 * Meilleur prix (centimes) pour chaque durée 0..max. Prestations : autant qu'il en tient (plusieurs clients à la
 * suite) ; suppléments seuls : UN au plus par trou (un client qui passe pour un contour, pas neuf contours d'affilée).
 * items : [{ duration_min, price_cents, kind: 'service' | 'extra' }].
 */
function bestFillTable(items, max) {
  const ok = (x) => x.duration_min > 0 && x.price_cents > 0 && x.duration_min <= max;
  const services = items.filter((x) => x.kind !== 'extra' && ok(x));
  const extras = items.filter((x) => x.kind === 'extra' && ok(x));
  const svcBest = new Array(max + 1).fill(0);
  for (let t = 1; t <= max; t++) {
    svcBest[t] = svcBest[t - 1];   // une minute de trop ne fait rien perdre
    for (const it of services) {
      if (it.duration_min <= t) {
        const v = svcBest[t - it.duration_min] + it.price_cents;
        if (v > svcBest[t]) svcBest[t] = v;
      }
    }
  }
  const best = svcBest.slice();
  for (let t = 1; t <= max; t++) {
    for (const e of extras) if (e.duration_min <= t) best[t] = Math.max(best[t], svcBest[t - e.duration_min] + e.price_cents);
    best[t] = Math.max(best[t], best[t - 1]);
  }
  return best;
}

/**
 * Trous d'une journée de travail.
 * windows : plages de travail [début, fin] en minutes (déjà coupées par les pauses, et arrêtées à « maintenant »).
 * busy : [{ start, end, nudgeable }] en minutes (clients, RDV ; nudgeable = un RDV qu'on peut décaler de 5 min).
 * Renvoie, par plage, la suite [trou, séparateur, trou, ...] : gaps[i] = longueur, links[i] = le séparateur entre
 * gaps[i] et gaps[i+1] est un seul RDV décalable (true) ou non.
 */
function dayGaps(windows, busy) {
  const out = [];
  for (const [ws, we] of windows) {
    if (we <= ws) continue;
    // Occupations dans la plage, fusionnées quand elles se touchent ou se chevauchent.
    const inside = busy.filter((b) => b.end > ws && b.start < we)
      .map((b) => ({ start: Math.max(ws, b.start), end: Math.min(we, b.end), nudgeable: !!b.nudgeable, n: 1 }))
      .sort((a, b) => a.start - b.start);
    const merged = [];
    for (const b of inside) {
      const last = merged[merged.length - 1];
      if (last && b.start <= last.end) { last.end = Math.max(last.end, b.end); last.n += 1; last.nudgeable = false; }
      else merged.push(Object.assign({}, b));
    }
    const gaps = [], links = [];
    let cur = ws;
    merged.forEach((b) => {
      gaps.push(Math.max(0, b.start - cur));
      links.push(b.n === 1 && b.nudgeable);
      cur = b.end;
    });
    gaps.push(Math.max(0, we - cur));
    out.push({ gaps, links });
  }
  return out;
}

/**
 * Meilleure valeur d'une suite de trous, chaque séparateur décalable pouvant faire passer -5..+5 min d'un trou au
 * suivant (sans qu'un trou devienne négatif). m = décalage du RDV (positif = plus tard : le trou d'avant grandit).
 */
function bestSequenceValue(gaps, links, best) {
  const val = (len) => (len <= 0 ? 0 : best[Math.min(len, best.length - 1)]);
  const n = gaps.length;
  // memo[i][mPrev + 5] : meilleure valeur des trous i..n-1 sachant le décalage du RDV avant le trou i.
  const memo = Array.from({ length: n }, () => new Map());
  function go(i, mPrev) {
    if (i === n) return 0;
    const key = mPrev;
    if (memo[i].has(key)) return memo[i].get(key);
    let res = -1;
    const range = i < n - 1 && links[i] ? NUDGE_MAX_MIN : 0;
    for (let m = -range; m <= range; m++) {
      const len = gaps[i] - mPrev + m;
      if (len < 0) continue;
      if (i < n - 1 && gaps[i + 1] - m < 0) continue;
      const v = val(len) + go(i + 1, i < n - 1 ? m : 0);
      if (v > res) res = v;
    }
    if (res < 0) res = 0;
    memo[i].set(key, res);
    return res;
  }
  return go(0, 0);
}

/** Valeur (centimes) et minutes libres d'une journée. */
function dayFreeValue(windows, busy, best) {
  let cents = 0, minutes = 0;
  dayGaps(windows, busy).forEach(({ gaps, links }) => {
    minutes += gaps.reduce((t, g) => t + g, 0);
    cents += bestSequenceValue(gaps, links, best);
  });
  return { cents, minutes };
}

module.exports = { bestFillTable, dayGaps, bestSequenceValue, dayFreeValue, NUDGE_MAX_MIN, MAX_GAP_MIN };
