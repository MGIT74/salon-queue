// TABLEAU DE FILE — utilisé par la section « File d'attente » du Dashboard
// (session admin, X-Admin-Password) ET par Mon poste (session coiffeur,
// PIN). Reproduit le découpage du web/poste.html : « En cours » puis
// « À suivre », rafraîchissement 4 s (cadence du web), actions
// commencer / terminer / annuler via les API réelles.
import React, { useCallback } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ApiError, ApiAuth } from '../api/transport';
import { fetchQueue, queueCancel, queueFinish, queueStart } from '../api/endpoints';
import { useAuth } from '../auth/AuthContext';
import { usePolling } from '../hooks/usePolling';
import { useTheme } from '../hooks/useTheme';
import { LoadingView } from './AuthForm';
import { Palette, radius, spacing } from '../theme/theme';
import { QueueEntry } from '../types/api';
import { formatSalonDate } from '../utils/format';

export function QueueBoard({ heading = true }: { heading?: boolean }) {
  const { admin, barber } = useAuth();
  const t = useTheme();
  const styles = stylesFor(t);

  const session = admin ?? barber;
  const auth: ApiAuth = admin
    ? { kind: 'admin', adminPassword: admin.adminPassword }
    : barber
    ? { kind: 'barber', barberId: barber.barberId, barberPin: barber.barberPin }
    : { kind: 'public' };
  const salonSlug = admin ? admin.salonSlug : barber ? barber.salonSlug : '';

  const fetcher = useCallback(() => fetchQueue(salonSlug, auth), [salonSlug, admin, barber]);
  const poll = usePolling(fetcher, 4000);

  const act = useCallback(
    (op: () => Promise<unknown>, confirmation?: { title: string; message: string; destructive?: boolean }) => {
      const run = () => {
        void (async () => {
          try {
            await op();
            await poll.reload();
          } catch (err) {
            Alert.alert('Action refusée', err instanceof ApiError ? err.message : 'Erreur inattendue.');
          }
        })();
      };
      if (confirmation) {
        Alert.alert(confirmation.title, confirmation.message, [
          { text: 'Fermer', style: 'cancel' },
          { text: confirmation.destructive ? 'Confirmer' : 'OK', style: confirmation.destructive ? 'destructive' : 'default', onPress: run },
        ]);
      } else run();
    },
    [poll]
  );

  const start = (entry: QueueEntry) => act(() => queueStart(salonSlug, entry.id, auth));
  const finish = (entry: QueueEntry) => act(() => queueFinish(salonSlug, entry.id, auth));
  const cancel = (entry: QueueEntry) =>
    act(
      () => queueCancel(salonSlug, entry.id, auth),
      {
        title: 'Annuler ce passage ?',
        message: 'Le client sort de la file. (Le client ayant prévenu est géré côté RDV.)',
        destructive: true,
      }
    );

  if (!session) return null;

  const rows = poll.data?.queue ?? [];
  const inProgress = rows.filter((r) => r.status === 'in_progress');
  const waiting = rows.filter((r) => r.status === 'waiting');

  if (poll.loading && !poll.data) return <LoadingView t={t} label="Chargement de la file…" />;

  if (poll.error && !poll.data) {
    return (
      <View style={styles.errorBox}>
        <Text style={styles.text}>Impossible de charger la file{poll.error instanceof ApiError ? ` (${poll.error.message})` : ''}.</Text>
        <TouchableOpacity style={styles.retry} onPress={poll.reload} accessibilityRole="button">
          <Text style={styles.retryLabel}>Réessayer</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.content}>
      {heading ? <Text style={styles.sectionLabel}>En cours</Text> : null}
      {inProgress.length === 0 ? (
        <Text style={[styles.text, styles.none]}>Aucune coupe en cours.</Text>
      ) : (
        inProgress.map((entry) => (
          <Row key={entry.id} entry={entry} t={t}>
            <ActionBtn t={t} label="Terminer" onPress={() => finish(entry)} />
            <ActionBtn t={t} ghost label="Annuler" onPress={() => cancel(entry)} />
          </Row>
        ))
      )}

      <Text style={styles.sectionLabel}>À suivre</Text>
      {waiting.length === 0 ? (
        <Text style={[styles.text, styles.none]}>Personne n'attend.</Text>
      ) : (
        waiting.map((entry) => (
          <Row key={entry.id} entry={entry} t={t}>
            <ActionBtn t={t} label="Commencer" onPress={() => start(entry)} />
            <ActionBtn t={t} ghost label="Annuler" onPress={() => cancel(entry)} />
          </Row>
        ))
      )}
      <Text style={styles.hint}>Actualisé toutes les 4 s — mêmes données que la borne et l'écran de salle.</Text>
    </ScrollView>
  );
}

function Row({ entry, t, children }: { entry: QueueEntry; t: Palette; children: React.ReactNode }) {
  const styles = stylesFor(t);
  const inProgress = entry.status === 'in_progress';
  return (
    <View style={[styles.row, inProgress && styles.rowActive]}>
      <View style={{ flex: 1, gap: 2 }}>
        <View style={styles.rowTop}>
          <Text style={styles.name}>{entry.client_name || 'Client'}</Text>
          {entry.is_appointment ? <View style={styles.badge}><Text style={styles.badgeText}>RDV</Text></View> : null}
          <Text style={styles.when}>{entry.start_at ? formatSalonDate(entry.start_at) : formatSalonDate(entry.checkin_at)}</Text>
        </View>
        <Text style={styles.sub}>
          {entry.service?.name ?? 'Prestation'}
          {entry.extras.length > 0 ? ` + ${entry.extras.map((e) => e.name).join(', ')}` : ''}
        </Text>
      </View>
      <View style={styles.actions}>{children}</View>
    </View>
  );
}

function ActionBtn({ t, label, ghost, onPress }: { t: Palette; label: string; ghost?: boolean; onPress: () => void }) {
  const styles = stylesFor(t);
  return (
    <TouchableOpacity
      style={[styles.actBtn, !ghost && styles.actBtnSolid]}
      onPress={onPress}
      accessibilityRole="button"
    >
      <Text style={[styles.actLabel, !ghost && styles.actLabelSolid]}>{label}</Text>
    </TouchableOpacity>
  );
}

const stylesFor = (t: Palette) =>
  StyleSheet.create({
    content: { padding: spacing.lg, paddingBottom: spacing.xl, gap: spacing.sm + 2 },
    sectionLabel: { color: t.grey, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.2, marginTop: spacing.md - 4 },
    text: { color: t.ink, fontSize: 15, lineHeight: 21 },
    none: { color: t.grey, marginBottom: 4 },
    hint: { color: t.grey, fontSize: 12.5, fontStyle: 'italic', marginTop: spacing.md },
    errorBox: { flex: 1, backgroundColor: t.bg, padding: spacing.lg, gap: spacing.md, justifyContent: 'center' },
    retry: { backgroundColor: t.blue, borderRadius: radius.button, paddingVertical: 12, alignItems: 'center', marginTop: spacing.sm },
    retryLabel: { color: '#ffffff', fontWeight: '600' },
    row: {
      backgroundColor: t.card,
      borderColor: t.sep,
      borderWidth: StyleSheet.hairlineWidth,
      borderRadius: radius.card,
      padding: spacing.md,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
    },
    rowActive: { borderColor: t.blue, borderWidth: 1.5 },
    rowTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    name: { color: t.ink, fontSize: 16, fontWeight: '700' },
    badge: { backgroundColor: t.blueSoft, borderRadius: 100, paddingHorizontal: 7, paddingVertical: 2 },
    badgeText: { color: t.blue, fontSize: 10.5, fontWeight: '700' },
    when: { color: t.grey, fontSize: 12.5, marginLeft: 'auto' },
    sub: { color: t.grey, fontSize: 13.5 },
    actions: { gap: 6, marginLeft: 8 },
    actBtn: {
      backgroundColor: t.fill,
      borderRadius: radius.button,
      paddingHorizontal: 12,
      paddingVertical: 7,
      alignItems: 'center',
    },
    actBtnSolid: { backgroundColor: t.blue },
    actLabel: { color: t.blue, fontSize: 13, fontWeight: '700' },
    actLabelSolid: { color: '#ffffff' },
  });
