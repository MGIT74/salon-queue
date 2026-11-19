// Orientation : portrait sur téléphone, libre (paysage autorisé) sur tablette.
// app.json autorise toutes les orientations ; on verrouille ici les téléphones.
import { Dimensions } from 'react-native';
import * as ScreenOrientation from 'expo-screen-orientation';

export async function applyOrientationPolicy(): Promise<void> {
  const { width, height } = Dimensions.get('screen');
  const isTablet = Math.min(width, height) >= 600;
  try {
    if (isTablet) await ScreenOrientation.unlockAsync();
    else await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
  } catch {
    // Orientation non modifiable (environnement de test) : sans conséquence.
  }
}
