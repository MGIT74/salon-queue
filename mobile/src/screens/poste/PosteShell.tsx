// Mon poste (coiffeur connecté) — poste.html : barre FLOTTANTE effet verre
// Agenda · Timer · Crédit · Déconnexion (docs/DESIGN.md §3 bis).
// « Agenda » affiche pour l'instant la file RÉELLE (en cours / à suivre,
// actions avec la session PIN). Timer et Crédit : écrans à venir (maquettes
// maquettes-app.html, groupe « Poste & Agenda »).
import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../auth/AuthContext';
import { QueueBoard } from '../../components/QueueBoard';
import { GlassTabBar } from '../../components/GlassTabBar';
import { Card } from '../../components/Card';
import { Avatar, PageTitle } from '../../components/ui';
import { useTheme } from '../../hooks/useTheme';
import { FLOATING_TABBAR_SPACE, Palette, cardShadow, spacing } from '../../theme/theme';

type Tab = 'agenda' | 'timer' | 'credit';

export function PosteShell() {
  const t = useTheme();
  const styles = stylesFor(t);
  const insets = useSafeAreaInsets();
  const { barber, logout } = useAuth();
  const [tab, setTab] = useState<Tab>('agenda');

  if (!barber) return null; // garou : rendu uniquement avec session coiffeur

  const today = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.topbar}>
        <View style={styles.who}>
          <Avatar t={t} name={barber.barberName} />
          <Text style={styles.whoName} numberOfLines={1}>{barber.barberName}</Text>
        </View>
      </View>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: FLOATING_TABBAR_SPACE + insets.bottom }]}>
        {tab === 'agenda' ? (
          <>
            <PageTitle t={t} title="Mon poste" subtitle={today.charAt(0).toUpperCase() + today.slice(1)} />
            <QueueBoard heading={false} />
          </>
        ) : (
          <>
            <PageTitle t={t} title={tab === 'timer' ? 'Timer' : 'Mon crédit produits'} />
            <Card t={t}>
              <Text style={styles.soon}>
                {tab === 'timer'
                  ? 'Écran en préparation : minuteur de la coupe en cours, démarrage avant l\'heure du RDV selon les réglages.'
                  : 'Écran en préparation : solde, scan d\'un produit et « Je l\'ai pris ». Rechargez votre crédit à la caisse.'}
              </Text>
            </Card>
          </>
        )}
      </ScrollView>
      <GlassTabBar
        t={t}
        active={tab}
        tabs={[
          { key: 'agenda', label: 'Agenda', icon: 'calendar-outline' },
          { key: 'timer', label: 'Timer', icon: 'timer-outline' },
          { key: 'credit', label: 'Crédit', icon: 'wallet-outline' },
          { key: 'logout', label: 'Déconnexion', icon: 'log-out-outline', danger: true },
        ]}
        onPress={(k) => (k === 'logout' ? void logout('barber') : setTab(k as Tab))}
      />
    </SafeAreaView>
  );
}

const stylesFor = (t: Palette) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: t.bg },
    topbar: { paddingHorizontal: spacing.page, paddingTop: 6, paddingBottom: 10, flexDirection: 'row' },
    who: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: t.card, borderRadius: 12, paddingVertical: 6, paddingLeft: 6, paddingRight: 12, ...cardShadow(t) },
    whoName: { color: t.ink, fontSize: 15, fontWeight: '600' },
    content: { paddingHorizontal: spacing.page, paddingTop: 4 },
    soon: { color: t.grey, fontSize: 15, lineHeight: 21 },
  });
