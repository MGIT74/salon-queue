// Menu latéral du dashboard web (dashboard.html > aside.sidebar > nav#tabs)
// — ordre, libellés et icônes IDENTIQUES. La barre du bas mobile reprend
// les 4 entrées principales + « Plus » (pattern mobile du web), qui ouvre
// la liste complète (13 sections) + Déconnexion.
export type AdminSectionKey =
  | 'dashboard'
  | 'queue'
  | 'services'
  | 'extras'
  | 'products'
  | 'marketing'
  | 'caisse'
  | 'rdv'
  | 'barbers'
  | 'clients'
  | 'salons'
  | 'account'
  | 'settings';

export type AdminSectionDef = {
  key: AdminSectionKey;
  label: string;
  icon: 'grid-outline' | 'list-outline' | 'cut-outline' | 'add-circle-outline' | 'cube-outline' | 'mail-outline'
       | 'card-outline' | 'calendar-outline' | 'person-outline' | 'people-outline' | 'business-outline'
       | 'id-card-outline' | 'settings-outline';
  /** Phase de branchement mobile prévue (données réelles). */
  phase: string;
  desc: string;
};

export const ADMIN_SECTIONS: AdminSectionDef[] = [
  { key: 'dashboard', label: 'Dashboard', icon: 'grid-outline', phase: 'Phase 5', desc: "Vue d'ensemble : coiffeurs actifs, clients, RDV à venir, courbes de CA et manque à gagner." },
  { key: 'queue', label: "File d'attente", icon: 'list-outline', phase: 'Phase 4-5', desc: 'File en direct et actions rapides, même file que la borne et le poste.' },
  { key: 'services', label: 'Prestations', icon: 'cut-outline', phase: 'Phase 5', desc: 'Prestations, durées, prix, catégories — CRUD réel plus tard.' },
  { key: 'extras', label: 'Suppléments', icon: 'add-circle-outline', phase: 'Phase 5', desc: 'Suppléments ajoutés aux prestations (durée/prix).' },
  { key: 'products', label: 'Produits', icon: 'cube-outline', phase: 'Phase 5', desc: 'Produits de vente réservables en ligne et encaissables en caisse.' },
  { key: 'marketing', label: 'Marketing', icon: 'mail-outline', phase: 'Phase 5+', desc: 'Période de caisse, cartes cadeaux, fidélité et exports clients.' },
  { key: 'caisse', label: 'Caisse', icon: 'card-outline', phase: 'Phase 5', desc: 'Encaissement, tickets, clôtures — Nepting reste une intégration séparée et validée.' },
  { key: 'rdv', label: 'Rendez-vous', icon: 'calendar-outline', phase: 'Phase 5', desc: 'Agenda des rendez-vous, déplacements et annulations.' },
  { key: 'barbers', label: 'Coiffeurs', icon: 'person-outline', phase: 'Phase 5', desc: 'Équipe, horaires hebdo, congés, PIN, capacités et tarifs.' },
  { key: 'clients', label: 'Clients', icon: 'people-outline', phase: 'Phase 5', desc: 'Répertoire clients, import CSV, comptes et historiques.' },
  { key: 'salons', label: 'Mes salons', icon: 'business-outline', phase: 'Phase 5+', desc: 'Gestion des salons de l’enseigne (multi-salons).' },
  { key: 'account', label: 'Compte', icon: 'id-card-outline', phase: 'Phase 5', desc: 'Profil propriétaire : nom, email, mot de passe, marketing.' },
  { key: 'settings', label: 'Réglages', icon: 'settings-outline', phase: 'Phase 5', desc: 'Salon, SMTP, SMS, TVA, fermetures et horaires du salon.' },
];

/** Barre du bas mobile (web : pattern « Plus » à partir d'un sous-ensemble). */
export const ADMIN_BOTTOM_BAR: AdminSectionKey[] = ['dashboard', 'queue', 'rdv', 'caisse'];
