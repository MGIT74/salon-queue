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
