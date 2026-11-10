// MAQUETTE — données FICTIVES, embarquées dans l'app.
// Aucun appel au serveur : rien n'est lu ni écrit en production.

export type Salon = { slug: string; name: string; city: string; address: string };
export type Service = { id: string; name: string; minutes: number; priceCents: number; icon: string };
export type Barber = { id: string; name: string; initials: string; color: string };

export const SALONS: Salon[] = [
  { slug: 'valleiry', name: 'The Barber One', city: 'Valleiry', address: 'Salon de démonstration' },
  { slug: 'demo-centre', name: 'Salon Démo', city: 'Centre-ville', address: 'Salon de démonstration' },
  { slug: 'demo-gare', name: 'Salon Démo', city: 'Quartier Gare', address: 'Salon de démonstration' },
];

export const SERVICES: Service[] = [
  { id: 'coupe', name: 'Coupe', minutes: 30, priceCents: 2500, icon: 'cut-outline' },
  { id: 'coupe-barbe', name: 'Coupe + barbe', minutes: 45, priceCents: 3500, icon: 'man-outline' },
  { id: 'barbe', name: 'Barbe', minutes: 20, priceCents: 1500, icon: 'brush-outline' },
  { id: 'enfant', name: 'Coupe enfant', minutes: 20, priceCents: 1800, icon: 'happy-outline' },
];

export const EXTRAS = [
  { id: 'shampoing', name: 'Shampoing', priceCents: 500 },
  { id: 'contours', name: 'Contours', priceCents: 300 },
];

export const BARBERS: Barber[] = [
  { id: 'any', name: 'Sans préférence', initials: '★', color: '#5e5ce6' },
  { id: 'marco', name: 'Marco', initials: 'M', color: '#0a84ff' },
  { id: 'tom', name: 'Tom', initials: 'T', color: '#ff9f0a' },
  { id: 'yanis', name: 'Yanis', initials: 'Y', color: '#30d158' },
];

export const CLIENT = {
  name: 'Eric',
  points: 340,
  tiers: [
    { label: 'Coupe offerte', need: 500 },
    { label: 'Barbe offerte', need: 300 },
  ],
  nextAppointment: { day: 'Samedi 14 novembre', time: '10:30', service: 'Coupe + barbe', barber: 'Marco', priceCents: 3500 },
  lastVisit: { day: 'Samedi 17 octobre', service: 'Coupe', barber: 'Tom', priceCents: 2500 },
  giftCard: { amountCents: 5000, from: 'Sophie', code: 'TBO-7F3K' },
};

const DAY_NAMES = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

export type Day = { key: string; dow: string; num: number; month: string; closed: boolean };

/** 10 prochains jours (le lundi est fermé, comme beaucoup de salons). */
export function nextDays(count = 10): Day[] {
  const out: Day[] = [];
  const d = new Date();
  for (let i = 0; i < count; i++) {
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate() + i);
    out.push({ key: x.toDateString(), dow: DAY_NAMES[x.getDay()], num: x.getDate(), month: MONTHS[x.getMonth()], closed: x.getDay() === 1 });
  }
  return out;
}

/** Créneaux fictifs d'un jour : déterministes selon le jour, pour une maquette stable. */
export function slotsFor(day: Day): { morning: string[]; afternoon: string[] } {
  if (day.closed) return { morning: [], afternoon: [] };
  const seed = day.num % 3;
  const morning = ['09:00', '09:30', '10:00', '10:30', '11:00', '11:30'].filter((_, i) => (i + seed) % 4 !== 0);
  const afternoon = ['14:00', '14:30', '15:00', '15:30', '16:00', '16:30', '17:00', '17:30', '18:00'].filter((_, i) => (i + seed) % 3 !== 1);
  return { morning, afternoon };
}

export const QUEUE = {
  current: { client: 'Lucas B.', service: 'Coupe + barbe', startedMinutesAgo: 18, minutes: 45 },
  next: [
    { client: 'Nathan', service: 'Coupe', time: '11:15', kind: 'RDV' as const },
    { client: 'Karim', service: 'Barbe', time: 'Sans RDV', kind: 'Sans RDV' as const },
    { client: 'Léo (8 ans)', service: 'Coupe enfant', time: '11:50', kind: 'RDV' as const },
  ],
};

export const eur = (cents: number) => (cents / 100).toFixed(2).replace('.', ',') + ' €';
export const dur = (min: number) => (min >= 60 ? `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')}` : `${min} min`);

/* ===================================================== Espace professionnel (fictif) */

export type Staff = { id: string; name: string; initials: string; color: string; pin: string };
/** Coiffeurs du salon : pastilles de couleur comme les bulles de la caisse et de l'agenda web. */
export const STAFF: Staff[] = [
  { id: 'marco', name: 'Marco', initials: 'M', color: '#e5484d', pin: '1111' },
  { id: 'tom', name: 'Tom', initials: 'T', color: '#0a84ff', pin: '2222' },
  { id: 'yanis', name: 'Yanis', initials: 'Y', color: '#30a46c', pin: '3333' },
];

export type QueueItem = {
  id: string; client: string; service: string; minutes: number; priceCents: number;
  barberId: string; status: 'waiting' | 'in_progress' | 'done'; kind: 'RDV' | 'Sans RDV'; time?: string; waitMin?: number;
};
export const QUEUE_ITEMS: QueueItem[] = [
  { id: 'q1', client: 'Lucas B.', service: 'Coupe + barbe', minutes: 45, priceCents: 3500, barberId: 'marco', status: 'in_progress', kind: 'Sans RDV' },
  { id: 'q2', client: 'Nathan', service: 'Coupe', minutes: 30, priceCents: 2500, barberId: 'marco', status: 'waiting', kind: 'RDV', time: '11:15', waitMin: 26 },
  { id: 'q3', client: 'Karim', service: 'Barbe', minutes: 20, priceCents: 1500, barberId: 'marco', status: 'waiting', kind: 'Sans RDV', waitMin: 56 },
  { id: 'q4', client: 'Léo (8 ans)', service: 'Coupe enfant', minutes: 20, priceCents: 1800, barberId: 'tom', status: 'waiting', kind: 'RDV', time: '11:50', waitMin: 12 },
  { id: 'q5', client: 'Mehdi', service: 'Coupe', minutes: 30, priceCents: 2500, barberId: 'tom', status: 'in_progress', kind: 'RDV' },
];

/** Rendez-vous du jour (heure du salon, minutes depuis minuit). */
export type Appt = { id: string; barberId: string; client: string; service: string; start: number; minutes: number; priceCents: number; online: boolean; prepaid?: boolean };
export const APPTS: Appt[] = [
  { id: 'r1', barberId: 'marco', client: 'Paul', service: 'Coupe', start: 9 * 60 + 30, minutes: 30, priceCents: 2500, online: true },
  { id: 'r2', barberId: 'marco', client: 'Lucas B.', service: 'Coupe + barbe', start: 10 * 60 + 30, minutes: 45, priceCents: 3500, online: false },
  { id: 'r3', barberId: 'marco', client: 'Nathan', service: 'Coupe', start: 11 * 60 + 15, minutes: 30, priceCents: 2500, online: true },
  { id: 'r4', barberId: 'marco', client: 'Sam', service: 'Coupe + barbe', start: 14 * 60, minutes: 45, priceCents: 3500, online: true, prepaid: true },
  { id: 'r5', barberId: 'marco', client: 'Eric D.', service: 'Coupe', start: 16 * 60 + 30, minutes: 30, priceCents: 2500, online: true },
  { id: 'r6', barberId: 'tom', client: 'Mehdi', service: 'Coupe', start: 10 * 60 + 45, minutes: 30, priceCents: 2500, online: true },
  { id: 'r7', barberId: 'tom', client: 'Léo (8 ans)', service: 'Coupe enfant', start: 11 * 60 + 50, minutes: 20, priceCents: 1800, online: true },
  { id: 'r8', barberId: 'tom', client: 'Antoine', service: 'Barbe', start: 15 * 60, minutes: 20, priceCents: 1500, online: false },
  { id: 'r9', barberId: 'yanis', client: 'Julien', service: 'Coupe + barbe', start: 9 * 60, minutes: 45, priceCents: 3500, online: true },
  { id: 'r10', barberId: 'yanis', client: 'Rayan', service: 'Coupe', start: 13 * 60 + 30, minutes: 30, priceCents: 2500, online: true },
  { id: 'r11', barberId: 'yanis', client: 'Kevin', service: 'Coupe', start: 17 * 60, minutes: 30, priceCents: 2500, online: false },
];
export const DAY_START = 9 * 60;
export const DAY_END = 19 * 60;
export const hm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

export type CatalogItem = { id: string; name: string; minutes?: number; priceCents: number; emoji: string; kind: 'svc' | 'extra' | 'product'; stock?: number };
export const CATALOG: CatalogItem[] = [
  { id: 'c-barbe', name: 'Barbe', minutes: 20, priceCents: 1500, emoji: '🧔', kind: 'svc' },
  { id: 'c-coupe', name: 'Coupe', minutes: 30, priceCents: 2500, emoji: '✂️', kind: 'svc' },
  { id: 'c-cb', name: 'Coupe + barbe', minutes: 45, priceCents: 3500, emoji: '💈', kind: 'svc' },
  { id: 'c-enfant', name: 'Coupe enfant', minutes: 20, priceCents: 1800, emoji: '🧒', kind: 'svc' },
  { id: 'c-sh', name: 'Shampoing', priceCents: 500, emoji: '🫧', kind: 'extra' },
  { id: 'c-ct', name: 'Contours', priceCents: 300, emoji: '📐', kind: 'extra' },
  { id: 'c-cire', name: 'Cire coiffante', priceCents: 1490, emoji: '🫙', kind: 'product', stock: 12 },
  { id: 'c-huile', name: 'Huile à barbe', priceCents: 1890, emoji: '🧴', kind: 'product', stock: 3 },
];

export const PENDING_PAYMENTS = [
  { id: 'pp1', client: 'Hugo', service: 'Coupe', priceCents: 2500, barberId: 'marco', ago: '12 min' },
  { id: 'pp2', client: 'Mehdi', service: 'Coupe', priceCents: 2500, barberId: 'tom', ago: '3 min' },
];

export const TODAY_SALES = [
  { id: 's1', ticket: 41, time: '09:42', client: 'Julien', items: 'Coupe + barbe', method: 'CB', priceCents: 3500, barberId: 'yanis' },
  { id: 's2', ticket: 42, time: '10:05', client: 'Paul', items: 'Coupe, Cire coiffante', method: 'Espèces', priceCents: 3990, barberId: 'marco' },
  { id: 's3', ticket: 43, time: '10:31', client: 'Sam', items: 'Coupe + barbe', method: 'CB', priceCents: 3500, barberId: 'marco' },
  { id: 's4', ticket: 44, time: '11:12', client: 'Antoine', items: 'Barbe', method: 'CB', priceCents: 1500, barberId: 'tom' },
];

export const CLIENTS_LIST = [
  { name: 'Eric Dokatel', phone: '06 •• •• •• 04', visits: 14, last: '17 oct.', loyalty: 340, account: true },
  { name: 'Lucas Bernard', phone: '06 •• •• •• 18', visits: 6, last: 'Aujourd\'hui', loyalty: 120, account: true },
  { name: 'Nathan', phone: '07 •• •• •• 55', visits: 3, last: '2 nov.', loyalty: 60, account: false },
  { name: 'Karim', phone: '06 •• •• •• 91', visits: 9, last: '28 oct.', loyalty: 210, account: true },
  { name: 'Paul Martin', phone: '06 •• •• •• 32', visits: 21, last: 'Aujourd\'hui', loyalty: 480, account: true },
  { name: 'Sam', phone: '07 •• •• •• 07', visits: 2, last: 'Aujourd\'hui', loyalty: 40, account: false },
];

/** Chiffres de la semaine (fictifs) pour le dashboard admin. */
export const WEEK = {
  label: 'Cette semaine',
  revenueCents: [41200, 58600, 47300, 66100, 89400, 102300, 0],
  days: ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'],
  ranking: [
    { barberId: 'marco', revenueCents: 152400, clients: 48 },
    { barberId: 'tom', revenueCents: 131800, clients: 44 },
    { barberId: 'yanis', revenueCents: 120700, clients: 37 },
  ],
};
