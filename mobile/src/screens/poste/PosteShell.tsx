// Mon poste (coiffeur connecté) — reproduction du topbar de poste.html :
// nom du salon en petites capitales, nom du coiffeur en titre, déconnexion.
// Zones du web reproduites : « En cours » puis « À suivre » (file RÉELLE,
// 4 s, actions commencer/terminer/annuler avec la session PIN du coiffeur).
import React from 'react';
import { SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useAuth } from '../../auth/AuthContext';
import { QueueBoard } from '../../components/QueueBoard';
import { useTheme } from '../../hooks/useTheme';
import { Palette, spacing } from '../../theme/theme';

export function PosteShell() {
  const t = useTheme();
  const styles = stylesFor(t);
  const { barber, salonRef, logout } = useAuth();

  if (!barber) return null; // garou : rendu uniquement avec session coiffeur

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style={t.scheme === 'dark' ? 'light' : 'dark'} />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.topbar}>
          <View style={{ flex: 1 }}>
            <Text style={styles.salonTag}>{salonRef?.slug ? salonRef.slug : 'Salon'}</Text>
            <Text style={styles.myName}>{barber.barberName}</Text>
          </View>
          <TouchableOpacity style={styles.logout} onPress={() => void logout('barber')} accessibilityRole="button">
            <Ionicons name="log-out-outline" size={18} color={t.grey} />
            <Text style={styles.logoutLabel}>Déconnexion</Text>
          </TouchableOpacity>
        </View>

        <QueueBoard heading={false} />
        <Text style={styles.agendaNote}>
          Mon agenda (calendrier, RDV) : à suivre — API déjà auditées.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const stylesFor = (t: Palette) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: t.bg },
    content: { padding: spacing.lg * 0.6, paddingBottom: spacing.xl, gap: spacing.md },
    topbar: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: spacing.md, paddingHorizontal: spacing.lg - 4, paddingTop: spacing.lg - 4 },
    salonTag: { fontSize: 12, fontWeight: '600', color: t.grey, letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 2 },
    myName: { color: t.ink, fontSize: 24, fontWeight: '600', letterSpacing: -0.4 },
    logout: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 6 },
    logoutLabel: { color: t.grey, fontSize: 14 },
    agendaNote: { color: t.grey, fontSize: 12.5, fontStyle: 'italic', textAlign: 'center', marginTop: 8 },
  });
