// Accueil : choix de l'espace (client, coiffeur, caisse, administration).
// Héros de marque + cartes avec icône, selon le design system.
// Aucune authentification ici — chaque espace possède son propre écran
// de connexion réel (PIN coiffeur, mot de passe propriétaire, compte client).
import React from 'react';
import { SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { RootStackScreenProps } from '../navigation/types';
import { useTheme } from '../hooks/useTheme';
import { Palette, brand, radius, spacing } from '../theme/theme';

type Area = {
  id: 'Client' | 'Coiffeur' | 'Caisse' | 'Admin';
  label: string;
  description: string;
  icon: 'calendar-outline' | 'cut-outline' | 'card-outline' | 'business-outline';
};

const AREAS: Area[] = [
  { id: 'Client', label: 'Client', description: 'Réservez, gérez vos rendez-vous, fidélité', icon: 'calendar-outline' },
  { id: 'Coiffeur', label: 'Coiffeur', description: 'Ma journée : coupes, planning, historique', icon: 'cut-outline' },
  { id: 'Caisse', label: 'Caisse', description: 'Encaissements, cartes cadeaux, journées', icon: 'card-outline' },
  { id: 'Admin', label: 'Administration', description: 'Salon, catalogue, équipe, réglages', icon: 'business-outline' },
];

export function HomeScreen({ navigation }: RootStackScreenProps<'Accueil'>) {
  const t = useTheme();
  const styles = stylesFor(t);
  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style={t.scheme === 'dark' ? 'light' : 'dark'} />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <Text style={styles.brand}>THE BARBER ONE</Text>
          <Text style={styles.title}>Votre salon,{'\n'}en poche.</Text>
          <Text style={styles.subtitle}>Choisissez votre espace — chaque espace se connecte avec ses propres accès.</Text>
        </View>
        {AREAS.map((area) => (
          <TouchableOpacity
            key={area.id}
            style={styles.panel}
            accessibilityRole="button"
            onPress={() => navigation.navigate(area.id)}
          >
            <View style={styles.iconWrap}>
              <Ionicons name={area.icon} size={22} color={t.accent} />
            </View>
            <View style={{ flex: 1, gap: 3 }}>
              <Text style={styles.panelTitle}>{area.label}</Text>
              <Text style={styles.panelText}>{area.description}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={t.textMuted} />
          </TouchableOpacity>
        ))}
        <Text style={styles.foot}>Sans rendez-vous ? Passez au salon — la borne vous place dans la file.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const stylesFor = (t: Palette) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: t.background },
    content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl, gap: spacing.md },
    hero: { marginTop: spacing.xl, marginBottom: spacing.lg, gap: 8 },
    brand: { color: t.accent, fontWeight: '800', letterSpacing: brand.letterSpacing, fontSize: 13 },
    title: { color: t.textPrimary, fontSize: 36, fontWeight: '800', lineHeight: 42 },
    subtitle: { color: t.textMuted, fontSize: 15, lineHeight: 22, marginTop: 2 },
    panel: {
      backgroundColor: t.surface,
      borderColor: t.surfaceBorder,
      borderWidth: StyleSheet.hairlineWidth,
      borderRadius: radius.card,
      padding: spacing.md + 2,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
    },
    iconWrap: {
      width: 44,
      height: 44,
      borderRadius: 12,
      backgroundColor: t.background,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.surfaceBorder,
      alignItems: 'center',
      justifyContent: 'center',
    },
    panelTitle: { color: t.textPrimary, fontSize: 18, fontWeight: '700' },
    panelText: { color: t.textSecondary, fontSize: 13.5, lineHeight: 19 },
    foot: { color: t.textMuted, fontSize: 13, fontStyle: 'italic', textAlign: 'center', marginTop: spacing.sm },
  });
