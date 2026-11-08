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
