// Bornes de période du dashboard — calcul côté MOBILE comme le web
// (dashboard.html periodRange) : le navigateur utilise SON heure locale
// pour les bornes ; le serveur revalide. Plage personnalisée : plus tard.
export type PeriodKey = 'day' | 'week' | 'month';

export type PeriodRange = {
  /** ISO d'ouverture (inclus) — envoyé en `start`. */
  startIso: string;
  /** ISO de fermeture (exclu) — envoyé en `end`. */
  endIso: string;
  /** Dates locales YYYY-MM-DD (incluses) — envoyées en start_date/end_date. */
  startDate: string;
  endDate: string;
  label: string;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function localDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function withTime(y: number, m: number, d: number): Date {
  return new Date(y, m, d);
}

export function periodRange(period: PeriodKey, offset: number): PeriodRange {
  const base = new Date();
  startOffset(base, period, offset);

  if (period === 'day') {
    const start = new Date(base.getFullYear(), base.getMonth(), base.getDate());
    const end = new Date(start.getTime() + DAY_MS);
    return build(start, end, base.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' }));
  }

  if (period === 'week') {
    const dow = (base.getDay() + 6) % 7; // lundi = 0
    const monday = new Date(base.getFullYear(), base.getMonth(), base.getDate() - dow);
    const end = new Date(monday.getTime() + 7 * DAY_MS);
    return build(monday, end, `du ${monday.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} au ${new Date(end.getTime() - DAY_MS).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}`);
  }

  const first = new Date(base.getFullYear(), base.getMonth(), 1);
  const end = new Date(base.getFullYear(), base.getMonth() + 1, 1);
  return build(first, end, base.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }));
}

function startOffset(base: Date, period: PeriodKey, offset: number): void {
  if (!offset) {
    moveAnchorTo(base, period);
    return;
  }
  const shift: Record<PeriodKey, number> = { day: offset, week: offset * 7, month: offset * 30 };
  const candidate = new Date(base.getTime() + shift[period] * DAY_MS);
  // ancre re-calée au début de la période visée (day exact ; week : lundi ;
  // month : 1er) pour coller aux bornes du web.
  moveAnchorTo(candidate, period);
  base.setTime(candidate.getTime());
}

function moveAnchorTo(d: Date, period: PeriodKey): void {
  if (period === 'week') {
    const dow = (d.getDay() + 6) % 7;
    if (dow !== 0) d.setDate(d.getDate() - dow);
  } else if (period === 'month') {
    d.setDate(1);
  }
}

function build(start: Date, end: Date, label: string): PeriodRange {
  const endIncl = new Date(end.getTime() - 1);
  return {
    startIso: start.toISOString(),
    endIso: end.toISOString(),
    startDate: localDateStr(start),
    endDate: localDateStr(endIncl),
    label,
  };
}

export { withTime, localDateStr };
