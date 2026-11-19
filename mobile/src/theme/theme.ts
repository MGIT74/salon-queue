// DESIGN SYSTEM — REPRODUCTION FIDÈLE de public/app.css (:root + dark).
// Tokens identiques à l'application web (bleu iOS clair/sombre, cartes,
// séparateurs). Aucune couleur inventée : tout vient d'app.css.
export type Palette = {
  scheme: 'light' | 'dark';
  bg: string;      // --bg
  card: string;    // --card
  ink: string;     // --ink
  grey: string;    // --grey
  sep: string;     // --sep
  fill: string;    // --fill
  fill2: string;   // --fill-2
  blue: string;    // --blue / --accent
  blueHover: string;
  blueSoft: string;
  green: string;
  red: string;
  orange: string;
  // Fonds « doux » des pastilles d'icônes / deltas (déclinaisons des couleurs d'app.css).
  greenSoft: string;
  orangeSoft: string;
  redSoft: string;
  /** Séparateur fin des listes iOS. */
  hair: string;
  /** Segment actif du contrôle segmenté. */
  segOn: string;
};

export const lightPalette: Palette = {
  scheme: 'light',
  bg: '#eef0f2',
  card: '#ffffff',
  ink: '#1d1d1f',
  grey: '#66666b',
  sep: '#bcbdc6',
  fill: '#e4e5eb',
  fill2: '#d6d7df',
  blue: '#0062c4',
  blueHover: '#004fa0',
  blueSoft: '#e3eefb',
  green: '#1e7e34',
  red: '#c4001b',
  orange: '#b35a00',
  greenSoft: '#e4f3e8',
  orangeSoft: '#fbefe3',
  redSoft: '#fbe5e8',
  hair: 'rgba(0,0,0,0.06)',
  segOn: '#ffffff',
};

export const darkPalette: Palette = {
  scheme: 'dark',
  bg: '#000000',
  card: '#1c1c1e',
  ink: '#f5f5f7',
  grey: '#98989d',
  sep: '#38383a',
  fill: '#2c2c2e',
  fill2: '#3a3a3c',
  blue: '#0a84ff',
  blueHover: '#409cff',
  blueSoft: '#0a2540',
  green: '#30d158',
  red: '#ff453a',
  orange: '#ff9f0a',
  greenSoft: '#0f2e19',
  orangeSoft: '#3a2508',
  redSoft: '#3a1210',
  hair: 'rgba(255,255,255,0.06)',
  segOn: '#636366',
};

export function themeFor(scheme: 'light' | 'dark' | null | undefined): Palette {
  return scheme === 'dark' ? darkPalette : lightPalette;
}

/* Alias pour le code existant (écrans Phase 2) : mappage 1:1 tokens web.
   Les nouveaux écrans utilisent directement bg/card/ink/blue... */
export const colors = {
  get background() { return themeFor(currentScheme).bg; },
  get surface() { return themeFor(currentScheme).card; },
  get surfaceBorder() { return themeFor(currentScheme).sep; },
  get accent() { return themeFor(currentScheme).blue; },
  get accentText() { return '#ffffff'; },
  get textPrimary() { return themeFor(currentScheme).ink; },
  get textSecondary() { return themeFor(currentScheme).grey; },
  get textMuted() { return themeFor(currentScheme).grey; },
  get danger() { return themeFor(currentScheme).red; },
} as const;
// scheme courant pose par le App via setSchemeForTheme (voir App.tsx).
let currentScheme: 'light' | 'dark' = 'light';
export function setSchemeForTheme(scheme: 'light' | 'dark' | null | undefined) {
  currentScheme = scheme === 'dark' ? 'dark' : 'light';
}

/* Typographie : l'app web utilise SF Pro / -apple-system — RN sur iOS
   utilise la police système par défaut, Android : Roboto. Échelles issues
   des tailles CSS (h1 24, titre connexion, etc.). */
export const radius = {
  /** Boutons et champs de app.css (btn { border-radius: 10px }). */
  button: 10,
  /** Cartes (maquette design-dashboard.html). */
  card: 16,
  /** Pastilles de stats. */
  pill: 12,
  /** Carte fidélité du compte client (16-18 px). */
  loyalty: 18,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 40,
  /** Marge de page gauche = droite (docs/DESIGN.md §3). */
  page: 16,
  /** Espace entre deux blocs. */
  block: 22,
  /** Espace entre cartes d'une grille. */
  grid: 10,
} as const;

/** Ombre douce des cartes : en clair seulement (docs/DESIGN.md §1). */
export function cardShadow(t: Palette) {
  return t.scheme === 'dark'
    ? {}
    : { shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 2 };
}

/** Hauteur réservée sous le contenu pour la barre d'onglets flottante. */
export const FLOATING_TABBAR_SPACE = 110;

export const APP_VERSION = 'v0.0.1';

/**
 * Fenêtres (feuilles / pop-up) : comme le web (.modal-box = var(--card)), le
 * fond d'une fenêtre n'est jamais le noir de la page. En sombre : fond « surélevé »
 * #1c1c1e et cartes un cran plus claires (couleurs iOS). En clair : inchangé.
 */
export function sheetTheme(t: Palette): Palette {
  if (t.scheme !== 'dark') return t;
  return { ...t, bg: '#1c1c1e', card: '#2c2c2e', fill: '#3a3a3c', fill2: '#48484a', sep: '#545458', segOn: '#636366', hair: 'rgba(255,255,255,0.08)' };
}
