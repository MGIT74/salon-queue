// DASHBOARD ADMIN (section 1) — reproduction du tab #t-dashboard du web,
// branché sur les routes réelles de main (étape A) :
//   owner/profile, barbers?all, owner/client-stats, queue/history,
//   appointments (liste + mois caisse_view), barbers/salon-stats,
//   settings/public (devise + fuseau). Aucun calcul métier ici : bornes de
//   période côté mobile (comme le navigateur web), tout le reste = serveur.
import React, { useCallback, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '../../components/Card';
import {
  Avatar,
  BarChart,
  Chip,
  EmptyText,
  ErrorText,
  Grid2,
  InlineLoading,
  KpiTile,
  ListRow,
  MiniStat,
  PageTitle,
  PeriodNav,
  RowText,
  SectionHeader,
  Segmented,
  StatPill,
} from '../../components/ui';
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
import { Palette, cardShadow, spacing } from '../../theme/theme';
import { CustomRange, PeriodKey, localDateStr, periodRange } from '../../utils/period';
import { DateRangeSheet } from '../../components/DateRangeSheet';
import { formatPriceCents, salonNowMinutes, salonTodayStr } from '../../utils/format';
import { AdminAppointment, BarberPublic, SalonStatsResponse } from '../../types/api';

// Couleur d'avatar quand le serveur n'en fournit pas (purement décoratif).
const AVATAR_COLORS = ['#5e5ce6', '#ff9f0a', '#30b0c7', '#34c759', '#ff375f', '#af52de', '#0a84ff', '#a2845e'];

export function DashboardScreen({ bottomSpace = 110 }: { bottomSpace?: number }) {
  const t = useTheme();
  const styles = stylesFor(t);
  const { admin } = useAuth();

  const [period, setPeriod] = useState<PeriodKey>('week');
  const [offset, setOffset] = useState(0);
  const [rank, setRank] = useState<'ca' | 'speed' | 'produits'>('ca');
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedBar, setSelectedBar] = useState<number | null>(null);
  // Plage (web : customFrom / customTo, aujourd'hui par défaut).
  const [custom, setCustom] = useState<CustomRange>(() => {
    const d = localDateStr(new Date());
    return { from: d, to: d };
  });
  const [rangeOpen, setRangeOpen] = useState(false);

  const auth: ApiAuth = admin
    ? { kind: 'admin', adminPassword: admin.adminPassword }
    : { kind: 'public' };
  const salonSlug = admin?.salonSlug ?? '';

  const range = useMemo(() => periodRange(period, offset, custom), [period, offset, custom]);

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
  const chartLabels = (chart?.labels ?? []).map((l) => labelShort(l, period));
  const maxChart = Math.max(1, ...chartValues.map((v) => v ?? 0));

  const barberColor = (id: string | null | undefined): string => {
    const idx = barbers.findIndex((b) => b.id === id);
    const b = idx >= 0 ? barbers[idx] : undefined;
    const c = b ? (b as Record<string, unknown>).color : null;
    return typeof c === 'string' && c ? c : AVATAR_COLORS[(idx >= 0 ? idx : 0) % AVATAR_COLORS.length];
  };

  const ranking = stats?.leaderboard ? rowsFor(stats, rank) : [];
  const rankMax = stats ? Math.max(1, ...ranking.map((r) => rankAmount(stats, rank, r.id))) : 1;
  const encaisse = chartValues.reduce<number>((a, v) => a + (Number(v) || 0), 0);
  // Tous les coiffeurs actifs qui prennent des RDV (ou en ont un aujourd'hui) : la frise reste visible même vide.
  const glanceBarbers = barbers.filter(
    (b) => b.active && (b.accepts_appointments !== 0 || todayAppts.some((a) => a.barber_id === b.id))
  );

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={[styles.content, { paddingBottom: bottomSpace }]}
      refreshControl={
        <RefreshControl refreshing={false} onRefresh={reloadAll} tintColor={t.blue} />
      }
    >
      <PageTitle
        t={t}
        title={welcome ? 'Bienvenue, ' : 'Bienvenue'}
        accent={welcome || undefined}
        subtitle={capitalize(new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }))}
      />

      {/* Chiffres clés */}
      <Grid2>
        <KpiTile t={t} icon="people-outline" tone="blue" value={String(barbers.filter((b) => b.active).length)} label="Coiffeurs actifs" loading={!barbersRes.data} />
        <KpiTile t={t} icon="umbrella-outline" tone="orange" value={String(barbers.filter((b) => b.active && b.on_leave_today).length)} label="En congé" loading={!barbersRes.data} />
        <KpiTile t={t} icon="person-outline" tone="green" value={String(queueCountRes.data?.total ?? 0)} label="Clients" loading={!queueCountRes.data} />
        <KpiTile t={t} icon="calendar-outline" tone="blue" value={String(apptsRes.data?.items.length ?? 0)} label="RDV à venir" loading={!apptsRes.data} />
      </Grid2>

      {/* La journée en un coup d'œil (09:00 – 19:00) */}
      <SectionHeader t={t} title="La journée en un coup d'œil" />
      <Card t={t} style={styles.block}>
        {!monthRes.data ? (
          monthRes.error ? <ErrorText t={t} text={errText(monthRes.error)} onRetry={monthRes.reload} /> : <InlineLoading t={t} />
        ) : glanceBarbers.length === 0 ? (
          <EmptyText t={t} text="Aucun coiffeur ne prend de rendez-vous" />
        ) : (
          <View>
            <View style={styles.glanceHead}>
              {['9h', '11h', '13h', '15h', '17h', '19h'].map((h) => (
                <Text key={h} style={styles.tick}>{h}</Text>
              ))}
            </View>
            {glanceBarbers.map((b) => (
              <View key={b.id} style={styles.glanceRow}>
                <Avatar t={t} name={b.name} color={barberColor(b.id)} size={30} />
                <View style={styles.lane}>
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
                          style={[styles.slot, {
                            backgroundColor: barberColor(b.id),
                            opacity: dimmed ? 0.15 : ended ? 0.35 : 0.9,
                            left: `${left}%`,
                            width: `${width}%`,
                          }]}
                        />
                      );
                    })}
                  {nowMin >= 540 && nowMin <= 1140 ? (
                    <View style={[styles.now, { backgroundColor: t.red, left: `${((nowMin - 540) / 600) * 100}%` }]} />
                  ) : null}
                </View>
              </View>
            ))}
            {todayAppts.length === 0 ? <Text style={styles.glanceEmpty}>Aucun rendez-vous aujourd'hui</Text> : null}
          </View>
        )}
      </Card>

      {/* Période (Plage personnalisée : à venir) */}
      <Segmented
        t={t}
        options={[
          { key: 'day' as PeriodKey, label: 'Jour' },
          { key: 'week' as PeriodKey, label: 'Semaine' },
          { key: 'month' as PeriodKey, label: 'Mois' },
          { key: 'range' as PeriodKey, label: 'Plage' },
        ]}
        value={period}
        onChange={(p) => {
          setPeriod(p);
          setOffset(0);
          setSelectedBar(null);
          if (p === 'range') setRangeOpen(true);
        }}
      />
      {period === 'range' ? (
        <TouchableOpacity style={styles.rangeBtn} onPress={() => setRangeOpen(true)} accessibilityRole="button">
          <View style={{ flex: 1 }}>
            <Text style={styles.rangeLabel}>Du</Text>
            <Text style={styles.rangeValue}>{dayLong(custom.from)}</Text>
          </View>
          <Ionicons name="arrow-forward" size={16} color={t.grey} />
          <View style={{ flex: 1, alignItems: 'flex-end' }}>
            <Text style={styles.rangeLabel}>Au</Text>
            <Text style={styles.rangeValue}>{dayLong(custom.to)}</Text>
          </View>
        </TouchableOpacity>
      ) : (
        <PeriodNav
          t={t}
          label={range.label}
          onPrev={() => { setOffset((o) => o - 1); setSelectedBar(null); }}
          onNext={() => { setOffset((o) => o + 1); setSelectedBar(null); }}
          nextDisabled={offset >= 0}
        />
      )}
      <DateRangeSheet
        t={t}
        visible={rangeOpen}
        value={custom}
        onClose={() => setRangeOpen(false)}
        onApply={(r) => { setCustom(r); setSelectedBar(null); setRangeOpen(false); }}
      />

      {/* Chiffre d'affaires + Manque à gagner */}
      <Grid2>
        <MiniStat
          t={t}
          label="Chiffre d'affaires"
          value={eur(stats?.revenue.total_cents ?? 0, currency)}
          loading={!stats}
          detail={stats ? `${deltaLabel(deltaPct(stats.revenue.previous_total_cents, stats.revenue.total_cents))} vs période précédente` : undefined}
        />
        <MiniStat
          t={t}
          label="Manque à gagner"
          value={eur(stats?.potential_revenue_cents ?? 0, currency)}
          valueColor={t.orange}
          loading={!stats}
          detail={
            stats
              ? `Créneaux libres ${eur(stats.free_revenue_cents ?? 0, currency)} · Annulés / absents ${eur(stats.missed_revenue_cents ?? 0, currency)}${stats.missed_appointments ? ` (${stats.missed_appointments} RDV)` : ''}`
              : undefined
          }
        />
      </Grid2>

      {/* Encaissé du salon + courbe */}
      <Card t={t} title="Encaissé du salon" style={styles.block}>
        {statsRes.error && !stats ? (
          <ErrorText t={t} text={errText(statsRes.error)} onRetry={statsRes.reload} />
        ) : !stats ? (
          <InlineLoading t={t} />
        ) : (
          <>
            <View style={styles.bigRow}>
              <Text style={styles.big} numberOfLines={1} adjustsFontSizeToFit>
                {selectedBar !== null && chartValues[selectedBar] != null ? eur(Number(chartValues[selectedBar]), currency) : eur(encaisse, currency)}
              </Text>
              {selectedBar === null ? <DeltaInline t={t} pc={deltaPct(stats.previous_total_cents, stats.total_cents)} /> : null}
            </View>
            <Text style={styles.sub}>
              {selectedBar !== null ? chartLabels[selectedBar] : 'vs période précédente · touchez une barre pour le détail'}
            </Text>
            {chart ? (
              <BarChart t={t} values={chartValues.map((v) => Number(v) || 0)} labels={chartLabels} selected={selectedBar} onSelect={setSelectedBar} />
            ) : null}
          </>
        )}
      </Card>

      {/* Classement */}
      <SectionHeader t={t} title="Classement" />
      <Card t={t} flush style={styles.block}>
        <View style={{ paddingHorizontal: spacing.md, paddingTop: 12, paddingBottom: 6 }}>
          <Segmented
            t={t}
            options={[
              { key: 'ca' as Rank, label: 'CA' },
              { key: 'speed' as Rank, label: 'Rapidité' },
              { key: 'produits' as Rank, label: 'Produits' },
            ]}
            value={rank}
            onChange={setRank}
          />
        </View>
        {!stats ? (
          statsRes.error ? <ErrorText t={t} text={errText(statsRes.error)} /> : <InlineLoading t={t} />
        ) : ranking.length === 0 ? (
          <EmptyText t={t} text="Aucun encaissement sur la période" />
        ) : (
          ranking.map((row, i) => (
            <ListRow
              key={row.id}
              t={t}
              first={i === 0}
              inset={102}
              left={
                <>
                  <Text style={[styles.rk, i === 0 && { color: t.orange }]}>{i + 1}</Text>
                  <Avatar t={t} name={row.name} color={barberColor(row.id)} />
                </>
              }
              right={<Text style={styles.amt}>{rankValue(stats, rank, row.id)}</Text>}
            >
              <Text style={styles.rowTitle} numberOfLines={1}>{row.name}</Text>
              {rank !== 'speed' ? (
                <View style={[styles.track, { backgroundColor: t.fill }]}>
                  <View style={{ height: '100%', borderRadius: 2, backgroundColor: t.blue, width: `${Math.round((rankAmount(stats, rank, row.id) / rankMax) * 100)}%` }} />
                </View>
              ) : null}
            </ListRow>
          ))
        )}
      </Card>

      {/* Prochains RDV */}
      <SectionHeader t={t} title="Prochains RDV" />
      <Card t={t} flush style={styles.block}>
        {!apptsRes.data ? (
          apptsRes.error ? <ErrorText t={t} text={errText(apptsRes.error)} onRetry={apptsRes.reload} /> : <InlineLoading t={t} />
        ) : upcoming.length === 0 ? (
          <EmptyText t={t} text="Aucun rendez-vous à venir" />
        ) : (
          upcoming.map((a, i) => {
            const day = String(a.scheduled_at).slice(0, 10);
            const when = String(a.scheduled_at).slice(11, 16);
            const dayLabel = day === today ? '' : shortDay(day);
            const barberName = a.barber_name ?? barberById.get(a.barber_id ?? '')?.name ?? null;
            return (
              <ListRow
                key={a.id}
                t={t}
                first={i === 0}
                left={
                  <View style={{ width: 50 }}>
                    <Text style={styles.time}>{when}</Text>
                    {dayLabel ? <Text style={styles.timeDay}>{dayLabel}</Text> : null}
                  </View>
                }
                right={barberName ? <Chip t={t} label={barberName} /> : undefined}
              >
                <RowText t={t} title={a.client_name ?? 'Client'} meta={a.service_name ?? 'Prestation'} />
              </ListRow>
            );
          })
        )}
      </Card>

      {/* Clientèle */}
      <SectionHeader t={t} title="Clientèle" />
      <Card t={t} style={styles.block}>
        {clientStatsRes.data ? (
          <View style={{ gap: 8 }}>
            <View style={styles.pillRow}>
              <View style={{ flex: 1 }}><StatPill t={t} color={t.blue} label="Comptes clients" value={String(clientStatsRes.data.accounts)} /></View>
              <View style={{ flex: 1 }}><StatPill t={t} color={t.green} label="Cartes fidélité actives" value={String(clientStatsRes.data.loyalty)} /></View>
            </View>
            <View style={styles.pillRow}>
              <View style={{ flex: 1 }}><StatPill t={t} color={t.orange} label="Cartes cadeaux en cours" value={String(clientStatsRes.data.gifts)} /></View>
              <View style={{ flex: 1 }}><StatPill t={t} color={t.grey} label="Clients sans compte" value={String(clientStatsRes.data.without_account)} /></View>
            </View>
          </View>
        ) : clientStatsRes.error ? (
          <ErrorText t={t} text={errText(clientStatsRes.error)} onRetry={clientStatsRes.reload} />
        ) : (
          <InlineLoading t={t} />
        )}
      </Card>

      {/* Catalogue */}
      <SectionHeader t={t} title="Catalogue" />
      <Card t={t} flush style={styles.block}>
        {catRes.data ? (
          <>
            <ListRow t={t} first right={<Text style={styles.val}>{catRes.data.services.length}</Text>}>
              <Text style={styles.rowPlain}>Prestations</Text>
            </ListRow>
            <ListRow t={t} right={<Text style={styles.val}>{catRes.data.extras.length}</Text>}>
              <Text style={styles.rowPlain}>Suppléments</Text>
            </ListRow>
            <ListRow
              t={t}
              right={
                <Text style={styles.val}>
                  {catRes.data.products.length}
                  {catRes.data.products.some((p) => p.stock_enabled)
                    ? ` · ${catRes.data.products.reduce((a, p) => a + Number(p.stock_quantity ?? 0), 0)} en stock`
                    : ''}
                </Text>
              }
            >
              <Text style={styles.rowPlain}>Produits</Text>
            </ListRow>
          </>
        ) : catRes.error ? (
          <ErrorText t={t} text={errText(catRes.error)} onRetry={catRes.reload} />
        ) : (
          <InlineLoading t={t} />
        )}
      </Card>
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

function labelShort(label: string, period: PeriodKey): string {
  // Heures du jour : "…T09:00" → "9h". Dates : semaine → initiale du jour (L, M…), mois → numéro du jour.
  const parts = label.split('T');
  if (parts.length === 2) return `${Number(parts[1].slice(0, 2))}h`;
  if (period === 'week') {
    const d = new Date(`${label.slice(0, 10)}T12:00:00`);
    if (!Number.isNaN(d.getTime())) return ['D', 'L', 'M', 'M', 'J', 'V', 'S'][d.getDay()];
  }
  return String(Number(label.slice(8, 10)) || label);
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + (m || 0);
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

function DeltaInline({ t, pc }: { t: Palette; pc: number | null }) {
  if (pc === null) return null;
  const up = pc >= 0;
  return (
    <View style={{ backgroundColor: up ? t.greenSoft : t.redSoft, borderRadius: 99, paddingVertical: 3, paddingHorizontal: 8 }}>
      <Text style={{ color: up ? t.green : t.red, fontSize: 13, fontWeight: '600' }}>{up ? '▲' : '▼'} {Math.abs(pc)} %</Text>
    </View>
  );
}

function errText(error: unknown): string {
  return error instanceof ApiError ? error.message : 'Impossible de charger ce bloc.';
}

function deltaLabel(pc: number | null): string {
  if (pc === null) return '—';
  return `${pc >= 0 ? '+' : '−'}${Math.abs(pc)} %`;
}

/** « 2026-11-16 » → « Lun. 16 nov. ». */
function dayLong(ymd: string): string {
  const d = new Date(`${ymd}T12:00:00`);
  return Number.isNaN(d.getTime()) ? ymd : capitalize(d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' }));
}

function capitalize(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/** « 2026-11-21 » → « sam. 21 » (heure du salon déjà dans la chaîne). */
function shortDay(ymd: string): string {
  const d = new Date(`${ymd}T12:00:00`);
  return Number.isNaN(d.getTime()) ? ymd : d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' });
}

function rankAmount(stats: SalonStatsResponse, rank: Rank, id: string): number {
  const r = stats.leaderboard;
  if (rank === 'ca') return Number(r.by_revenue.find((x) => x.id === id)?.revenue_cents ?? 0);
  if (rank === 'produits') return Number(r.by_products.find((x) => x.id === id)?.product_count ?? 0);
  return 0;
}

const stylesFor = (t: Palette) =>
  StyleSheet.create({
    content: { paddingHorizontal: spacing.page, paddingTop: 4 },
    block: { marginBottom: spacing.block },
    glanceHead: { flexDirection: 'row', justifyContent: 'space-between', marginLeft: 38, marginBottom: 6 },
    tick: { color: t.grey, fontSize: 11, fontVariant: ['tabular-nums'] },
    glanceRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
    lane: { flex: 1, height: 30, borderRadius: 8, backgroundColor: t.fill, overflow: 'hidden' },
    slot: { position: 'absolute', top: 4, bottom: 4, borderRadius: 5 },
    now: { position: 'absolute', top: 0, bottom: 0, width: 2, borderRadius: 1 },
    bigRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    big: { color: t.ink, fontSize: 34, fontWeight: '700', letterSpacing: -1, fontVariant: ['tabular-nums'], flexShrink: 1 },
    sub: { color: t.grey, fontSize: 13, marginTop: 2 },
    rk: { width: 22, textAlign: 'center', fontSize: 15, fontWeight: '700', color: t.grey, fontVariant: ['tabular-nums'] },
    rowTitle: { color: t.ink, fontSize: 16, fontWeight: '600' },
    rowPlain: { color: t.ink, fontSize: 16 },
    amt: { color: t.ink, fontSize: 16, fontWeight: '600', fontVariant: ['tabular-nums'] },
    track: { height: 4, borderRadius: 2, marginTop: 6, overflow: 'hidden' },
    time: { color: t.ink, fontSize: 15, fontWeight: '700', fontVariant: ['tabular-nums'] },
    timeDay: { color: t.grey, fontSize: 11, marginTop: 1 },
    val: { color: t.grey, fontSize: 16, fontVariant: ['tabular-nums'] },
    pillRow: { flexDirection: 'row', gap: 8 },
    glanceEmpty: { color: t.grey, fontSize: 13, textAlign: 'center', marginTop: 2 },
    rangeBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 10, marginBottom: 14,
      backgroundColor: t.card, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 14, ...cardShadow(t),
    },
    rangeLabel: { color: t.grey, fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.6 },
    rangeValue: { color: t.ink, fontSize: 15, fontWeight: '600', marginTop: 2 },
  });
