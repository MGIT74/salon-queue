// RENDEZ-VOUS (section admin) — maquette maquettes-app.html « File & RDV ».
// Agenda Jour / Semaine / Mois, filtres Statut et Coiffeur, fiche d'un RDV.
// Données : GET /api/appointments?month=YYYY-MM&all=1 (un appel par mois
// affiché, comme l'agenda du web) + GET /api/barbers?all=1. Aucune règle
// métier ici : statut affiché, prix, créneaux et actions viennent du serveur.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../auth/AuthContext';
import { ApiAuth, ApiError } from '../../api/transport';
import { fetchAdminAppointments, fetchBarbers, fetchSalonPublic } from '../../api/endpoints';
import { AdminAppointment, BarberPublic } from '../../types/api';
import { useTheme } from '../../hooks/useTheme';
import { useLayout } from '../../hooks/useLayout';
import { Palette, cardShadow, spacing } from '../../theme/theme';
import { salonNowMinutes, salonTodayStr } from '../../utils/format';
import { barberColorFor, tint } from '../../utils/barberColor';
import { Card } from '../../components/Card';
import { Avatar, Chip, EmptyText, ErrorText, InlineLoading, PageTitle, Segmented } from '../../components/ui';
import { AppointmentSheet } from '../../components/AppointmentSheet';
import { AddAppointmentSheet } from '../../components/AddAppointmentSheet';
import { DayColumns, DayGlance } from '../../components/DayAgenda';
import { ListRow } from '../../components/ui';
import { exportRdvCsv, exportRdvPdf } from '../../utils/exportRdv';

type View3 = 'day' | 'week' | 'month';
type StatusFilter = 'all' | 'confirmed' | 'completed' | 'no_show' | 'cancelled';

const STATUS_OPTS: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: 'Tous' },
  { key: 'confirmed', label: 'Confirmés' },
  { key: 'completed', label: 'Terminés' },
  { key: 'no_show', label: 'Absents' },
  { key: 'cancelled', label: 'Annulés' },
];

/* ---------- dates (chaînes YYYY-MM-DD, heure du salon) ---------- */
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const parse = (s: string) => new Date(`${s}T12:00:00`);
const addDays = (s: string, n: number) => ymd(new Date(parse(s).getTime() + n * 86400000));
const mondayOf = (s: string) => addDays(s, -((parse(s).getDay() + 6) % 7));
const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const fmt = (s: string, o: Intl.DateTimeFormatOptions) => parse(s).toLocaleDateString('fr-FR', o);
const toMin = (hm: string) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5));

export function RendezVousScreen({ bottomSpace = 110 }: { bottomSpace?: number }) {
  const t = useTheme();
  const styles = stylesFor(t);
  const { admin } = useAuth();
  const { isTablet } = useLayout();
  const salonSlug = admin?.salonSlug ?? '';
  const auth: ApiAuth = useMemo(() => (admin ? { kind: 'admin', adminPassword: admin.adminPassword } : { kind: 'public' }), [admin]);

  const [tz, setTz] = useState('Europe/Paris');
  const [today, setToday] = useState(salonTodayStr('Europe/Paris'));
  const [view, setView] = useState<View3>('day');
  const [date, setDate] = useState(today);
  const [status, setStatus] = useState<StatusFilter>('all');
  const [barberFilter, setBarberFilter] = useState<string>('all');
  const [barbers, setBarbers] = useState<BarberPublic[]>([]);
  const [months, setMonths] = useState<Record<string, AdminAppointment[]>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [open, setOpen] = useState<AdminAppointment | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [addFor, setAddFor] = useState<{ date: string; time?: string; barberId?: string } | null>(null);
  const [toast, setToast] = useState('');
  const [exporting, setExporting] = useState<'' | 'csv' | 'pdf'>('');

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(''), 3500);
    return () => clearTimeout(id);
  }, [toast]);

  // Fuseau du salon (jour « aujourd'hui » du salon, pas celui du téléphone).
  useEffect(() => {
    fetchSalonPublic(salonSlug)
      .then((s) => {
        const z = (s as { timezone?: string }).timezone || 'Europe/Paris';
        setTz(z);
        const d = salonTodayStr(z);
        setToday(d);
        setDate(d);
      })
      .catch(() => undefined);
    fetchBarbers(salonSlug, { all: true })
      .then((r) => setBarbers(r.items))
      .catch(() => undefined);
  }, [salonSlug]);

  // Mois nécessaires à la vue (une semaine peut chevaucher deux mois).
  const neededMonths = useMemo(() => {
    if (view === 'month') return [date.slice(0, 7)];
    const start = view === 'week' ? mondayOf(date) : mondayOf(date);
    return Array.from(new Set([start.slice(0, 7), addDays(start, 6).slice(0, 7)]));
  }, [view, date]);

  const load = useCallback(async () => {
    if (!salonSlug) return;
    setLoading(true);
    setError(null);
    try {
      const res = await Promise.all(neededMonths.map((m) => fetchAdminAppointments(salonSlug, auth, { month: m })));
      setMonths((prev) => {
        const next = { ...prev };
        neededMonths.forEach((m, i) => { next[m] = res[i].items; });
        return next;
      });
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, [salonSlug, auth, neededMonths]);

  useEffect(() => { void load(); }, [load, reloadKey]);

  const all = useMemo(() => neededMonths.flatMap((m) => months[m] ?? []), [neededMonths, months]);
  const filtered = useMemo(
    () =>
      all
        .filter((a) => status === 'all' || (a.display_status ?? 'confirmed') === status)
        .filter((a) => barberFilter === 'all' || String(a.barber_id) === barberFilter)
        .sort((a, b) => String(a.scheduled_at).localeCompare(String(b.scheduled_at))),
    [all, status, barberFilter]
  );
  const byDay = useMemo(() => {
    const m: Record<string, AdminAppointment[]> = {};
    filtered.forEach((a) => { const d = String(a.scheduled_at).slice(0, 10); (m[d] = m[d] || []).push(a); });
    return m;
  }, [filtered]);
  const hasMonth = neededMonths.every((m) => months[m] !== undefined);

  const shift = (dir: number) => {
    if (view === 'day') setDate(addDays(date, dir));
    else if (view === 'week') setDate(addDays(date, dir * 7));
    else {
      const d = parse(date);
      setDate(ymd(new Date(d.getFullYear(), d.getMonth() + dir, 1)));
    }
  };

  const subtitle =
    view === 'day'
      ? cap(fmt(date, { weekday: 'long', day: 'numeric', month: 'long' }))
      : view === 'week'
        ? `${fmt(mondayOf(date), { day: 'numeric', month: 'short' })} – ${fmt(addDays(mondayOf(date), 6), { day: 'numeric', month: 'short' })}`
        : cap(fmt(date, { month: 'long', year: 'numeric' }));

  const bookableBarbers = barbers.filter((b) => b.active);
  // Colonnes du jour : coiffeurs actifs qui prennent des RDV (ou qui en ont un ce jour), filtre coiffeur compris.
  const dayBarbers = bookableBarbers
    .filter((b) => b.accepts_appointments !== 0 || (byDay[date] ?? []).some((a) => String(a.barber_id) === String(b.id)))
    .filter((b) => barberFilter === 'all' || String(b.id) === barberFilter);
  const nowMin = salonNowMinutes(tz);

  /* ---------- rendu d'un créneau (fond teinté à la couleur du coiffeur, sans liseré) ---------- */
  const slotCard = (a: AdminAppointment) => {
    const st = a.display_status ?? 'confirmed';
    const past = st !== 'confirmed';
    const color = barberColorFor(barbers, a.barber_id);
    const dur = Number(a.pricing?.total_duration_min ?? a.duration_min ?? 0);
    return (
      <Pressable
        key={a.id}
        onPress={() => setOpen(a)}
        accessibilityRole="button"
        style={[styles.slot, past ? styles.slotPast : { backgroundColor: tint(color, t) }]}
      >
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.slotName, past && { color: t.grey, fontWeight: '500' }]} numberOfLines={1}>{a.client_name || 'Client'}</Text>
          <Text style={styles.slotMeta} numberOfLines={1}>
            {a.service_name || 'Prestation'} · {a.barber_name ?? '—'}{dur ? ` · ${dur} min` : ''}
          </Text>
        </View>
        {st === 'completed' ? <Chip t={t} label="Terminé" /> : st === 'no_show' ? <StatusPill t={t} label="Absent" /> : st === 'cancelled' ? <StatusPill t={t} label="Annulé" /> : (
          <Avatar t={t} name={a.barber_name} color={color} size={26} />
        )}
      </Pressable>
    );
  };

  const week = Array.from({ length: 7 }, (_, i) => addDays(mondayOf(date), i));

  // RDV de la vue affichée (jour, semaine ou mois) avec les filtres : ce sont eux qu'on exporte.
  const shown = useMemo(() => {
    if (view === 'day') return byDay[date] ?? [];
    if (view === 'week') return week.flatMap((d) => byDay[d] ?? []);
    return filtered.filter((a) => String(a.scheduled_at).slice(0, 7) === date.slice(0, 7));
  }, [view, byDay, date, filtered, week]);

  const doExport = async (kind: 'csv' | 'pdf') => {
    if (exporting || !shown.length) return;
    setExporting(kind);
    try {
      if (kind === 'csv') await exportRdvCsv(shown, today);
      else await exportRdvPdf(shown, `Rendez-vous — ${subtitle}`);
    } catch (e) {
      setToast(e instanceof Error ? e.message : 'Export impossible');
    } finally {
      setExporting('');
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: bottomSpace }, isTablet && { paddingHorizontal: 28, paddingTop: 16 }]}
        refreshControl={<RefreshControl refreshing={false} onRefresh={() => setReloadKey((k) => k + 1)} tintColor={t.blue} />}
      >
        <View style={styles.titleRow}>
          <View style={{ flex: 1 }}>
            <PageTitle t={t} title="Rendez-vous" subtitle={subtitle} />
          </View>
          {date !== today ? (
            <TouchableOpacity style={styles.todayBtn} onPress={() => setDate(today)} accessibilityRole="button">
              <Text style={styles.todayLabel}>Aujourd'hui</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity style={styles.addBtn} onPress={() => setAddFor({ date })} accessibilityRole="button" accessibilityLabel="Ajouter un RDV">
            <Ionicons name="add" size={24} color="#fff" />
          </TouchableOpacity>
        </View>
        {toast ? <View style={styles.toast}><Text style={styles.toastText}>{toast}</Text></View> : null}

        <Segmented
          t={t}
          options={[{ key: 'day' as View3, label: 'Jour' }, { key: 'week' as View3, label: 'Semaine' }, { key: 'month' as View3, label: 'Mois' }]}
          value={view}
          onChange={setView}
        />

        {/* Bandeau semaine (Jour / Semaine) ou navigation du mois */}
        <View style={[styles.navRow, styles.navCard]}>
          <TouchableOpacity style={styles.arrow} onPress={() => shift(-1)} accessibilityRole="button" accessibilityLabel="Précédent">
            <Ionicons name="chevron-back" size={18} color={t.blue} />
          </TouchableOpacity>
          {view === 'month' ? (
            <Text style={styles.navLabel}>{subtitle}</Text>
          ) : (
            <View style={styles.week}>
              {week.map((d) => {
                const on = d === date;
                const n = (byDay[d] ?? []).length;
                return (
                  <Pressable key={d} style={[styles.wd, on && { backgroundColor: t.blue }]} onPress={() => { setDate(d); if (view === 'week') setView('day'); }} accessibilityRole="button">
                    <Text style={[styles.wdName, on && { color: 'rgba(255,255,255,0.85)' }, d === today && !on && { color: t.blue }]}>{cap(fmt(d, { weekday: 'short' })).replace('.', '')}</Text>
                    <Text style={[styles.wdNum, on && { color: '#fff' }, d === today && !on && { color: t.blue }]}>{parse(d).getDate()}</Text>
                    <View style={[styles.dot, { backgroundColor: n ? (on ? '#fff' : t.blue) : 'transparent' }]} />
                  </Pressable>
                );
              })}
            </View>
          )}
          <TouchableOpacity style={styles.arrow} onPress={() => shift(1)} accessibilityRole="button" accessibilityLabel="Suivant">
            <Ionicons name="chevron-forward" size={18} color={t.blue} />
          </TouchableOpacity>
        </View>

        {/* Filtres */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {STATUS_OPTS.map((o) => (
            <FilterChip key={o.key} t={t} label={o.label} on={status === o.key} onPress={() => setStatus(o.key)} />
          ))}
        </ScrollView>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.chips, { marginBottom: 16 }]}>
          <FilterChip t={t} label="Tous les coiffeurs" on={barberFilter === 'all'} onPress={() => setBarberFilter('all')} />
          {bookableBarbers.map((b) => (
            <FilterChip key={b.id} t={t} label={b.name} on={barberFilter === String(b.id)} onPress={() => setBarberFilter(String(b.id))}
              dot={barberColorFor(barbers, b.id)} />
          ))}
        </ScrollView>

        {error && !hasMonth ? (
          <ErrorText t={t} text={error instanceof ApiError ? error.message : 'Impossible de charger l\'agenda.'} onRetry={() => void load()} />
        ) : !hasMonth || (loading && !all.length) ? (
          <InlineLoading t={t} />
        ) : view === 'day' ? (
          <>
            <DayGlance
              t={t}
              barbers={dayBarbers}
              items={byDay[date] ?? []}
              date={date}
              todayYmd={today}
              nowMin={nowMin}
              searchPool={all}
              onOpen={setOpen}
              onBarber={(id) => setBarberFilter(barberFilter === id ? 'all' : id)}
            />
            <DayColumns
              t={t}
              barbers={dayBarbers}
              allBarbers={barbers}
              items={byDay[date] ?? []}
              date={date}
              todayYmd={today}
              nowMin={nowMin}
              isTablet={isTablet}
              onOpen={setOpen}
              onAdd={(time, barberId) => setAddFor({ date, time, barberId })}
            />
          </>
        ) : view === 'week' ? (
          week.map((d) => (
            <Card key={d} t={t} style={[styles.block, { marginBottom: 12 }]}>
              <View style={styles.dayHeadRow}>
                <Text style={[styles.dayHead, d === today && { color: t.blue }]}>
                  {cap(fmt(d, { weekday: 'long', day: 'numeric', month: 'long' }))}
                  <Text style={styles.dayCount}>{(byDay[d] ?? []).length ? `  ·  ${(byDay[d] ?? []).length} RDV` : ''}</Text>
                </Text>
                {d >= today ? (
                  <TouchableOpacity onPress={() => setAddFor({ date: d })} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Ajouter un RDV le ${d}`}>
                    <Ionicons name="add-circle" size={24} color={t.blue} />
                  </TouchableOpacity>
                ) : null}
              </View>
              {(byDay[d] ?? []).length ? (
                (byDay[d] ?? []).map((a) => (
                  <View key={a.id} style={styles.tl}>
                    <Text style={styles.tlHour}>{String(a.scheduled_at).slice(11, 16)}</Text>
                    <View style={{ flex: 1 }}>{slotCard(a)}</View>
                  </View>
                ))
              ) : (
                <Text style={styles.none}>Aucun rendez-vous</Text>
              )}
            </Card>
          ))
        ) : (
          <MonthGrid t={t} month={date} today={today} counts={Object.fromEntries(Object.entries(byDay).map(([k, v]) => [k, v.length]))}
            onPick={(d) => { setDate(d); setView('day'); }} />
        )}

        {hasMonth ? (
          <>
            <Text style={styles.expHead}>Exporter · {shown.length} RDV affiché{shown.length > 1 ? 's' : ''}</Text>
            <Card t={t} flush style={styles.block}>
              <ListRow t={t} first inset={58} chevron onPress={() => void doExport('csv')}
                left={<View style={[styles.ric, { backgroundColor: '#34c759' }]}><Ionicons name="download-outline" size={17} color="#fff" /></View>}
                right={exporting === 'csv' ? <InlineLoading t={t} /> : undefined}>
                <Text style={[styles.rowLabel, !shown.length && { color: t.grey }]}>Télécharger CSV</Text>
              </ListRow>
              <ListRow t={t} inset={58} chevron onPress={() => void doExport('pdf')}
                left={<View style={[styles.ric, { backgroundColor: '#ff9f0a' }]}><Ionicons name="document-text-outline" size={17} color="#fff" /></View>}
                right={exporting === 'pdf' ? <InlineLoading t={t} /> : undefined}>
                <Text style={[styles.rowLabel, !shown.length && { color: t.grey }]}>Télécharger PDF</Text>
              </ListRow>
            </Card>
            <Text style={styles.expNote}>Mêmes colonnes que le web (nom, email, téléphone, prestation, coiffeur, date, statut). Le fichier s'ouvre dans la feuille de partage : Fichiers, Mail, AirDrop…</Text>
          </>
        ) : null}
      </ScrollView>

      <AddAppointmentSheet
        t={t}
        visible={addFor !== null}
        initialDate={addFor?.date ?? date}
        initialTime={addFor?.time}
        initialBarberId={addFor?.barberId}
        todayYmd={today}
        barbers={barbers}
        salonSlug={salonSlug}
        auth={auth}
        onClose={() => setAddFor(null)}
        onCreated={(msg) => { setToast(msg); setReloadKey((k) => k + 1); }}
      />

      <AppointmentSheet
        t={t}
        visible={!!open}
        appt={open}
        barbers={barbers}
        salonSlug={salonSlug}
        auth={auth}
        todayYmd={today}
        onClose={() => setOpen(null)}
        onChanged={() => setReloadKey((k) => k + 1)}
        asPanel={isTablet}
      />
    </View>
  );
}

/* ---------- petits composants ---------- */

function FilterChip({ t, label, on, onPress, dot }: { t: Palette; label: string; on: boolean; onPress: () => void; dot?: string }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 7, paddingHorizontal: 13, borderRadius: 99, backgroundColor: on ? t.ink : t.card, ...cardShadow(t) }}
    >
      {dot ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: dot }} /> : null}
      <Text style={{ color: on ? t.bg : t.ink, fontSize: 14, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );
}

function StatusPill({ t, label }: { t: Palette; label: string }) {
  return (
    <View style={{ backgroundColor: t.redSoft, borderRadius: 99, paddingVertical: 3, paddingHorizontal: 9 }}>
      <Text style={{ color: t.red, fontSize: 12, fontWeight: '600' }}>{label}</Text>
    </View>
  );
}

function MonthGrid({ t, month, today, counts, onPick }: {
  t: Palette; month: string; today: string; counts: Record<string, number>; onPick: (d: string) => void;
}) {
  const first = parse(`${month.slice(0, 7)}-01`);
  const lead = (first.getDay() + 6) % 7;
  const nDays = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const cells: (string | null)[] = Array.from({ length: lead }, () => null);
  for (let d = 1; d <= nDays; d++) cells.push(ymd(new Date(first.getFullYear(), first.getMonth(), d)));
  while (cells.length % 7) cells.push(null);
  return (
    <Card t={t}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((w, i) => (
          <Text key={`w${i}`} style={{ width: `${100 / 7}%`, textAlign: 'center', color: t.grey, fontSize: 12, fontWeight: '600', paddingBottom: 8 }}>{w}</Text>
        ))}
        {cells.map((d, i) => {
          if (!d) return <View key={`e${i}`} style={{ width: `${100 / 7}%`, height: 54 }} />;
          const n = counts[d] ?? 0;
          const isToday = d === today;
          return (
            <Pressable key={d} onPress={() => onPick(d)} style={{ width: `${100 / 7}%`, height: 54, alignItems: 'center', paddingTop: 4 }} accessibilityRole="button">
              <View style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: isToday ? t.blue : 'transparent' }}>
                <Text style={{ color: isToday ? '#fff' : t.ink, fontSize: 16, fontWeight: isToday ? '700' : '500', fontVariant: ['tabular-nums'] }}>{parse(d).getDate()}</Text>
              </View>
              {n ? <Text style={{ color: t.blue, fontSize: 11, fontWeight: '700', marginTop: 1 }}>{n}</Text> : null}
            </Pressable>
          );
        })}
      </View>
    </Card>
  );
}

const stylesFor = (t: Palette) =>
  StyleSheet.create({
    content: { paddingHorizontal: spacing.page, paddingTop: 4 },
    titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
    todayBtn: { marginTop: 14, backgroundColor: t.blueSoft, borderRadius: 11, paddingVertical: 8, paddingHorizontal: 12 },
    todayLabel: { color: t.blue, fontSize: 14.5, fontWeight: '600' },
    addBtn: { marginTop: 12, width: 38, height: 38, borderRadius: 19, backgroundColor: t.blue, alignItems: 'center', justifyContent: 'center' },
    toast: { backgroundColor: t.greenSoft, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12, marginBottom: 12 },
    toastText: { color: t.green, fontSize: 14.5, fontWeight: '600' },
    addRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 10, marginTop: 4, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.hair },
    addRowText: { color: t.blue, fontSize: 15.5, fontWeight: '600' },
    dayHeadRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    expHead: { color: t.ink, fontSize: 20, fontWeight: '700', letterSpacing: -0.4, marginHorizontal: 4, marginBottom: 8, marginTop: 4 },
    expNote: { color: t.grey, fontSize: 13, marginHorizontal: 4, marginTop: -14, marginBottom: spacing.block, lineHeight: 18 },
    ric: { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
    rowLabel: { color: t.ink, fontSize: 16 },
    navRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12, marginBottom: 14 },
    navCard: { backgroundColor: t.card, borderRadius: 16, padding: 8, ...cardShadow(t) },
    block: { marginBottom: spacing.block },
    arrow: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: t.fill },
    navLabel: { flex: 1, textAlign: 'center', color: t.ink, fontSize: 16, fontWeight: '600' },
    week: { flex: 1, flexDirection: 'row', gap: 2 },
    wd: { flex: 1, alignItems: 'center', paddingVertical: 6, borderRadius: 12 },
    wdName: { color: t.grey, fontSize: 11.5, fontWeight: '600' },
    wdNum: { color: t.ink, fontSize: 17, fontWeight: '700', marginTop: 1, fontVariant: ['tabular-nums'] },
    dot: { width: 5, height: 5, borderRadius: 3, marginTop: 3 },
    chips: { gap: 8, paddingVertical: 2, paddingHorizontal: 2, marginBottom: 8 },
    tl: { flexDirection: 'row', gap: 10, marginBottom: 8 },
    tlHour: { width: 42, color: t.ink, fontSize: 13, fontWeight: '600', paddingTop: 12, fontVariant: ['tabular-nums'] },
    slot: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, paddingVertical: 9, paddingHorizontal: 12 },
    slotPast: { backgroundColor: 'transparent', borderWidth: 1, borderColor: t.hair },
    slotName: { color: t.ink, fontSize: 15.5, fontWeight: '600' },
    slotMeta: { color: t.grey, fontSize: 12.5, marginTop: 1 },
    dayHead: { flex: 1, color: t.ink, fontSize: 17, fontWeight: '700', marginBottom: 6 },
    dayCount: { color: t.grey, fontSize: 14, fontWeight: '500' },
    none: { color: t.grey, fontSize: 14 },
  });
