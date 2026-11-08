// Thème unique de l'application mobile The Barber One.
// Toutes les couleurs et métriques passent par ici : les futurs écrans
// réutilisent ces valeurs, les navigateurs en dérivent le thème React
// Navigation. Garde-fou : ne jamais colorer en dur dans un écran.
export const colors = {
  background: '#101010',
  surface: '#202020',
  surfaceBorder: '#383838',
  accent: '#c7a77a',
  accentText: '#101010',
  textPrimary: '#ffffff',
  textSecondary: '#bbbbbb',
  textMuted: '#b7b7b7',
  danger: '#c0392b',
} as const;

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
