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
  /** Cartes dash-card / choix (14-18 px). */
  card: 14,
  /** Carte fidélité du compte client (16-18 px). */
  loyalty: 18,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 40,
} as const;

export const APP_VERSION = 'v0.0.1';
