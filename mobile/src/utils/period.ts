// Bornes de période du dashboard — COPIE de periodRange() du web
// (dashboard.html) : Jour / Semaine / Mois / Plage, avec les mêmes bornes
// et les mêmes libellés. Le navigateur (ici le téléphone) utilise son heure
// locale pour les bornes ; le serveur revalide.
export type PeriodKey = 'day' | 'week' | 'month' | 'range';

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

/** Plage personnalisée (web : customFrom / customTo, « Du » et « Au » inclus). */
export type CustomRange = { from: string; to: string };

function localDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function withTime(y: number, m: number, d: number): Date {
  return new Date(y, m, d);
}

const short = (d: Date) => d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });

export function periodRange(period: PeriodKey, offset: number, custom?: CustomRange): PeriodRange {
  const now = new Date();
  let start: Date;
  let end: Date;
  let label: string;

  if (period === 'range' && custom && custom.from && custom.to) {
    start = new Date(`${custom.from}T00:00:00`);
    end = new Date(`${custom.to}T00:00:00`);
    end.setDate(end.getDate() + 1); // fin exclusive, le jour « au » est inclus
    label = `${short(start)} – ${short(new Date(`${custom.to}T00:00:00`))}`;
  } else if (period === 'day') {
    start = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
    end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1);
    label = offset === 0 ? "Aujourd'hui" : start.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
  } else if (period === 'week') {
    const day = now.getDay() === 0 ? 7 : now.getDay(); // lundi = 1 … dimanche = 7
    const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (day - 1));
    start = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + offset * 7);
    end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7);
    const endIncl = new Date(end.getFullYear(), end.getMonth(), end.getDate() - 1);
    label = (offset === 0 ? 'Cette semaine · ' : '') + `${short(start)} – ${short(endIncl)}`;
  } else {
    start = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    end = new Date(now.getFullYear(), now.getMonth() + offset + 1, 1);
    label = start.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
    label = label.charAt(0).toUpperCase() + label.slice(1);
  }

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
