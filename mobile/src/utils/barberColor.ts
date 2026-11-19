// Couleur d'un coiffeur : celle réglée côté serveur (barbers.color, « #rrggbb »),
// sinon une couleur de secours stable selon sa place dans la liste.
// Sert à l'avatar et au FOND TEINTÉ des créneaux (docs/DESIGN.md §5).
import { BarberPublic } from '../types/api';
import { Palette } from '../theme/theme';

const FALLBACK = ['#5e5ce6', '#ff9f0a', '#30b0c7', '#34c759', '#ff375f', '#af52de', '#0a84ff', '#a2845e'];

export function barberColorFor(barbers: BarberPublic[], id: string | null | undefined): string {
  const idx = barbers.findIndex((b) => b.id === id);
  const b = idx >= 0 ? barbers[idx] : undefined;
  const c = b ? (b as Record<string, unknown>).color : null;
  return typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c) ? c : FALLBACK[(idx >= 0 ? idx : 0) % FALLBACK.length];
}

/** Mélange une couleur avec le fond de carte : ~15 % en clair, ~30 % en sombre. */
export function tint(hex: string, t: Palette): string {
  const k = t.scheme === 'dark' ? 0.3 : 0.15;
  const base = t.card.length === 7 ? t.card : '#ffffff';
  const p = (h: string, i: number) => parseInt(h.slice(i, i + 2), 16);
  const mix = (i: number) => Math.round(p(hex, i) * k + p(base, i) * (1 - k)).toString(16).padStart(2, '0');
  return `#${mix(1)}${mix(3)}${mix(5)}`;
}
