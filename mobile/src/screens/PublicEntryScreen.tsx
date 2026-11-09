// Accueil public — point d'entrée unique du mobile, fidèle aux 3 URL du web :
// /admin (Dashboard), /compte.html (Espace client), /poste.html (Mon poste).
// Pas de design inventé : mêmes intitulés, même carton de connexion.
import React, { useState } from 'react';
import { SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { AdminLoginScreen } from './admin/AdminLoginScreen';
import { ClientLoginScreen } from './client/ClientLoginScreen';
import { PostePinScreen } from './poste/PostePinScreen';
import { useTheme } from '../hooks/useTheme';
import { Palette, radius, spacing } from '../theme/theme';

type Door = 'hub' | 'admin' | 'client' | 'poste';

export function PublicEntryScreen() {
  const t = useTheme();
  const styles = stylesFor(t);
  const [door, setDoor] = useState<Door>('hub');

  if (door === 'admin') return <AdminLoginScreen onBack={() => setDoor('hub')} />;
  if (door === 'client') return <ClientLoginScreen onBack={() => setDoor('hub')} />;
  if (door === 'poste') return <PostePinScreen onBack={() => setDoor('hub')} />;

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style={t.scheme === 'dark' ? 'light' : 'dark'} />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <Ionicons name="briefcase-outline" size={30} color={t.blue} />
          <Text style={styles.title}>The Barber One</Text>
          <Text style={styles.sub}>Connectez-vous à votre espace habituel — la session s'ouvre sur le bon écran.</Text>
        </View>

        <TouchableOpacity style={styles.door} onPress={() => setDoor('admin')} accessibilityRole="button">
          <Ionicons name="grid-outline" size={22} color={t.blue} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={styles.doorTitle}>Dashboard</Text>
            <Text style={styles.doorSub}>Espace de gestion du salon</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={t.grey} />
        </TouchableOpacity>

        <TouchableOpacity style={styles.door} onPress={() => setDoor('client')} accessibilityRole="button">
          <Ionicons name="person-outline" size={22} color={t.blue} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={styles.doorTitle}>Espace client</Text>
            <Text style={styles.doorSub}>Réservation, fidélité, cartes cadeaux</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={t.grey} />
        </TouchableOpacity>

        <TouchableOpacity style={styles.door} onPress={() => setDoor('poste')} accessibilityRole="button">
          <Ionicons name="cut-outline" size={22} color={t.blue} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={styles.doorTitle}>Mon poste</Text>
            <Text style={styles.doorSub}>Connexion coiffeur par code PIN</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={t.grey} />
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const stylesFor = (t: Palette) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: t.bg },
    content: { padding: spacing.lg, paddingBottom: spacing.xl, gap: spacing.md },
    hero: { marginTop: spacing.xl, marginBottom: spacing.sm, gap: 8 },
    title: { color: t.ink, fontSize: 30, fontWeight: '700', letterSpacing: -0.6 },
    sub: { color: t.grey, fontSize: 15, lineHeight: 21 },
    door: {
      backgroundColor: t.card,
      borderColor: t.sep,
      borderWidth: StyleSheet.hairlineWidth,
      borderRadius: radius.card,
      padding: spacing.md + 2,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
    },
    doorTitle: { color: t.ink, fontSize: 17, fontWeight: '600' },
    doorSub: { color: t.grey, fontSize: 13.5 },
  });
