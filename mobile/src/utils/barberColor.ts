// Couleur d'un coiffeur : celle réglée côté serveur (barbers.color, « #rrggbb »),
// sinon une couleur de secours stable selon sa place dans la liste.
// Sert à l'avatar et au FOND TEINTÉ des créneaux (docs/DESIGN.md §5).
import { BarberPublic } from '../types/api';
import { Palette } from '../theme/theme';

// COPIE de public/app.js (DOT_COLORS, stableColorForId, barberColorOf) : même couleur que sur le web.
const DOT_COLORS = ['#3b82f6', '#f97316', '#10b981', '#a855f7', '#ec4899', '#eab308', '#14b8a6', '#ef4444'];

export function stableColorForId(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return DOT_COLORS[hash % DOT_COLORS.length];
}

/** Couleur choisie dans la fiche du coiffeur, sinon la couleur automatique du web (même id = même couleur). */
export function barberColorFor(barbers: BarberPublic[], id: string | null | undefined): string {
  if (id == null || id === '') return '#8e8e93';
  const b = barbers.find((x) => String(x.id) === String(id));
  const c = b ? (b as Record<string, unknown>).color : null;
  return typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c) ? c : stableColorForId(String(id));
}

/** Mélange une couleur avec le fond de carte : ~15 % en clair, ~30 % en sombre. */
export function tint(hex: string, t: Palette): string {
  const k = t.scheme === 'dark' ? 0.3 : 0.15;
  const base = t.card.length === 7 ? t.card : '#ffffff';
  const p = (h: string, i: number) => parseInt(h.slice(i, i + 2), 16);
  const mix = (i: number) => Math.round(p(hex, i) * k + p(base, i) * (1 - k)).toString(16).padStart(2, '0');
  return `#${mix(1)}${mix(3)}${mix(5)}`;
}
