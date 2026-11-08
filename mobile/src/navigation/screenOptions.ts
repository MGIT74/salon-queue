// Options d'écran partagées par les navigateurs (thème sombre "salon").
// Modifier ici = mise en forme mise à jour partout en une fois.
import { colors } from '../theme/theme';

export const tabBarScreenOptions = {
  headerStyle: { backgroundColor: colors.background },
  headerTintColor: colors.textPrimary,
  headerTitleStyle: { fontWeight: '700' as const },
  sceneStyle: { backgroundColor: colors.background },
  tabBarActiveTintColor: colors.accent,
  tabBarInactiveTintColor: colors.textMuted,
  tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.surfaceBorder },
};

export const stackScreenOptions = {
  headerStyle: { backgroundColor: colors.background },
  headerTintColor: colors.textPrimary,
  headerTitleStyle: { fontWeight: '700' as const },
  contentStyle: { backgroundColor: colors.background },
} as const;
