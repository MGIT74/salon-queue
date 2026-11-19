// Compte client CONNECTÉ : profil, fidélité, RDV à venir, dernier passage,
// cartes cadeaux — données réelles de GET /api/client-auth/me.
// Une session expirée (401) déconnecte automatiquement et propose de se
// reconnecter ; aucune donnée n'est fabriquée côté mobile.
import React, { useCallback, useEffect, useState } from 'react';
import { ActionSheetIOS, Alert, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ApiError } from '../../api/transport';
import { ClientSalonsResponse, fetchClientMe, fetchClientSalons, logoutClient } from '../../api/endpoints';
import { ClientMeResponse } from '../../types/api';
import { useAuth } from '../../auth/AuthContext';
import { SessionBanner } from '../../components/SessionBanner';
import { Card } from '../../components/Card';
import { LoadingView } from '../../components/AuthForm';
import { useTheme } from '../../hooks/useTheme';
import { Palette, radius, spacing } from '../../theme/theme';
import { formatPriceCents, formatSalonDate } from '../../utils/format';

export function CompteScreen() {
  const auth = useAuth();
  const client = auth.client;
  const t = useTheme();
  const styles = stylesFor(t);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [me, setMe] = useState<ClientMeResponse | null>(null);
  const [salons, setSalons] = useState<ClientSalonsResponse | null>(null);
  const [switching, setSwitching] = useState(false);

  const load = useCallback(async () => {
    if (!client) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchClientMe(client.salonSlug, client.clientToken);
      setMe(data);
      // Sélecteur de salon (web : loadSalonSwitch) — silencieux en cas d'erreur.
      fetchClientSalons(client.salonSlug, client.clientToken).then(setSalons).catch(() => setSalons(null));
    } catch (err) {
      // Session expirée, ou jeton d'un AUTRE salon (wrong_salon : un compte = un salon) :
      // déconnexion propre + message du serveur.
      if (err instanceof ApiError && err.status === 401) {
        await auth.logout('client');
        setError(err.wrongSalon ? err : new ApiError(401, 'Session expirée, reconnectez-vous'));
      } else {
        setError(err);
      }
    } finally {
      setLoading(false);
    }
  }, [client, auth]);

  useEffect(() => {
    void load();
  }, [load]);

  const logout = useCallback(async () => {
    if (!client) return;
    try {
      await logoutClient(client.salonSlug, client.clientToken);
    } finally {
      await auth.logout('client');
    }
  }, [client, auth]);

  const pickSalon = useCallback(() => {
    if (!client || !salons || switching) return;
    const items = salons.items;
    const choose = async (slug: string) => {
      if (slug === client.salonSlug) return;
      setSwitching(true);
      try {
        await auth.switchClientSalon(slug);
        setMe(null);
        setSalons(null);
      } catch (err) {
        Alert.alert('Changement de salon impossible', err instanceof ApiError ? err.message : 'Une erreur est survenue.');
      } finally {
        setSwitching(false);
      }
    };
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { title: 'Salon', options: [...items.map((i) => i.name), 'Annuler'], cancelButtonIndex: items.length },
        (index) => {
          const it = items[index];
          if (it) void choose(it.slug);
        }
      );
    } else {
      Alert.alert('Salon', undefined, [
        ...items.map((i) => ({ text: i.name, onPress: () => void choose(i.slug) })),
        { text: 'Annuler', style: 'cancel' as const },
      ]);
    }
  }, [client, salons, switching, auth]);

  if (!client) return null; // garou : l'écran n'est monté qu'avec session
  if (loading && !me) return <LoadingView t={t} label="Chargement de votre compte…" />;

  if (error && !me) {
    return (
      <View style={[styles.container, styles.errorBox]}>
        <Text style={styles.sectionTitle}>Connexion au compte impossible</Text>
        {error instanceof ApiError ? (
          <Text style={styles.text}>{error.message}</Text>
        ) : (
          <Text style={styles.text}>Une erreur est survenue.</Text>
        )}
        <TouchableOpacity style={styles.retry} onPress={() => void load()} accessibilityRole="button">
          <Text style={styles.retryLabel}>Réessayer</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!me) return <LoadingView t={t} label="Chargement de votre compte…" />;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <SessionBanner
        label={me.profile.name || 'Compte client'}
        sublabel={me.profile.email}
        onLogout={() => void logout()}
        t={t}
      />

      {/* Compte aussi ouvert dans un autre salon de l'enseigne : changer de salon (web : salon-switch, ≥ 2 salons). */}
      {salons && salons.items.length >= 2 ? (
        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>Salon</Text>
          <TouchableOpacity style={styles.switchBtn} onPress={pickSalon} disabled={switching} accessibilityRole="button">
            <Text style={styles.switchValue}>
              {salons.items.find((i) => i.slug === salons.current)?.name ?? salons.current}
            </Text>
            <Ionicons name="chevron-down" size={14} color={t.ink} />
          </TouchableOpacity>
        </View>
      ) : null}

      <Card title="Fidélité" t={t}>
        {me.loyalty_activated && me.loyalty ? (
          <>
            <Text style={styles.big}>{me.loyalty.points} points</Text>
            <Text style={styles.text}>
              {Number(me.loyalty.rewards_available) > 0
                ? `${me.loyalty.rewards_available} récompense(s) disponible(s) — à échanger au salon.`
                : 'Continuez vos visites : les paliers se calculent côté salon.'}
            </Text>
          </>
        ) : (
          <Text style={styles.text}>Carte de fidélité non activée : demandez l'activation dans le salon.</Text>
        )}
      </Card>

      <Card title="Rendez-vous à venir" t={t}>
        {me.upcoming_appointments.length === 0 ? (
          <Text style={styles.text}>Aucun rendez-vous à venir. Réservation en ligne : Phase 3.</Text>
        ) : (
          me.upcoming_appointments.map((rdv) => (
            <View key={rdv.id} style={styles.row}>
              <Text style={styles.text}>
                {formatSalonDate(rdv.scheduled_at)} — {rdv.service_name}
                {rdv.person_name ? ` (pour ${rdv.person_name})` : ''}
                {formatPriceCents(rdv.price_cents) ? ` · ${formatPriceCents(rdv.price_cents)}` : ''}
              </Text>
            </View>
          ))
        )}
      </Card>

      <Card title="Dernier passage payé" t={t}>
        {me.recent_visits.length > 0 && me.recent_visits[0] ? (
          <Text style={styles.text}>
            {formatSalonDate(me.recent_visits[0].checkin_at)} — {me.recent_visits[0].service_name ?? 'Prestation'} ·{' '}
            {me.recent_visits[0].salon_name}
          </Text>
        ) : (
          <Text style={styles.text}>Aucun passage payé.</Text>
        )}
      </Card>

      <Card title="Cartes cadeaux reçues" t={t}>
        {me.gift_cards.length === 0 ? (
          <Text style={styles.text}>Aucune carte cadeau sur ce compte.</Text>
        ) : (
          me.gift_cards.map((gift) => (
            <View key={gift.id} style={styles.row}>
              <Text style={styles.text}>
                {gift.code} · {formatPriceCents(gift.amount_cents)}
                {gift.used ? ' · utilisée' : gift.pending ? ' · en réservation' : ' · disponible'}
              </Text>
            </View>
          ))
        )}
      </Card>
    </ScrollView>
  );
}

const stylesFor = (t: Palette) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: t.bg },
    content: { padding: spacing.lg, paddingBottom: spacing.xl, gap: spacing.md },
    card: {
      backgroundColor: t.card,
      borderColor: t.sep,
      borderWidth: 1,
      borderRadius: radius.card,
      padding: spacing.md,
      gap: spacing.sm,
    },
    cardTitle: { color: t.blue, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.5 },
    cardBody: { gap: spacing.xs + 2 },
    row: { gap: 2 },
    text: { color: t.grey, fontSize: 15, lineHeight: 21 },
    big: { color: t.ink, fontSize: 24, fontWeight: '700' },
    sectionTitle: { color: t.ink, fontSize: 18, fontWeight: '700' },
    errorBox: { padding: spacing.lg, justifyContent: 'center', gap: spacing.md },
    retry: { backgroundColor: t.blue, borderRadius: radius.button, paddingVertical: 12, alignItems: 'center', marginTop: spacing.sm },
    retryLabel: { color: '#fff', fontWeight: '700' },
    switchRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    switchLabel: { color: t.grey, fontSize: 13, fontWeight: '600' },
    switchBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: t.fill, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 12 },
    switchValue: { color: t.ink, fontSize: 14, fontWeight: '600' },
  });
