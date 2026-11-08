// Options d'écran partagées (usines à la palette actuelle : claire/sombre).
// Chaque navigateur appelle ces fonctoires avec le thème courant — cf.
// hooks/useTheme.ts — pour que tout le chrome de navigation suive le
// mode système. Modifier ici = mise en forme mise à jour partout.
import { Palette } from '../theme/theme';

export function tabBarScreenOptions(t: Palette) {
  return {
    headerStyle: { backgroundColor: t.background },
    headerTintColor: t.textPrimary,
    headerTitleStyle: { fontWeight: '700' as const },
    sceneStyle: { backgroundColor: t.background },
    tabBarActiveTintColor: t.accent,
    tabBarInactiveTintColor: t.textMuted,
    tabBarStyle: { backgroundColor: t.surface, borderTopColor: t.surfaceBorder },
  };
}

export function stackScreenOptions(t: Palette) {
  return {
    headerStyle: { backgroundColor: t.background },
    headerTintColor: t.textPrimary,
    headerTitleStyle: { fontWeight: '700' as const },
    contentStyle: { backgroundColor: t.background },
  } as const;
}
