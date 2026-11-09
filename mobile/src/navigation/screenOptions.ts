// Options d'écran partagées (usines à la palette actuelle : claire/sombre).
// Chaque navigateur appelle ces usines avec le thème courant — cf.
// hooks/useTheme.ts — pour que tout le chrome de navigation suive le mode
// système. Modifier ici = mise en forme mise à jour partout.
import { Palette } from '../theme/theme';

/** Écrans racine (Accueil masqué, espaces avec en-tête + retour natif). */
export function rootStackScreenOptions(t: Palette) {
  return {
    headerStyle: { backgroundColor: t.background },
    headerTintColor: t.textPrimary,
    headerTitleStyle: { fontWeight: '700' as const },
    contentStyle: { backgroundColor: t.background },
  } as const;
}

/** Onglets : aucun en-tête par écran (l'en-tête vient de la racine). */
export function tabBarScreenOptions(t: Palette) {
  return {
    headerShown: false,
    sceneStyle: { backgroundColor: t.background },
    tabBarActiveTintColor: t.accent,
    tabBarInactiveTintColor: t.textMuted,
    tabBarStyle: { backgroundColor: t.surface, borderTopColor: t.surfaceBorder },
  };
}

/** Piles internes (coiffeur, caisse) : pas d'en-tête (celui de la racine suffit). */
export function stackScreenOptions(t: Palette) {
  return {
    headerShown: false,
    contentStyle: { backgroundColor: t.background },
  } as const;
}
