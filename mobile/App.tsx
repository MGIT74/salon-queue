import React from 'react';
import { useColorScheme } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider } from './src/auth/AuthContext';
import { RootNavigator } from './src/navigation/RootNavigator';
import { setSchemeForTheme, themeFor } from './src/theme/theme';
import Maquette from './maquette/Maquette';

// Maquette de design (données fictives, aucun appel serveur) : modèle visuel des vrais écrans.
// Par défaut l'app s'ouvre sur l'app branchée. Pour ouvrir la maquette :
//   EXPO_PUBLIC_MAQUETTE=1 npx expo start -c
const SHOW_MAQUETTE = process.env.EXPO_PUBLIC_MAQUETTE === '1';

// L'app suit le thème système exactement comme app.css ([data-theme=dark]).
// Le palette est POSÉE ici (setSchemeForTheme) pour les alias legacy.
export default function App() {
  if (SHOW_MAQUETTE) return <Maquette />;
  return <ConnectedApp />;
}

function ConnectedApp() {
  const scheme = useColorScheme();
  const palette = themeFor(scheme);
  setSchemeForTheme(palette.scheme);

  return (
    <AuthProvider>
      <StatusBar style={palette.scheme === 'dark' ? 'light' : 'dark'} />
      <RootNavigator />
    </AuthProvider>
  );
}
