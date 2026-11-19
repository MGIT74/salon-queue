// Utilitaires d'affichage — mise en forme SEULEMENT : les règles métier
// (durées, montants, fidélité) restent calculées côté serveur et ne
// doivent jamais être recalculées ici.

/** Affiche un montant transmis en centimes entiers (price_cents). */
export function formatPriceCents(amountCents: number, currency = 'EUR'): string {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency }).format(amountCents / 100);
}

/** Affiche une durée en minutes (ex. 90 → "1 h 30", 45 → "45 min"). */
export function formatDurationMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours > 0 && rest > 0) return `${hours} h ${rest}`;
  if (hours > 0) return `${hours} h`;
  return `${rest} min`;
}

/**
 * Affiche une date/heure RENVOYÉE PAR LE SERVEUR en heure du salon
 * (ex. "2026-11-09T14:30:00" ou "2026-11-09 14:30:00") : affichage brut
 * de cette heure de salon — JAMAIS de re-conversion vers l'heure du
 * téléphone (règle apprise de l'audit, docs/API_AUDIT.md §4.6).
 */
export function formatSalonDate(value: string): string {
  const spaced = value.replace('T', ' ');
  return spaced.length >= 16 ? spaced.slice(0, 16) : spaced;
}

/** Heure courante DU SALON en minutes depuis minuit (comme le web, cf. barbers.js). */
export function salonNowMinutes(timezone = 'Europe/Paris'): number {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date());
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return get('hour') * 60 + get('minute');
}

/** Date locale DU SALON au format YYYY-MM-DD (comme le web). */
export function salonTodayStr(timezone = 'Europe/Paris'): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

/** Minutes "12:00" → "14:05" affichables. */
export function minutesToClock(min: number): string {
  const h = Math.floor(min / 60) % 24;
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
