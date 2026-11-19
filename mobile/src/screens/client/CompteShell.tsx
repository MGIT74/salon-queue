// Espace client — REPRODUCTION de compte.html : barre du bas du web
// (client-footer) = Accueil / Réserver / Compte / Déconnexion (en rouge),
// en barre FLOTTANTE effet verre (docs/DESIGN.md §3 bis).
// Aucun écran de choix de rôle : entré ici uniquement avec une session client.
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../auth/AuthContext';
import { useTheme } from '../../hooks/useTheme';
import { GlassTabBar } from '../../components/GlassTabBar';
import { CompteScreen } from './CompteScreen';
import { RdvScreen } from './RdvScreen';
import { ClientAccountScreen } from './ClientAccountScreen';
import { Palette } from '../../theme/theme';

type Tab = 'home' | 'book' | 'account';

export function CompteShell() {
  const t = useTheme();
  const styles = stylesFor(t);
  const { logout } = useAuth();
  const [tab, setTab] = useState<Tab>('home');

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.content}>
        {tab === 'home' ? <CompteScreen /> : tab === 'book' ? <RdvScreen /> : <ClientAccountScreen />}
      </View>
      <GlassTabBar
        t={t}
        active={tab}
        tabs={[
          { key: 'home', label: 'Accueil', icon: 'home-outline' },
          { key: 'book', label: 'Réserver', icon: 'add-circle-outline' },
          { key: 'account', label: 'Compte', icon: 'person-outline' },
          { key: 'logout', label: 'Déconnexion', icon: 'log-out-outline', danger: true },
        ]}
        onPress={(k) => (k === 'logout' ? void logout('client') : setTab(k as Tab))}
      />
    </SafeAreaView>
  );
}

const stylesFor = (t: Palette) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: t.bg },
    content: { flex: 1 },
  });
