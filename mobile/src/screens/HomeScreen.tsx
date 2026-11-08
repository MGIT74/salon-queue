// Accueil : choix de l'espace (client, coiffeur, caisse, administration).
// Aucune authentification à ce stade — les écrans d'authentification par
// espace (PIN coiffeur, mot de passe propriétaire, compte client) arriveront
// à l'étape de branchement API (voir mobile/docs/API_AUDIT.md).
import React from 'react';
import { SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { RootStackScreenProps } from '../navigation/types';
import { brand, colors, radius, spacing } from '../theme/theme';

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
  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="light" />
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

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg + spacing.xl, paddingBottom: spacing.xl, gap: spacing.md },
  brand: { color: colors.accent, fontWeight: '700', letterSpacing: brand.letterSpacing, fontSize: 13 },
  title: { color: colors.textPrimary, fontSize: 32, fontWeight: '700', marginTop: spacing.md },
  subtitle: { color: colors.textMuted, fontSize: 16, lineHeight: 24, marginBottom: spacing.md },
  panel: {
    backgroundColor: colors.surface,
    borderColor: colors.surfaceBorder,
    borderWidth: 1,
    borderRadius: radius.card,
    padding: spacing.lg - 2,
    gap: 6,
  },
  panelHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  panelTitle: { color: colors.textPrimary, fontSize: 20, fontWeight: '700' },
  panelChevron: { color: colors.accent, fontSize: 22, fontWeight: '700' },
  panelText: { color: colors.textSecondary, fontSize: 15, lineHeight: 22 },
});
