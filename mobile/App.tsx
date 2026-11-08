import React from 'react';
import { DarkTheme, NavigationContainer } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { RootNavigator } from './src/navigation/RootNavigator';
import { colors } from './src/theme/theme';

// Thème React Navigation calé sur le thème "salon" : même fond, même
// accent doré, bordures discrètes — cohérence entre la barre système,
// les onglets et les écrans (qui lisent src/theme/theme.ts).
const NavigationTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: colors.accent,
    background: colors.background,
    card: colors.surface,
    text: colors.textPrimary,
    border: colors.surfaceBorder,
  },
};

export default function App() {
  return (
    <NavigationContainer theme={NavigationTheme}>
      <StatusBar style="light" />
      <RootNavigator />
    </NavigationContainer>
  );
}
