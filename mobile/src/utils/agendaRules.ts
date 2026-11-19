// Règles d'affichage de l'agenda reprises du web (dashboard.html pd*) :
// ordre des colonnes gardé sur l'appareil, RDV décalés de 5 min.
// Le serveur reste juge (PUT /api/appointments/:id/nudge refuse ce qui n'est pas permis).
import * as SecureStore from 'expo-secure-store';
import { AdminAppointment, BarberPublic } from '../types/api';

/* ---------- Ordre des colonnes (web : admin_day_order_<salon>) ---------- */

const orderKey = (salonSlug: string) => `tbo.agenda.order.${salonSlug.replace(/[^a-zA-Z0-9._-]/g, '_')}`;

export async function readColumnOrder(salonSlug: string): Promise<string[]> {
  try {
    const raw = await SecureStore.getItemAsync(orderKey(salonSlug));
    const v: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}

export async function saveColumnOrder(salonSlug: string, ids: string[]): Promise<void> {
  try {
    await SecureStore.setItemAsync(orderKey(salonSlug), JSON.stringify(ids));
  } catch {
    // Mémorisation impossible : l'ordre reste celui de la session.
  }
}

/** Coiffeurs déjà placés dans l'ordre choisi, les autres à la suite dans l'ordre habituel. */
export function applyColumnOrder(list: BarberPublic[], order: string[]): BarberPublic[] {
  if (!order.length) return list;
  const pos = (b: BarberPublic) => {
    const i = order.indexOf(String(b.id));
    return i === -1 ? 1000 + list.indexOf(b) : i;
  };
  return list.slice().sort((x, y) => pos(x) - pos(y));
}

/* ---------- Décalage de 5 min (« magique ») ---------- */

export const NUDGE_MIN = 5;
const toMin = (hm: string) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5));

/** Écart en minutes avec l'heure réservée par le client (0 si pas décalé). */
export function movedBy(a: AdminAppointment): number {
  const ct = a.client_time ? String(a.client_time) : '';
  if (!ct || a.status !== 'confirmed') return 0;
  return toMin(String(a.scheduled_at).slice(11, 16)) - toMin(ct.slice(11, 16));
}

/** Flèches proposées : RDV confirmé, pas commencé, à venir ; ±5 min max autour de l'heure du client. */
export function nudgeRoom(a: AdminAppointment, isFuture: boolean): { up: boolean; down: boolean } {
  const qs = a.queue_status ? String(a.queue_status) : '';
  const started = qs !== '' && qs !== 'waiting' && qs !== 'cancelled';
  if (a.status !== 'confirmed' || (a.display_status ?? 'confirmed') !== 'confirmed' || started || !isFuture || !a.barber_id) {
    return { up: false, down: false };
  }
  const d = movedBy(a);
  return { up: d - NUDGE_MIN >= -NUDGE_MIN, down: d + NUDGE_MIN <= NUDGE_MIN };
}
