// Espace client — REPRODUCTION de compte.html : barre du bas du web
// (client-footer) = Accueil / Réserver / Compte / Déconnexion (en rouge).
// Aucun écran de choix de rôle : entré ici uniquement avec une session client.
import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../auth/AuthContext';
import { useTheme } from '../../hooks/useTheme';
import { CompteScreen } from './CompteScreen';
import { RdvScreen } from './RdvScreen';
import { ClientAccountScreen } from './ClientAccountScreen';
import { Palette, spacing } from '../../theme/theme';

type Tab = 'home' | 'book' | 'account';

export function CompteShell() {
  const t = useTheme();
  const styles = stylesFor(t);
  const { client, logout } = useAuth();
  const [tab, setTab] = useState<Tab>('home');

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom', 'left', 'right']}>
      <View style={{ flex: 1 }}>
        <View style={styles.content}>
          {tab === 'home' ? <CompteScreen /> : tab === 'book' ? <RdvScreen /> : <ClientAccountScreen />}
        </View>
        <View style={styles.bar}>
          <TabBtn t={t} active={tab === 'home'} onPress={() => setTab('home')} icon="home-outline" label="Accueil" />
          <TabBtn t={t} active={tab === 'book'} onPress={() => setTab('book')} icon="add-circle-outline" label="Réserver" />
          <TabBtn t={t} active={tab === 'account'} onPress={() => setTab('account')} icon="person-outline" label="Compte" />
          <TabBtn t={t} logout onPress={() => void logout('client')} icon="log-out-outline" label="Déconnexion" />
        </View>
      </View>
    </SafeAreaView>
  );
}

function TabBtn({ t, active, logout, icon, label, onPress }: {
  t: Palette; active?: boolean; logout?: boolean; icon: 'add-circle-outline' | 'person-outline' | 'home-outline' | 'log-out-outline';
  label: string; onPress: () => void;
}) {
  const styles = stylesFor(t);
  return (
    <TouchableOpacity style={styles.tabBtn} onPress={onPress} accessibilityRole="button">
      <Ionicons
        name={icon}
        size={22}
        color={logout ? t.red : active ? t.blue : t.grey}
      />
      <Text style={[styles.tabLabel, logout ? { color: t.red } : active ? { color: t.blue } : null]}>{label}</Text>
    </TouchableOpacity>
  );
}

const stylesFor = (t: Palette) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: t.bg },
    content: { flex: 1 },
    bar: {
      flexDirection: 'row',
      borderTopColor: t.sep,
      borderTopWidth: StyleSheet.hairlineWidth,
      backgroundColor: t.card,
      paddingTop: 6,
      paddingBottom: 4,
    },
    tabBtn: { flex: 1, alignItems: 'center', gap: 2, paddingVertical: 2 },
    tabLabel: { fontSize: 11, fontWeight: '600', color: t.grey },
  });
