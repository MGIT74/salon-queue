// Agenda du JOUR — maquette maquette-agenda.html (validée) :
// 1. « La journée en un coup d'œil » (repliable) : recherche client, légende,
//    une ligne par coiffeur (RDV de la journée + bouton agenda), axe des heures.
// 2. Une colonne par coiffeur : heures fixes à gauche, colonnes qui défilent
//    horizontalement sur téléphone, toutes visibles sur tablette ; pauses,
//    congés et heures non travaillées hachurés ; ligne « maintenant » ;
//    toucher une case libre → « + HH:MM » pour ajouter un RDV à cette heure.
// Horaires, pauses, congés : GET /api/barbers ; RDV : GET /api/appointments.
import React, { useMemo, useState } from 'react';
import { LayoutChangeEvent, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AdminAppointment, BarberPublic } from '../types/api';
import { Palette, cardShadow, spacing } from '../theme/theme';
import { barberColorFor, tint } from '../utils/barberColor';
import { Avatar } from './ui';
import { movedBy, nudgeRoom } from '../utils/agendaRules';

const HEAD_H = 46;
const GUTTER = 48;
const ZOOMS = [0.8, 1.1, 1.5, 2.1]; // pixels par minute

const toMin = (hm: string) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5));
const hm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const inRange = (d: string, r: { start_date: string; end_date: string }) => r.start_date <= d && d <= r.end_date;

type DayInfo = {
  /** Journée entière indisponible (congé, sans RDV, ne travaille pas). */
  fullOff: string | null;
  /** Plages hachurées [début, fin[ en minutes + libellé. */
  off: { from: number; to: number; label: string }[];
  /** Sous-titre de l'en-tête de colonne. */
  sub: string;
};

/** Ce que le coiffeur fait CE jour-là (congé, sans RDV, horaires, pauses). */
function dayInfo(b: BarberPublic, date: string, start: number, end: number): DayInfo {
  if ((b.leaves ?? []).some((l) => inRange(date, l))) return { fullOff: 'En congé', off: [], sub: 'En congé' };
  if ((b.walkin_days ?? []).some((w) => inRange(date, w))) return { fullOff: 'Sans RDV', off: [], sub: 'Sans RDV ce jour' };
  const wd = new Date(`${date}T12:00:00`).getDay();
  const all = b.schedules ?? [];
  const today = all.filter((s) => s.active && s.weekday === wd).map((s) => ({ a: toMin(String(s.start_time)), b: toMin(String(s.end_time)) })).sort((x, y) => x.a - y.a);
  const off: DayInfo['off'] = [];
  let sub = '';
  if (all.length) {
    if (!today.length) return { fullOff: 'Ne travaille pas', off: [], sub: 'Ne travaille pas' };
    let cur = start;
    today.forEach((r) => {
      if (r.a > cur) off.push({ from: cur, to: r.a, label: '' });
      cur = Math.max(cur, r.b);
    });
    if (cur < end) off.push({ from: cur, to: end, label: '' });
    sub = today.map((r) => `${hm(r.a).replace(/^0/, '')} – ${hm(r.b).replace(/^0/, '')}`).join(' · ');
  }
  const brk = (b.breaks ?? []).filter((x) => x.active && x.weekday === wd);
  brk.forEach((x) => off.push({ from: toMin(String(x.start_time)), to: toMin(String(x.end_time)), label: 'Pause' }));
  if (brk.length) sub = `Pause ${brk.map((x) => `${String(x.start_time).slice(0, 5)} – ${String(x.end_time).slice(0, 5)}`).join(', ')}`;
  return { fullOff: null, off, sub };
}

function apptRange(a: AdminAppointment) {
  const s = toMin(String(a.scheduled_at).slice(11, 16));
  const d = Math.max(10, Number(a.pricing?.total_duration_min ?? a.duration_min ?? 30));
  return { s, e: s + d, d };
}

/* =============================== Coup d'œil =============================== */

export function DayGlance({ t, barbers, items, date, todayYmd, nowMin, searchPool, onOpen, onBarber }: {
  t: Palette;
  barbers: BarberPublic[];
  items: AdminAppointment[];
  date: string;
  todayYmd: string;
  nowMin: number;
  /** RDV chargés (mois affichés) dans lesquels chercher un client. */
  searchPool: AdminAppointment[];
  onOpen: (a: AdminAppointment) => void;
  onBarber: (barberId: string) => void;
}) {
  const styles = glanceStyles(t);
  const [folded, setFolded] = useState(false);
  const [q, setQ] = useState('');
  const START = 8 * 60, END = 19 * 60;
  const pct = (m: number) => `${Math.min(100, Math.max(0, ((m - START) / (END - START)) * 100))}%` as const;

  const results = useMemo(() => {
    const k = q.trim().toLowerCase();
    if (k.length < 2) return [];
    const digits = k.replace(/\D/g, '');
    return searchPool
      .filter((a) =>
        String(a.client_name ?? '').toLowerCase().includes(k) ||
        String(a.email ?? '').toLowerCase().includes(k) ||
        (digits.length >= 3 && String(a.phone ?? '').replace(/\D/g, '').includes(digits)))
      .sort((a, b) => String(b.scheduled_at).localeCompare(String(a.scheduled_at)))
      .slice(0, 8);
  }, [q, searchPool]);

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <Text style={styles.title}>La journée en un coup d'œil</Text>
        <TouchableOpacity onPress={() => setFolded(!folded)} hitSlop={8} accessibilityRole="button">
          <Text style={styles.fold}>{folded ? 'Déplier' : 'Replier'} <Ionicons name={folded ? 'chevron-down' : 'chevron-up'} size={13} color={t.blue} /></Text>
        </TouchableOpacity>
      </View>
      {folded ? null : (
        <>
          <View style={styles.search}>
            <Ionicons name="search" size={15} color={t.grey} />
            <TextInput
              style={styles.searchInput}
              value={q}
              onChangeText={setQ}
              placeholder="Rechercher un client (nom, téléphone, email)…"
              placeholderTextColor={t.grey}
              autoCorrect={false}
              autoCapitalize="none"
              clearButtonMode="while-editing"
            />
          </View>
          {results.length ? (
            <View style={styles.results}>
              {results.map((a) => (
                <Pressable key={a.id} style={styles.result} onPress={() => onOpen(a)} accessibilityRole="button">
                  <Avatar t={t} name={a.barber_name} color={barberColorFor(barbers, a.barber_id)} size={26} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.rName} numberOfLines={1}>{a.client_name}</Text>
                    <Text style={styles.rMeta} numberOfLines={1}>
                      {new Date(`${String(a.scheduled_at).slice(0, 10)}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })} · {String(a.scheduled_at).slice(11, 16)} · {a.service_name}
                    </Text>
                  </View>
                </Pressable>
              ))}
            </View>
          ) : q.trim().length >= 2 ? (
            <Text style={styles.noRes}>Aucun RDV trouvé sur les dates chargées.</Text>
          ) : null}

          <View style={styles.legend}>
            <Legend t={t} color={t.blue} label="À venir" />
            <Legend t={t} color={t.fill2} label="Terminé" />
            <Legend t={t} dashed label="Absent" />
            <Legend t={t} color={t.red} label="Maintenant" thin />
          </View>

          {barbers.map((b) => {
            const color = barberColorFor(barbers, b.id);
            const info = dayInfo(b, date, START, END);
            const mine = items.filter((a) => String(a.barber_id) === String(b.id) && a.display_status !== 'cancelled');
            return (
              <View key={b.id} style={styles.lnRow}>
                <Avatar t={t} name={b.name} color={color} size={28} />
                <View style={styles.lane}>
                  {mine.length === 0 ? (
                    <Text style={styles.laneEmpty}>{info.fullOff ?? 'Aucun RDV'}</Text>
                  ) : (
                    mine.map((a) => {
                      const r = apptRange(a);
                      const st = a.display_status ?? 'confirmed';
                      const past = st === 'completed';
                      const abs = st === 'no_show';
                      return (
                        <Pressable
                          key={a.id}
                          onPress={() => onOpen(a)}
                          style={[
                            styles.blk,
                            { left: pct(r.s), width: `${Math.max(1.5, (r.d / (END - START)) * 100)}%` },
                            abs ? styles.abs : { backgroundColor: past ? t.fill2 : color },
                          ]}
                        />
                      );
                    })
                  )}
                  {date === todayYmd && nowMin >= START && nowMin <= END ? <View style={[styles.now, { left: pct(nowMin) }]} /> : null}
                </View>
                <TouchableOpacity style={styles.calBtn} onPress={() => onBarber(String(b.id))} accessibilityRole="button" accessibilityLabel={`Agenda de ${b.name}`}>
                  <Ionicons name="calendar-outline" size={15} color={t.blue} />
                </TouchableOpacity>
              </View>
            );
          })}
          <View style={styles.axis}>
            {['8h', '10h', '12h', '14h', '16h', '18h'].map((h) => <Text key={h} style={styles.tick}>{h}</Text>)}
          </View>
        </>
      )}
    </View>
  );
}

function Legend({ t, color, label, dashed, thin }: { t: Palette; color?: string; label: string; dashed?: boolean; thin?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
      <View style={[{ width: thin ? 3 : 10, height: 10, borderRadius: 3 }, dashed ? { borderWidth: 1.5, borderStyle: 'dashed', borderColor: t.sep } : { backgroundColor: color }]} />
      <Text style={{ color: t.grey, fontSize: 12 }}>{label}</Text>
    </View>
  );
}

const glanceStyles = (t: Palette) =>
  StyleSheet.create({
    card: { backgroundColor: t.card, borderRadius: 16, padding: 14, marginBottom: 14, ...cardShadow(t) },
    head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
    title: { color: t.ink, fontSize: 16, fontWeight: '700', flexShrink: 1 },
    fold: { color: t.blue, fontSize: 14, fontWeight: '600' },
    search: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: t.fill, borderRadius: 10, paddingHorizontal: 10, marginTop: 10 },
    searchInput: { flex: 1, color: t.ink, fontSize: 15, paddingVertical: 8 },
    results: { marginTop: 8, borderRadius: 12, backgroundColor: t.fill, paddingVertical: 4 },
    result: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 10, paddingVertical: 7 },
    rName: { color: t.ink, fontSize: 15, fontWeight: '600' },
    rMeta: { color: t.grey, fontSize: 12.5 },
    noRes: { color: t.grey, fontSize: 13, marginTop: 8 },
    legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 10, marginBottom: 8 },
    lnRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
    lane: { flex: 1, height: 26, borderRadius: 7, backgroundColor: t.fill, overflow: 'hidden', justifyContent: 'center' },
    laneEmpty: { color: t.grey, fontSize: 11.5, textAlign: 'center' },
    blk: { position: 'absolute', top: 3, bottom: 3, borderRadius: 5 },
    abs: { borderWidth: 1.5, borderStyle: 'dashed', borderColor: t.sep },
    now: { position: 'absolute', top: 0, bottom: 0, width: 2, backgroundColor: t.red },
    calBtn: { width: 28, height: 28, borderRadius: 8, backgroundColor: t.blueSoft, alignItems: 'center', justifyContent: 'center' },
    axis: { flexDirection: 'row', justifyContent: 'space-between', marginHorizontal: 36, marginTop: 2 },
    tick: { color: t.grey, fontSize: 10.5, fontVariant: ['tabular-nums'] },
  });

/* =============================== Colonnes =============================== */

export function DayColumns({ t, barbers, allBarbers, items, date, todayYmd, nowMin, isTablet, onOpen, onAdd, onNudge, onMoved, onReorder, busyId }: {
  t: Palette;
  /** Coiffeurs affichés (filtre compris). */
  barbers: BarberPublic[];
  /** Tous les coiffeurs (pour les couleurs). */
  allBarbers: BarberPublic[];
  items: AdminAppointment[];
  date: string;
  todayYmd: string;
  nowMin: number;
  isTablet: boolean;
  onOpen: (a: AdminAppointment) => void;
  /** Ajouter un RDV (heure et coiffeur pré-choisis si la case a été touchée). */
  onAdd: (time?: string, barberId?: string) => void;
  /** Décaler un RDV de ±5 min (flèches ▲ ▼). */
  onNudge: (a: AdminAppointment, minutes: number) => void;
  /** Liste des RDV décalés d'un coiffeur (pastille ⇅ de l'en-tête). */
  onMoved: (barberId: string) => void;
  /** Ouvrir « Ordre des colonnes ». */
  onReorder: () => void;
  /** RDV en cours de décalage (flèches désactivées). */
  busyId?: number | null;
}) {
  const styles = colStyles(t);
  const [zoom, setZoom] = useState(1);
  const [width, setWidth] = useState(0);
  const [pick, setPick] = useState<{ barberId: string; min: number } | null>(null);
  const pxm = ZOOMS[zoom];

  // Plage horaire : 8h – 20h, élargie si un RDV ou un horaire en dépasse.
  const visible = items.filter((a) => a.display_status !== 'cancelled');
  let START = 8 * 60, END = 20 * 60;
  visible.forEach((a) => { const r = apptRange(a); START = Math.min(START, Math.floor(r.s / 60) * 60); END = Math.max(END, Math.ceil(r.e / 60) * 60); });
  const H = (END - START) * pxm;
  const y = (m: number) => (m - START) * pxm;

  const n = Math.max(1, barbers.length);
  const fit = isTablet && width > 0 && (width - GUTTER) / n >= 130;
  const colW = fit ? (width - GUTTER) / n : 150;

  const hours: number[] = [];
  for (let m = START; m <= END; m += 30) hours.push(m);

  const tapCol = (barberId: string, locY: number) => {
    const m = Math.round((START + locY / pxm) / 15) * 15;
    if (m < START || m >= END) return;
    setPick({ barberId, min: m });
  };

  const columns = barbers.map((b) => {
    const color = barberColorFor(allBarbers, b.id);
    const info = dayInfo(b, date, START, END);
    const mine = visible.filter((a) => String(a.barber_id) === String(b.id));
    const movedCount = mine.filter((a) => movedBy(a) !== 0).length;
    return (
      <View key={b.id} style={[styles.col, { width: colW }]}>
        <View style={styles.colHead}>
          <Avatar t={t} name={b.name} color={color} size={26} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.colName} numberOfLines={1}>{b.name}</Text>
            {info.sub ? <Text style={styles.colSub} numberOfLines={1}>{info.sub}</Text> : null}
          </View>
          {movedCount ? (
            <TouchableOpacity style={styles.mBadge} onPress={() => onMoved(String(b.id))} accessibilityRole="button"
              accessibilityLabel={`${movedCount} RDV décalé${movedCount > 1 ? 's' : ''} de 5 min`} hitSlop={6}>
              <Text style={styles.mBadgeTxt}>⇅ {movedCount}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
        <Pressable style={{ height: H }} onPress={(e) => tapCol(String(b.id), e.nativeEvent.locationY)}>
          {hours.map((m) => <View key={m} style={[styles.hl, { top: y(m) }, m % 60 !== 0 && { opacity: 0.5 }]} />)}
          {info.fullOff ? (
            <View style={[styles.off, { top: 0, bottom: 0 }]}><Text style={styles.offTxt}>{info.fullOff}</Text></View>
          ) : (
            info.off.map((o, i) => (
              <View key={i} style={[styles.off, { top: y(Math.max(o.from, START)), height: (Math.min(o.to, END) - Math.max(o.from, START)) * pxm }]}>
                {o.label ? <Text style={styles.offTxt}>{o.label}</Text> : null}
              </View>
            ))
          )}
          {mine.map((a) => {
            const r = apptRange(a);
            const st = a.display_status ?? 'confirmed';
            const past = st === 'completed';
            const abs = st === 'no_show';
            const h = Math.max(28, r.d * pxm) - 3;
            const short = h < 44;
            const future = date > todayYmd || (date === todayYmd && r.s > nowMin);
            const room = nudgeRoom(a, future);
            const canNudge = room.up || room.down;
            const moved = movedBy(a);
            return (
              <Pressable
                key={a.id}
                onPress={() => onOpen(a)}
                accessibilityRole="button"
                style={[styles.ev, { top: y(r.s) + 1, height: h }, short && { paddingVertical: 3 }, canNudge && { paddingRight: 30 },
                  abs ? styles.evAbs : { backgroundColor: past ? t.fill : tint(color, t) }]}
              >
                <Text style={[styles.evName, past && { color: t.grey, fontWeight: '500' }]} numberOfLines={1}>
                  {a.client_name || 'Client'}
                  {moved ? <Text style={styles.movedTag}>{`  ⇅ ${moved > 0 ? '+' : ''}${moved}`}</Text> : null}
                </Text>
                <Text style={styles.evMeta} numberOfLines={1}>{hm(r.s)} – {hm(r.e)}</Text>
                {h > 58 ? <Text style={styles.evMeta} numberOfLines={1}>{a.service_name}</Text> : null}
                {abs && !short ? <Text style={styles.evAbsTag}>Absent</Text> : null}
                {canNudge ? (
                  <View style={styles.nudges}>
                    <TouchableOpacity
                      style={[styles.nudge, (!room.up || busyId === a.id) && { opacity: 0.3 }]}
                      disabled={!room.up || busyId === a.id}
                      onPress={() => onNudge(a, -5)}
                      hitSlop={4}
                      accessibilityRole="button"
                      accessibilityLabel={`Avancer ${a.client_name} de 5 minutes`}
                    >
                      <Ionicons name="caret-up" size={11} color={t.blue} />
                    </TouchableOpacity>
                    {h >= 44 ? (
                      <TouchableOpacity
                        style={[styles.nudge, (!room.down || busyId === a.id) && { opacity: 0.3 }]}
                        disabled={!room.down || busyId === a.id}
                        onPress={() => onNudge(a, 5)}
                        hitSlop={4}
                        accessibilityRole="button"
                        accessibilityLabel={`Retarder ${a.client_name} de 5 minutes`}
                      >
                        <Ionicons name="caret-down" size={11} color={t.blue} />
                      </TouchableOpacity>
                    ) : null}
                  </View>
                ) : null}
              </Pressable>
            );
          })}
          {pick && pick.barberId === String(b.id) ? (
            <TouchableOpacity
              style={[styles.pick, { top: y(pick.min), height: Math.max(28, 30 * pxm) - 3 }]}
              onPress={() => { setPick(null); onAdd(hm(pick.min), String(b.id)); }}
              accessibilityRole="button"
            >
              <Text style={styles.pickTxt}>+ {hm(pick.min)}</Text>
            </TouchableOpacity>
          ) : null}
        </Pressable>
      </View>
    );
  });

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <Text style={styles.count} numberOfLines={1}>{visible.length} RDV{isTablet ? ' ce jour' : ''}</Text>
        {barbers.length > 1 ? (
          <TouchableOpacity style={styles.reorder} onPress={onReorder} accessibilityRole="button" accessibilityLabel="Réorganiser les colonnes">
            <Ionicons name="reorder-three" size={18} color={t.blue} />
            {isTablet ? <Text style={styles.reorderTxt}>Réorganiser</Text> : null}
          </TouchableOpacity>
        ) : null}
        <View style={styles.zoom}>
          <TouchableOpacity onPress={() => setZoom(Math.max(0, zoom - 1))} hitSlop={8} accessibilityRole="button" accessibilityLabel="Dézoomer">
            <Ionicons name="remove" size={18} color={zoom === 0 ? t.sep : t.ink} />
          </TouchableOpacity>
          <View style={styles.zTrack}><View style={[styles.zFill, { width: `${((zoom + 1) / ZOOMS.length) * 100}%` }]} /></View>
          <TouchableOpacity onPress={() => setZoom(Math.min(ZOOMS.length - 1, zoom + 1))} hitSlop={8} accessibilityRole="button" accessibilityLabel="Zoomer">
            <Ionicons name="add" size={18} color={zoom === ZOOMS.length - 1 ? t.sep : t.ink} />
          </TouchableOpacity>
        </View>
        <TouchableOpacity style={styles.add} onPress={() => onAdd()} accessibilityRole="button">
          <Ionicons name="add" size={18} color="#fff" />
          <Text style={styles.addTxt}>{isTablet ? 'Ajouter un RDV' : 'Ajouter'}</Text>
        </TouchableOpacity>
      </View>

      <View style={{ flexDirection: 'row' }} onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}>
        <View style={{ width: GUTTER, height: H + HEAD_H }}>
          {hours.map((m) => (
            <Text key={m} style={[styles.hour, { top: HEAD_H + y(m) - 7 }, m % 60 === 0 ? styles.hourStrong : null]}>{hm(m)}</Text>
          ))}
        </View>
        {fit ? (
          <View style={{ flexDirection: 'row', flex: 1 }}>{columns}</View>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }}>{columns}</ScrollView>
        )}
        {date === todayYmd && nowMin >= START && nowMin <= END ? (
          <View pointerEvents="none" style={[styles.now, { top: HEAD_H + y(nowMin) }]}>
            <View style={styles.nowTag}><Text style={styles.nowTxt}>{hm(nowMin)}</Text></View>
          </View>
        ) : null}
      </View>
      <Text style={styles.tip}>Touchez une case libre pour ajouter un RDV à cette heure.</Text>
    </View>
  );
}

const colStyles = (t: Palette) =>
  StyleSheet.create({
    card: { backgroundColor: t.card, borderRadius: 16, overflow: 'hidden', marginBottom: spacing.block, ...cardShadow(t) },
    head: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.hair },
    count: { flex: 1, color: t.grey, fontSize: 14 },
    zoom: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: t.fill, borderRadius: 99, paddingVertical: 5, paddingHorizontal: 10 },
    zTrack: { width: 56, height: 4, borderRadius: 2, backgroundColor: t.fill2, overflow: 'hidden' },
    zFill: { height: '100%', backgroundColor: t.blue },
    add: { flexDirection: 'row', alignItems: 'center', gap: 2, height: 34, paddingHorizontal: 12, borderRadius: 17, backgroundColor: t.blue },
    addTxt: { color: '#fff', fontSize: 14, fontWeight: '600' },
    hour: { position: 'absolute', right: 6, color: t.grey, fontSize: 10.5, fontVariant: ['tabular-nums'] },
    hourStrong: { color: t.ink, fontWeight: '600', fontSize: 11.5 },
    col: { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: t.hair },
    colHead: { height: HEAD_H, flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.hair },
    colName: { color: t.ink, fontSize: 14, fontWeight: '600' },
    colSub: { color: t.grey, fontSize: 10.5 },
    hl: { position: 'absolute', left: 0, right: 0, height: StyleSheet.hairlineWidth, backgroundColor: t.hair },
    off: { position: 'absolute', left: 0, right: 0, backgroundColor: t.scheme === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.045)' },
    offTxt: { color: t.grey, fontSize: 10.5, fontWeight: '600', margin: 5 },
    ev: { position: 'absolute', left: 4, right: 4, borderRadius: 9, paddingVertical: 5, paddingHorizontal: 7, overflow: 'hidden' },
    evAbs: { backgroundColor: 'transparent', borderWidth: 1.5, borderStyle: 'dashed', borderColor: t.sep },
    evName: { color: t.ink, fontSize: 13, fontWeight: '700' },
    evMeta: { color: t.grey, fontSize: 11.5, fontVariant: ['tabular-nums'] },
    evAbsTag: { alignSelf: 'flex-start', marginTop: 2, color: t.red, backgroundColor: t.redSoft, fontSize: 10, fontWeight: '700', paddingHorizontal: 6, borderRadius: 99, overflow: 'hidden' },
    pick: { position: 'absolute', left: 4, right: 4, borderRadius: 9, borderWidth: 1.5, borderStyle: 'dashed', borderColor: t.blue, alignItems: 'center', justifyContent: 'center', backgroundColor: t.blueSoft },
    pickTxt: { color: t.blue, fontSize: 12.5, fontWeight: '700' },
    now: { position: 'absolute', left: GUTTER, right: 0, height: 2, backgroundColor: t.red },
    nowTag: { position: 'absolute', left: -GUTTER + 2, top: -8, backgroundColor: t.red, borderRadius: 5, paddingHorizontal: 4, paddingVertical: 1 },
    nowTxt: { color: '#fff', fontSize: 10, fontWeight: '700', fontVariant: ['tabular-nums'] },
    tip: { color: t.grey, fontSize: 12, textAlign: 'center', paddingVertical: 8 },
    mBadge: { backgroundColor: t.orangeSoft, borderRadius: 99, paddingHorizontal: 6, paddingVertical: 2 },
    mBadgeTxt: { color: t.orange, fontSize: 11, fontWeight: '700' },
    movedTag: { color: t.orange, fontSize: 10.5, fontWeight: '700' },
    nudges: { position: 'absolute', right: 4, top: 4, gap: 3 },
    nudge: { width: 22, height: 18, borderRadius: 6, backgroundColor: t.card, alignItems: 'center', justifyContent: 'center', ...cardShadow(t) },
    reorder: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 34, paddingHorizontal: 10, borderRadius: 17, backgroundColor: t.blueSoft },
    reorderTxt: { color: t.blue, fontSize: 14, fontWeight: '600' },
  });
