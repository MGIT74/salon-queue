// Hook thème : palette selon le mode clair/sombre du système.
// Un seul point d'entrée pour tous les écrans (design system).
import { useColorScheme } from 'react-native';
import { Palette, themeFor } from '../theme/theme';

export function useTheme(): Palette {
  return themeFor(useColorScheme());
}
