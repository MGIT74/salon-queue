import React from 'react';
import { useColorScheme } from 'react-native';
import { DarkTheme, NavigationContainer } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { RootNavigator } from './src/navigation/RootNavigator';
import { themeFor } from './src/theme/theme';

export default function App() {
  const scheme = useColorScheme();
  const palette = themeFor(scheme);

  // Thème React Navigation calculé depuis la palette active (clair/sombre) :
  // fond, cartes et accent identiques à ceux des écrans — chrome de
  // navigation et contenu ne peuvent pas se désynchroniser.
  const navigationTheme = {
    ...DarkTheme,
    colors: {
      ...DarkTheme.colors,
      primary: palette.accent,
      background: palette.background,
      card: palette.surface,
      text: palette.textPrimary,
      border: palette.surfaceBorder,
    },
  };

  return (
    <NavigationContainer theme={navigationTheme}>
      <StatusBar style={palette.scheme === 'dark' ? 'light' : 'dark'} />
      <RootNavigator />
    </NavigationContainer>
  );
}
