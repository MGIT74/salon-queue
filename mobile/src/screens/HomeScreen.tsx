// Accueil : choix de l'espace (client, coiffeur, caisse, administration).
// Aucune authentification à ce stade — les écrans de connexion par espace
// (PIN coiffeur, mot de passe propriétaire, compte client) arriveront à
// l'étape d'authentification (voir mobile/docs/API_AUDIT.md §2).
import React from 'react';
import { SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { RootStackScreenProps } from '../navigation/types';
import { useTheme } from '../hooks/useTheme';
import { Palette, brand, radius, spacing } from '../theme/theme';

type Area = {
  id: 'Client' | 'Coiffeur' | 'Caisse' | 'Admin';
  label: string;
  description: string;
};

const AREAS: Area[] = [
  { id: 'Client', label: 'Client', description: 'File d\'attente, rendez-vous et compte client' },
  { id: 'Coiffeur', label: 'Coiffeur', description: 'Ma journée : coupes, planning et historique' },
  { id: 'Caisse', label: 'Caisse', description: 'Encaissements, cartes cadeaux et journées' },
  { id: 'Admin', label: 'Administration', description: 'Gestion du salon, catalogue et réglages' },
];

export function HomeScreen({ navigation }: RootStackScreenProps<'Accueil'>) {
  const t = useTheme();
  const styles = stylesFor(t);
  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style={t.scheme === 'dark' ? 'light' : 'dark'} />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.brand}>THE BARBER ONE</Text>
        <Text style={styles.title}>Votre salon, en poche</Text>
        <Text style={styles.subtitle}>Choisissez votre espace pour accéder au salon connecté.</Text>
        {AREAS.map((area) => (
          <TouchableOpacity
            key={area.id}
            style={styles.panel}
            accessibilityRole="button"
            onPress={() => navigation.navigate(area.id)}
          >
            <View style={styles.panelHeader}>
              <Text style={styles.panelTitle}>{area.label}</Text>
              <Text style={styles.panelChevron}>›</Text>
            </View>
            <Text style={styles.panelText}>{area.description}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const stylesFor = (t: Palette) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: t.background },
    content: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.lg + spacing.xl,
      paddingBottom: spacing.xl,
      gap: spacing.md,
    },
    brand: { color: t.accent, fontWeight: '700', letterSpacing: brand.letterSpacing, fontSize: 13 },
    title: { color: t.textPrimary, fontSize: 32, fontWeight: '700', marginTop: spacing.md },
    subtitle: { color: t.textMuted, fontSize: 16, lineHeight: 24, marginBottom: spacing.md },
    panel: {
      backgroundColor: t.surface,
      borderColor: t.surfaceBorder,
      borderWidth: 1,
      borderRadius: radius.card,
      padding: spacing.lg - 2,
      gap: 6,
    },
    panelHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    panelTitle: { color: t.textPrimary, fontSize: 20, fontWeight: '700' },
    panelChevron: { color: t.accent, fontSize: 22, fontWeight: '700' },
    panelText: { color: t.textSecondary, fontSize: 15, lineHeight: 22 },
  });
