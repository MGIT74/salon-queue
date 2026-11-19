// DASHBOARD ADMIN (section 1) — reproduction du tab #t-dashboard du web,
// branché sur les routes réelles de main (étape A) :
//   owner/profile, barbers?all, owner/client-stats, queue/history,
//   appointments (liste + mois caisse_view), barbers/salon-stats,
//   settings/public (devise + fuseau). Aucun calcul métier ici : bornes de
//   période côté mobile (comme le navigateur web), tout le reste = serveur.
import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '../../components/Card';
import { ApiError } from '../../api/transport';
import {
  fetchAdminAppointments,
  fetchBarbers,
  fetchClientStats,
  fetchExtras,
  fetchOwnerProfile,
  fetchProductsList,
  fetchQueueHistoryCount,
  fetchSalonPublic,
  fetchSalonStats,
  fetchServices,
} from '../../api/endpoints';
import { ApiAuth } from '../../api/transport';
import { useAuth } from '../../auth/AuthContext';
import { useTheme } from '../../hooks/useTheme';
import { usePolling } from '../../hooks/usePolling';
import { Palette, radius, spacing } from '../../theme/theme';
import { PeriodKey, periodRange } from '../../utils/period';
import { formatPriceCents, formatSalonDate, minutesToClock, salonNowMinutes, salonTodayStr } from '../../utils/format';
import { AdminAppointment, BarberPublic, SalonStatsResponse } from '../../types/api';

export function DashboardScreen() {
  const t = useTheme();
  const styles = stylesFor(t);
  const { admin } = useAuth();

  const [period, setPeriod] = useState<PeriodKey>('week');
  const [offset, setOffset] = useState(0);
  const [rank, setRank] = useState<'ca' | 'speed' | 'produits'>('ca');
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedBar, setSelectedBar] = useState<number | null>(null);

  const auth: ApiAuth = admin
    ? { kind: 'admin', adminPassword: admin.adminPassword }
    : { kind: 'public' };
  const salonSlug = admin?.salonSlug ?? '';

  const range = useMemo(() => periodRange(period, offset), [period, offset]);

  /* --- Données (une source = un petit bloc réutilisable) --- */
  const settingsRes = useApi(useCallback(() => fetchSalonPublic(salonSlug), [salonSlug]), refreshKey);
  const currency = settingsRes.data?.currency ?? 'EUR';
  const tz = settingsRes.data?.timezone ?? 'Europe/Paris';

  const profileRes = useApi(useCallback(() => fetchOwnerProfile(salonSlug, auth), [salonSlug, admin]), refreshKey);
  const barbersRes = useApi(useCallback(() => fetchBarbers(salonSlug, { all: true }), [salonSlug]), refreshKey);
  const statsRes = useApi(
    useCallback(
      () => fetchSalonStats(salonSlug, auth, { startIso: range.startIso, endIso: range.endIso, startDate: range.startDate, endDate: range.endDate }),
      [salonSlug, admin, range]
    ), refreshKey
  );
  const clientStatsRes = useApi(useCallback(() => fetchClientStats(salonSlug, auth), [salonSlug, admin]), refreshKey);
  const queueCountRes = useApi(useCallback(() => fetchQueueHistoryCount(salonSlug, auth), [salonSlug, admin]), refreshKey);
  const apptsRes = useApi(useCallback(() => fetchAdminAppointments(salonSlug, auth), [salonSlug, admin]), refreshKey);
  const monthRes = useApi(
    useCallback(
      () => fetchAdminAppointments(salonSlug, auth, { month: salonTodayStr(tz).slice(0, 7), caisseView: true }),
      [salonSlug, admin, tz]
    ), refreshKey
  );
  const catRes = useApi(
    useCallback(async () => {
      const s = await fetchServices(salonSlug);
      const x = await fetchExtras(salonSlug);
      const p = await fetchProductsList(salonSlug);
      return { services: s.items, extras: x.items, products: p.items };
    }, [salonSlug]),
    refreshKey
  );

  const reloadAll = useCallback(() => setRefreshKey((k) => k + 1), []);

  const welcome = profileRes.data?.name ?? '';
  const barbers = barbersRes.data?.items ?? [];
  const barberById = useMemo(() => new Map(barbers.map((b) => [b.id, b])), [barbers]);
  const stats = statsRes.data;
  const upcoming = (apptsRes.data?.items ?? []).slice(0, 6);
  const today = salonTodayStr(tz);
  const nowMin = salonNowMinutes(tz);

  const todayAppts = useMemo(
    () => (monthRes.data?.items ?? []).filter((a) => String(a.scheduled_at).slice(0, 10) === today),
    [monthRes.data, today]
  );

  const chart = stats?.series;
  const chartValues = chart?.barber_cents ?? [];
  const chartLabels = (chart?.labels ?? []).map(labelShort);
  const maxChart = Math.max(1, ...chartValues.map((v) => v ?? 0));

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={settingsRes.loading || statsRes.loading || barbersRes.loading}
          onRefresh={reloadAll}
          tintColor={t.blue}
        />
      }
    >
      <View style={{ gap: 2 }}>
        <Text style={styles.welcome}>
          Bienvenue, {welcome ? <Text style={{ color: t.blue }}>{welcome}</Text> : null}
        </Text>
        <Text style={styles.date}>
          {new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
        </Text>
      </View>

      {/* KPIs */}
      <View style={styles.grid2}>
        <Kpi t={t} icon="umbrella-outline" value={String((barbers ?? []).filter((b) => b.active && b.on_leave_today).length)} label="En congé" loading={barbersRes.loading && !barbersRes.data} />
        <Kpi t={t} icon="people-outline" value={String(barbers.length)} label="Coiffeurs actifs" loading={barbersRes.loading && !barbersRes.data} />
        <Kpi t={t} icon="person-outline" value={String(queueCountRes.data?.total ?? 0)} label="Clients" loading={queueCountRes.loading && !queueCountRes.data} />
        <Kpi t={t} icon="calendar-outline" value={String(apptsRes.data?.items.length ?? 0)} label="RDV à venir" loading={apptsRes.loading && !apptsRes.data} />
      </View>

      {/* Clientèle */}
      <Card title="Clientèle" t={t}>
        {clientStatsRes.data ? (
          <View style={styles.pillList}>
            <PillDot t={t} color={t.blue} label="Comptes clients" value={clientStatsRes.data.accounts} />
            <PillDot t={t} color={t.green} label="Cartes fidélité actives" value={clientStatsRes.data.loyalty} />
            <PillDot t={t} color={t.orange} label="Cartes cadeaux en cours" value={clientStatsRes.data.gifts} />
            <PillDot t={t} color={t.grey} label="Clients sans compte" value={clientStatsRes.data.without_account} />
          </View>
        ) : clientStatsRes.error ? (
          <MiniError t={t} error={clientStatsRes.error} />
        ) : (
          <LoadingInline t={t} />
        )}
      </Card>

      {/* Sélecteur de période — identique au web (Plage : plus tard, cf. rapport) */}
      <View style={styles.periodBar}>
        {(['day', 'week', 'month'] as PeriodKey[]).map((p) => (
          <TouchableOpacity key={p} style={[styles.periodChip, period === p && styles.periodChipOn]} onPress={() => { setPeriod(p); setOffset(0); }} accessibilityRole="button">
            <Text style={[styles.periodChipText, period === p && styles.periodChipTextOn]}>
              {p === 'day' ? 'Jour' : p === 'week' ? 'Semaine' : 'Mois'}
            </Text>
          </TouchableOpacity>
        ))}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>
          <TouchableOpacity style={styles.arrow} onPress={() => setOffset((o) => o - 1)} accessibilityRole="button">
            <Ionicons name="chevron-back" size={18} color={t.blue} />
          </TouchableOpacity>
          <Text style={styles.periodLabel}>{range.label}</Text>
          <TouchableOpacity style={[styles.arrow, offset >= 0 && { opacity: 0.35 }]} disabled={offset >= 0} onPress={() => setOffset((o) => o + 1)} accessibilityRole="button">
            <Ionicons name="chevron-forward" size={18} color={t.blue} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Classement */}
      <Card title="Classement" t={t}>
        <View style={styles.rankTabs}>
          {([['ca', 'CA'], ['speed', 'Rapidité'], ['produits', 'Produits']] as const).map(([k, label]) => (
            <TouchableOpacity key={k} style={[styles.rankTab, rank === k && styles.rankTabOn]} onPress={() => setRank(k)} accessibilityRole="button">
              <Text style={[styles.rankTabText, rank === k && styles.rankTabTextOn]}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>
        {stats?.leaderboard ? (
          rowsFor(stats, rank).length === 0 ? (
            <Text style={styles.muted}>Aucun encaissement sur la période.</Text>
          ) : (
            rowsFor(stats, rank).map((row, i) => (
              <View key={row.id} style={styles.rankRow}>
                <Text style={styles.rankMedal}>{['🏆', '🥈', '🥉'][i] ?? `${i + 1}.`}</Text>
                <View style={styles.rankNameWrap}>
                  <Text style={styles.rankName}>{row.name}</Text>
                </View>
                <Text style={styles.rankValue}>{rankValue(stats, rank, row.id)}</Text>
              </View>
            ))
          )
        ) : statsRes.error ? (
          <MiniError t={t} error={statsRes.error} />
        ) : (
          <LoadingInline t={t} />
        )}
      </Card>

      {/* CA + Manque à gagner */}
      <View style={styles.grid2}>
        <View style={styles.card}>
          <Text style={styles.cardTitleSans}>Chiffre d'affaires</Text>
          <Text style={styles.bigNum}>{eur(stats?.revenue.total_cents ?? 0, currency)}</Text>
          <Delta t={t} pc={deltaPct(stats?.revenue.previous_total_cents, stats?.revenue.total_cents)} />
        </View>
        <View style={styles.card}>
          <Text style={styles.cardTitleSans}>Manque à gagner</Text>
          <Text style={[styles.bigNum, { color: t.orange }]}>{eur(stats?.potential_revenue_cents ?? 0, currency)}</Text>
        </View>
      </View>
      <View style={styles.card}>
        <Text style={styles.detailLine}>
          <Text style={styles.muted}>Créneaux libres</Text>
          <Text style={styles.detailValue}>  {eur(stats?.free_revenue_cents ?? 0, currency)}</Text>
        </Text>
        <Text style={styles.detailLine}>
          <Text style={styles.muted}>
            RDV annulés / absents{stats?.missed_appointments ? ` (${stats.missed_appointments} RDV)` : ''}
          </Text>
          <Text style={styles.detailValue}>  {eur(stats?.missed_revenue_cents ?? 0, currency)}</Text>
        </Text>
        <Text style={styles.note}>Temps déjà passé seulement, au prix moyen des prestations de chaque coiffeur.</Text>
      </View>

      {/* Prochains RDV */}
      <Card title="Prochains RDV" t={t}>
        {apptsRes.data ? (
          upcoming.length === 0 ? (
            <Text style={styles.muted}>Aucun rendez-vous à venir</Text>
          ) : (
            upcoming.map((a) => (
              <View key={a.id} style={styles.rdvRow}>
                <Text style={styles.rdvWhen}>{formatSalonDate(a.scheduled_at)}</Text>
                <Text style={styles.rdvName} numberOfLines={1}>{a.client_name ?? 'Client'} · {a.service_name ?? 'Prestation'}</Text>
              </View>
            ))
          )
        ) : (
          <LoadingInline t={t} />
        )}
      </Card>

      {/* Catalogue */}
      <Card title="Catalogue" t={t}>
        {catRes.data ? (
          <>
            <CatalogRow t={t} label="Prestations" value={String(catRes.data.services.length)} />
            <CatalogRow t={t} label="Suppléments" value={String(catRes.data.extras.length)} />
            <CatalogRow
              t={t}
              label="Produits"
              value={
                String(catRes.data.products.length) +
                (catRes.data.products.some((p) => p.stock_enabled) ? ` · ${catRes.data.products.reduce((a, p) => a + Number(p.stock_quantity ?? 0), 0)} en stock` : '')
              }
            />
          </>
        ) : (
          <LoadingInline t={t} />
        )}
      </Card>

      {/* Encaissé du salon */}
      <Card title="Encaissé du salon" t={t}>
        <Text style={styles.muted}>{range.label}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10 }}>
          <Text style={[styles.bigNum, { marginTop: 0 }]}>{eur(chartValues.reduce<number>((a, v) => a + (v ?? 0), 0), currency)}</Text>
          <Delta t={t} pc={deltaPct(stats?.previous_total_cents, stats?.total_cents)} />
        </View>
        {chart ? (
          <View style={styles.chart}>
            <Text style={{ color: t.grey, fontSize: 12, minHeight: 18 }}>
              {selectedBar !== null && chartValues[selectedBar] != null
                ? `${chartLabels[selectedBar]} : ${eur(Number(chartValues[selectedBar]), currency)}`
                : 'Touchez une barre pour le détail'}
            </Text>
            <View style={styles.chartBars}>
              {chartValues.map((v, i) => {
                const h = Math.max(3, ((Number(v) || 0) / maxChart) * 104);
                const dense = chartValues.length > 12;
                return (
                  <Pressable key={i} onPress={() => setSelectedBar((s) => (s === i ? null : i))} style={styles.chartCol}>
                    <View
                      style={{
                        width: '100%',
                        height: h,
                        borderRadius: dense ? 2 : 6,
                        backgroundColor: (Number(v) || 0) === maxChart && maxChart > 0 ? t.blue : selectedBar === i ? t.blue : t.blueSoft,
                      }}
                    />
                    {(!dense || i % 5 === 0) ? <Text style={styles.chartTick} numberOfLines={1}>{chartLabels[i]}</Text> : <Text style={styles.chartTick}> </Text>}
                  </Pressable>
                );
              })}
            </View>
          </View>
        ) : (
          <LoadingInline t={t} />
        )}
      </Card>

      {/* La journée en un coup d'œil */}
      <Card title="La journée en un coup d'œil" t={t}>
        {monthRes.data ? (
          todayAppts.length === 0 ? (
            <Text style={styles.muted}>Aucun rendez-vous aujourd'hui</Text>
          ) : (
            <>
              {barbers.map((b) => (
                <View key={b.id} style={styles.gladRow}>
                  <View style={[styles.gladAvatar, { backgroundColor: (String((b as Record<string, unknown>).color ?? t.grey)) }]}>
                    <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>{initials(b.name)}</Text>
                  </View>
                  <View style={styles.gladTrack}>
                    {todayAppts
                      .filter((a) => a.barber_id === b.id)
                      .map((a) => {
                        const appt = a as AdminAppointment;
                        const start = toMinutes(String(appt.scheduled_at).slice(11, 16));
                        const dur = Math.max(5, Number(appt.service_duration_min ?? 30) + Number(appt.extras_duration_min ?? 0));
                        const ended = start + dur <= nowMin;
                        const dimmed = appt.status !== 'confirmed';
                        const left = Math.min(100, Math.max(0, ((start - 540) / 600) * 100));
                        const width = Math.min(100 - left, Math.max(2, (dur / 600) * 100));
                        return (
                          <View
                            key={a.id}
                            style={{
                              position: 'absolute',
                              top: 3,
                              bottom: 3,
                              borderRadius: 4,
                              backgroundColor: String((b as Record<string, unknown>).color ?? t.blue),
                              opacity: dimmed ? 0.15 : ended ? 0.3 : 0.85,
                              left: `${left}%`,
                              width: `${width}%`,
                            }}
                          />
                        );
                      })}
                    {nowMin >= 540 && nowMin <= 1140 ? (
                      <View style={{ position: 'absolute', top: 0, bottom: 0, width: 2, backgroundColor: t.red, left: `${((nowMin - 540) / 600) * 100}%` }} />
                    ) : null}
                  </View>
                </View>
              ))}
              <View style={[styles.chartTicksRow, { marginLeft: 34 }]}>
                {['09:00', '12:00', '15:00', '19:00'].map((h) => (
                  <Text key={h} style={styles.chartTick}>{h}</Text>
                ))}
              </View>
            </>
          )
        ) : (
          <LoadingInline t={t} />
        )}
      </Card>
      {settingsRes.data ? null : settingsRes.error ? <MiniError inline t={t} error={settingsRes.error} /> : <LoadingInline t={t} />}
      <Text style={styles.footnote}>Fenêtre affichée 09:00 – 19:00 · minutes et montants calculés côté serveur.</Text>
    </ScrollView>
  );
}

/* ---------- Helpers ---------- */

type UseApiResult<T> = { data: T | null; error: unknown; loading: boolean; reload: () => void };

/** Petit hook d'appel unique (non pôlé) — le polling existe via usePolling. */
function useApi<T>(fetcher: () => Promise<T>, refreshKey = 0): UseApiResult<T> {
  const [data, setData] = React.useState<T | null>(null);
  const [error, setError] = React.useState<unknown>(null);
  const [loading, setLoading] = React.useState(true);
  const [tick, setTick] = React.useState(0);
  React.useEffect(() => {
    let alive = true;
    setLoading(true);
    void (async () => {
      try {
        const result = await fetcher();
        if (alive) { setData(result); setError(null); }
      } catch (err) {
        if (alive) setError(err);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [fetcher, tick, refreshKey]);
  const reload = React.useCallback(() => setTick((n) => n + 1), []);
  return { data, error, loading, reload };
}

function eur(cents: number, currency = 'EUR'): string {
  return formatPriceCents(cents, currency);
}

function deltaPct(prev: number | undefined | null, cur: number | undefined | null): number | null {
  if (!prev || prev <= 0) return null;
  const pc = Math.round(((Number(cur ?? 0) - prev) / prev) * 100);
  return pc === 0 ? (cur ? 0 : null) : pc;
}

function labelShort(label: string): string {
  // "09:00" pour les heures du jour ; "2026-11-09" pour les dates.
  const parts = label.split('T');
  return parts.length === 2 ? parts[1].slice(0, 5) : label.slice(5);
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + (m || 0);
}

function initials(name: string | null | undefined): string {
  return (name ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('') || '—';
}

type Rank = 'ca' | 'speed' | 'produits';

function rowsFor(stats: SalonStatsResponse, rank: Rank): { id: string; name: string }[] {
  if (rank === 'ca') return stats.leaderboard.by_revenue.slice(0, 3);
  if (rank === 'speed') return stats.leaderboard.by_speed.slice(0, 3);
  return stats.leaderboard.by_products.slice(0, 3);
}

function rankValue(stats: SalonStatsResponse, rank: Rank, id: string): string {
  const r = stats.leaderboard;
  if (rank === 'ca') {
    const row = r.by_revenue.find((x) => x.id === id);
    return row ? formatPriceCents(row.revenue_cents) : '';
  }
  if (rank === 'speed') {
    const row = r.by_speed.find((x) => x.id === id);
    return row ? `${Math.round(Number(row.avg_minutes))} min` : '';
  }
  const row = r.by_products.find((x) => x.id === id);
  return row ? `${row.product_count} vendus` : '';
}

/* ---------- Sous-composants ---------- */

function Kpi({ t, icon, value, label, loading }: { t: Palette; icon: string; value: string; label: string; loading?: boolean }) {
  const styles = stylesFor(t);
  return (
    <View style={styles.kpi}>
      <Ionicons name={icon as never} size={16} color={t.blue} />
      <View style={{ gap: 0 }}>
        <Text style={styles.kpiValue}>{loading ? '…' : value}</Text>
        <Text style={styles.kpiLabel}>{label}</Text>
      </View>
    </View>
  );
}

function PillDot({ t, color, label, value }: { t: Palette; color: string; label: string; value: number }) {
  const styles = stylesFor(t);
  return (
    <View style={styles.pill}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
      <Text style={styles.pillText}>
        {label} <Text style={{ fontWeight: '700' }}>{value}</Text>
      </Text>
    </View>
  );
}

function CatalogRow({ t, label, value }: { t: Palette; label: string; value: string }) {
  const styles = stylesFor(t);
  return (
    <View style={styles.catRow}>
      <Text style={styles.catLabel}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <Text style={styles.catValue}>{value}</Text>
        <Ionicons name="chevron-forward" size={14} color={t.grey} />
      </View>
    </View>
  );
}

function Delta({ t, pc }: { t: Palette; pc: number | null }) {
  const styles = stylesFor(t);
  if (pc === null) return <Text style={styles.deltaFlat}>= </Text>;
  return (
    <Text style={[styles.delta, pc > 0 ? styles.deltaUp : styles.deltaDown]}>
      {pc > 0 ? '▲ +' : '▼ −'}
      {Math.abs(pc)} %
    </Text>
  );
}

function MiniError({ t, error, inline }: { t: Palette; error: unknown; inline?: boolean }) {
  const styles = stylesFor(t);
  return (
    <Text style={[styles.muted, inline && { marginTop: 6 }]}>
      {error instanceof ApiError ? error.message : 'Impossible de charger ce bloc.'}
    </Text>
  );
}

function LoadingInline({ t }: { t: Palette }) {
  return <ActivityIndicator color={t.blue} style={{ paddingVertical: 10 }} />;
}

const stylesFor = (t: Palette) =>
  StyleSheet.create({
    content: { padding: spacing.lg, paddingBottom: spacing.xl + spacing.lg, gap: spacing.md + 2 },
    welcome: { color: t.ink, fontSize: 26, fontWeight: '800', letterSpacing: -0.5 },
    date: { color: t.grey, fontSize: 14, textTransform: 'capitalize' },
    grid2: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    kpi: {
      backgroundColor: t.card,
      borderColor: t.sep,
      borderWidth: StyleSheet.hairlineWidth,
      borderRadius: radius.card,
      padding: 12,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      flexGrow: 1,
      flexBasis: '46%',
    },
    kpiValue: { color: t.ink, fontSize: 19, fontWeight: '800' },
    kpiLabel: { color: t.grey, fontSize: 12 },
    pillList: { gap: 8 },
    pill: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    pillText: { color: t.ink, fontSize: 13.5 },
    periodBar: {
      flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: t.card,
      borderWidth: StyleSheet.hairlineWidth, borderColor: t.sep, borderRadius: radius.button, padding: 6,
    },
    periodChip: { borderRadius: radius.button, paddingVertical: 7, paddingHorizontal: 12 },
    periodChipOn: { backgroundColor: t.blueSoft },
    periodChipText: { color: t.grey, fontWeight: '600', fontSize: 13 },
    periodChipTextOn: { color: t.blue },
    periodLabel: { color: t.ink, fontSize: 13, fontWeight: '600', textTransform: 'capitalize', minWidth: 110, textAlign: 'center' },
    arrow: { padding: 4 },
    rankTabs: { flexDirection: 'row', gap: 6, marginBottom: 6 },
    rankTab: { flex: 1, borderRadius: radius.button, paddingVertical: 7, alignItems: 'center', backgroundColor: t.fill },
    rankTabOn: { backgroundColor: t.blueSoft },
    rankTabText: { color: t.grey, fontWeight: '700', fontSize: 13 },
    rankTabTextOn: { color: t.blue },
    rankRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9 },
    rankMedal: { width: 24, fontSize: 15 },
    rankNameWrap: { flex: 1 },
    rankName: { color: t.ink, fontWeight: '600', fontSize: 14.5 },
    rankValue: { color: t.ink, fontWeight: '700' },
    card: {
      backgroundColor: t.card, borderColor: t.sep, borderWidth: StyleSheet.hairlineWidth,
      borderRadius: radius.card, padding: 14, gap: 4,
    },
    cardTitleSans: { color: t.grey, fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8 },
    bigNum: { color: t.ink, fontSize: 24, fontWeight: '800', marginTop: 2 },
    detailLine: { color: t.ink, fontSize: 14, flexDirection: 'row', marginTop: 2 },
    detailValue: { color: t.ink, fontWeight: '700' },
    muted: { color: t.grey, fontSize: 13.5 },
    note: { color: t.grey, fontSize: 11.5, marginTop: 4, fontStyle: 'italic' },
    delta: { fontSize: 12.5, fontWeight: '700' },
    deltaUp: { color: t.green },
    deltaDown: { color: t.red },
    deltaFlat: { color: t.grey, fontSize: 12.5 },
    rdvRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 5 },
    rdvWhen: { color: t.grey, fontSize: 12.5, width: 76 },
    rdvName: { color: t.ink, fontSize: 14.5, flex: 1, fontWeight: '600' },
    catRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 9 },
    catLabel: { color: t.ink, fontSize: 14.5 },
    catValue: { color: t.ink, fontWeight: '700', fontSize: 14.5 },
    chart: { gap: 6, marginTop: 8 },
    chartBars: { flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: 130 },
    chartCol: { flex: 1, alignItems: 'center', gap: 4, height: '100%', justifyContent: 'flex-end' },
    chartTick: { color: t.grey, fontSize: 10.5 },
    chartTicksRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
    gladRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 },
    gladAvatar: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    gladTrack: { flex: 1, height: 22, borderRadius: 7, backgroundColor: t.fill, overflow: 'hidden' },
    footnote: { color: t.grey, fontSize: 11.5, fontStyle: 'italic', textAlign: 'center', marginTop: 4 },
  });
