import React from 'react';
import { useColorScheme } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider } from './src/auth/AuthContext';
import { RootNavigator } from './src/navigation/RootNavigator';
import { setSchemeForTheme, themeFor } from './src/theme/theme';

// L'app suit le thème système exactement comme app.css ([data-theme=dark]).
// Le palette est POSÉE ici (setSchemeForTheme) pour les alias legacy.
export default function App() {
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
