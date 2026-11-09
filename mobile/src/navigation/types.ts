// Listes de paramètres et props typés de la navigation.
// Toute la navigation est décrite ici : ajouter un écran = ajouter son nom
// dans la liste de son espace, puis le monter dans le navigateur concerné.
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

/** Racine : choix d'espace puis les 4 espaces (Client, Coiffeur, Caisse, Admin). */
export type RootStackParamList = {
  Accueil: undefined;
  Client: undefined;
  Coiffeur: undefined;
  Caisse: undefined;
  Admin: undefined;
};

/** Espace Client : rendez-vous en ligne (réservation + gestion) et compte. */
export type ClientTabsParamList = {
  ClientRdv: undefined;
  ClientCompte: undefined;
};

/** Espace Coiffeur : pilote "Mon poste" (PIN coiffeur). */
export type CoiffeurStackParamList = {
  CoiffeurMaJournee: undefined;
};

/** Espace Caisse : encaissement et journées de caisse — Nepting exclu. */
export type CaisseStackParamList = {
  CaisseEncaissement: undefined;
  CaisseJournees: undefined;
};

/** Espace Administration (mot de passe propriétaire). */
export type AdminTabsParamList = {
  AdminDashboard: undefined;
  AdminCatalogue: undefined;
  AdminCoiffeurs: undefined;
  AdminReglages: undefined;
};

export type RootStackScreenProps<T extends keyof RootStackParamList> =
  NativeStackScreenProps<RootStackParamList, T>;

export type ClientTabsScreenProps<T extends keyof ClientTabsParamList> =
  BottomTabScreenProps<ClientTabsParamList, T>;

export type CoiffeurStackScreenProps<T extends keyof CoiffeurStackParamList> =
  NativeStackScreenProps<CoiffeurStackParamList, T>;

export type CaisseStackScreenProps<T extends keyof CaisseStackParamList> =
  NativeStackScreenProps<CaisseStackParamList, T>;

export type AdminTabsScreenProps<T extends keyof AdminTabsParamList> =
  BottomTabScreenProps<AdminTabsParamList, T>;
