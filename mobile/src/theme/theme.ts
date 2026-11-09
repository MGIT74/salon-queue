// Design system The Barber One — métriques + palettes claire/sombre.
// Identité : fond sombre « barbershop » (doré sur #101010) et une palette
// claire équivalente pour les iPhone/Android réglés en mode clair.
// Les écrans consomment via useTheme() (src/hooks/useTheme.ts), les
// navigateurs construisent leurs options à partir de la même palette.
// Règle du projet : ne JAMAIS coder une couleur en dur dans un écran.
export type Palette = {
  scheme: 'light' | 'dark';
  background: string;
  surface: string;
  surfaceBorder: string;
  accent: string;
  accentText: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  danger: string;
};

export const darkPalette: Palette = {
  scheme: 'dark',
  background: '#101010',
  surface: '#1a1a1e',
  surfaceBorder: '#2e2e34',
  accent: '#c7a77a',
  accentText: '#101010',
  textPrimary: '#ffffff',
  textSecondary: '#b9b9bf',
  textMuted: '#8e8e94',
  danger: '#c0392b',
};

export const lightPalette: Palette = {
  scheme: 'light',
  background: '#f7f3ec',
  surface: '#ffffff',
  surfaceBorder: '#e4dccd',
  // Doré foncé : le #c7a77a clair du thème sombre ne passe pas sur fond clair.
  accent: '#8a5c28',
  accentText: '#ffffff',
  textPrimary: '#17140f',
  textSecondary: '#4a453d',
  textMuted: '#7a7365',
  danger: '#a31212',
};

export function themeFor(scheme: 'light' | 'dark' | null | undefined): Palette {
  return scheme === 'light' ? lightPalette : darkPalette;
}

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 40,
} as const;

export const radius = {
  card: 16,
  button: 10,
} as const;

export const brand = {
  letterSpacing: 3,
} as const;
