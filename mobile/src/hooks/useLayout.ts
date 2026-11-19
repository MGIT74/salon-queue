// Mise en page selon la largeur : téléphone (< 768 px) ou tablette.
// Même code pour les deux : chaque écran choisit sa disposition
// (maquettes : maquette/maquettes-app.html et maquettes-tablette.html).
import { useWindowDimensions } from 'react-native';

export const TABLET_MIN_WIDTH = 768;

export function useLayout() {
  const { width, height } = useWindowDimensions();
  const isTablet = Math.min(width, height) >= 600 && width >= TABLET_MIN_WIDTH;
  return { width, height, isTablet, isLandscape: width > height };
}
