// Agenda de la SEMAINE — maquette maquette-agenda.html (validée), comme le web
// (dashboard.html pdWeekHtml) :
// 1. « La semaine en un coup d'œil » : recherche client, légende des coiffeurs,
//    une ligne par jour (RDV à la couleur du coiffeur), bouton pour ouvrir le jour.
// 2. L'agenda en 7 colonnes (une par jour), heures fixes à gauche, aujourd'hui
//    en bleu, ligne « maintenant » ; toucher une case libre → « + HH:MM ».
import React, { useMemo, useState } from 'react';
import { LayoutChangeEvent, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AdminAppointment, BarberPublic } from '../types/api';
import { Palette, cardShadow, spacing } from '../theme/theme';
import { barberColorFor, tint } from '../utils/barberColor';
import { Avatar } from './ui';
import { ZoomSlider } from './ZoomSlider';
import { details } from './DayAgenda';

const HEAD_H = 50;
const GUTTER = 46;
const ZMIN = 0.7, ZMAX = 3, ZDEF = 1.1;
const toMin = (hm: string) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5));
const hm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const parse = (s: string) => new Date(`${s}T12:00:00`);
const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

function range(a: AdminAppointment) {
  const s = toMin(String(a.scheduled_at).slice(11, 16));
  const d = Math.max(10, Number(a.pricing?.total_duration_min ?? a.duration_min ?? 30));
  return { s, e: s + d, d };
}

export function WeekAgenda({ t, days, byDay, barbers, todayYmd, nowMin, isTablet, searchPool, onOpen, onDay, onAdd }: {
  t: Palette;
  /** Les 7 jours (lundi → dimanche). */
  days: string[];
  byDay: Record<string, AdminAppointment[]>;
  barbers: BarberPublic[];
  todayYmd: string;
  nowMin: number;
  isTablet: boolean;
  searchPool: AdminAppointment[];
  onOpen: (a: AdminAppointment) => void;
  /** Ouvrir la vue Jour de ce jour. */
  onDay: (d: string) => void;
  onAdd: (date: string, time?: string) => void;
}) {
  const g = glanceStyles(t);
  const c = colStyles(t);
  const [folded, setFolded] = useState(false);
  const [q, setQ] = useState('');
  const [pxm, setPxm] = useState(ZDEF);
  const [width, setWidth] = useState(0);
  const [pick, setPick] = useState<{ date: string; min: number } | null>(null);
  const G0 = 8 * 60, G1 = 19 * 60;
  const pct = (m: number) => `${Math.min(100, Math.max(0, ((m - G0) / (G1 - G0)) * 100))}%` as const;

  const weekItems = days.flatMap((d) => (byDay[d] ?? []).filter((a) => a.display_status !== 'cancelled'));
  const usedBarbers = barbers.filter((b) => weekItems.some((a) => String(a.barber_id) === String(b.id)));

  const results = useMemo(() => {
    const k = q.trim().toLowerCase();
    if (k.length < 2) return [];
    const digits = k.replace(/\D/g, '');
    return searchPool
      .filter((a) => String(a.client_name ?? '').toLowerCase().includes(k) || String(a.email ?? '').toLowerCase().includes(k) ||
        (digits.length >= 3 && String(a.phone ?? '').replace(/\D/g, '').includes(digits)))
      .sort((a, b) => String(b.scheduled_at).localeCompare(String(a.scheduled_at)))
      .slice(0, 8);
  }, [q, searchPool]);

  /* ----- Agenda 7 jours ----- */
  let START = 8 * 60, END = 20 * 60;
  weekItems.forEach((a) => { const r = range(a); START = Math.min(START, Math.floor(r.s / 60) * 60); END = Math.max(END, Math.ceil(r.e / 60) * 60); });
  const H = (END - START) * pxm;
  const y = (m: number) => (m - START) * pxm;
  const grow = Math.min(1.9, Math.max(0.85, pxm / ZDEF));
  const fit = isTablet && width > 0 && (width - GUTTER) / 7 >= 110 * grow;
  const colW = fit ? (width - GUTTER) / 7 : Math.round(104 * grow);
  const hours: number[] = [];
  for (let m = START; m <= END; m += 30) hours.push(m);

  const columns = days.map((d) => {
    const list = (byDay[d] ?? []).filter((a) => a.display_status !== 'cancelled');
    const isToday = d === todayYmd;
    const past = d < todayYmd;
    return (
      <View key={d} style={[c.col, fit ? { flex: 1 } : { width: colW }]}>
        <Pressable style={c.colHead} onPress={() => onDay(d)} accessibilityRole="button" accessibilityLabel={`Ouvrir le ${d}`}>
          <Text style={[c.wd, isToday && { color: t.blue }]}>{cap(parse(d).toLocaleDateString('fr-FR', { weekday: 'short' })).replace('.', '')}</Text>
          <View style={[c.dn, isToday && { backgroundColor: t.blue }]}>
            <Text style={[c.dnTxt, isToday && { color: '#fff' }]}>{parse(d).getDate()}</Text>
          </View>
        </Pressable>
        <Pressable
          style={[{ height: H }, past && { backgroundColor: t.scheme === 'dark' ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)' }]}
          onPress={(e) => {
            const m = Math.round((START + e.nativeEvent.locationY / pxm) / 15) * 15;
            if (!past && m >= START && m < END) setPick({ date: d, min: m });
          }}
        >
          {hours.map((m) => <View key={m} style={[c.hl, { top: y(m) }, m % 60 !== 0 && { opacity: 0.5 }]} />)}
          {list.map((a) => {
            const r = range(a);
            const st = a.display_status ?? 'confirmed';
            const color = barberColorFor(barbers, a.barber_id);
            const h = Math.max(26, r.d * pxm) - 3;
            return (
              <Pressable
                key={a.id}
                onPress={() => onOpen(a)}
                accessibilityRole="button"
                style={[c.ev, { top: y(r.s) + 1, height: h },
                  st === 'no_show' ? c.evAbs : { backgroundColor: st === 'completed' ? t.fill : tint(color, t) }]}
              >
                <Text style={[c.evName, st === 'completed' && { color: t.grey, fontWeight: '500' }]} numberOfLines={1}>{a.client_name || 'Client'}</Text>
                {h >= 34 ? <Text style={c.evMeta} numberOfLines={1}>{hm(r.s)}{isTablet && a.barber_name ? ` · ${a.barber_name}` : ''}</Text> : null}
                {details(a, h).map((l, k) => (
                  <Text key={k} style={[c.evMeta, l.strong && { color: t.ink, fontWeight: '700' }]} numberOfLines={l.wrap ? 2 : 1}>{l.text}</Text>
                ))}
              </Pressable>
            );
          })}
          {pick && pick.date === d ? (
            <TouchableOpacity style={[c.pick, { top: y(pick.min), height: Math.max(26, 30 * pxm) - 3 }]}
              onPress={() => { setPick(null); onAdd(d, hm(pick.min)); }} accessibilityRole="button">
              <Text style={c.pickTxt}>+ {hm(pick.min)}</Text>
            </TouchableOpacity>
          ) : null}
          {isToday && nowMin >= START && nowMin <= END ? <View pointerEvents="none" style={[c.now, { top: y(nowMin) }]} /> : null}
        </Pressable>
      </View>
    );
  });

  return (
    <View>
      {/* ----- La semaine en un coup d'œil ----- */}
      <View style={g.card}>
        <View style={g.head}>
          <Text style={g.title}>La semaine en un coup d'œil</Text>
          <TouchableOpacity onPress={() => setFolded(!folded)} hitSlop={8} accessibilityRole="button">
            <Text style={g.fold}>{folded ? 'Déplier' : 'Replier'} <Ionicons name={folded ? 'chevron-down' : 'chevron-up'} size={13} color={t.blue} /></Text>
          </TouchableOpacity>
        </View>
        {folded ? null : (
          <>
            <View style={g.search}>
              <Ionicons name="search" size={15} color={t.grey} />
              <TextInput style={g.searchInput} value={q} onChangeText={setQ} placeholder="Rechercher un client…" placeholderTextColor={t.grey}
                autoCorrect={false} autoCapitalize="none" clearButtonMode="while-editing" />
            </View>
            {results.length ? (
              <View style={g.results}>
                {results.map((a) => (
                  <Pressable key={a.id} style={g.result} onPress={() => onOpen(a)} accessibilityRole="button">
                    <Avatar t={t} name={a.barber_name} color={barberColorFor(barbers, a.barber_id)} size={26} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={g.rName} numberOfLines={1}>{a.client_name}</Text>
                      <Text style={g.rMeta} numberOfLines={1}>
                        {parse(String(a.scheduled_at).slice(0, 10)).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })} · {String(a.scheduled_at).slice(11, 16)} · {a.service_name}
                      </Text>
                    </View>
                  </Pressable>
                ))}
              </View>
            ) : q.trim().length >= 2 ? <Text style={g.noRes}>Aucun RDV trouvé sur les dates chargées.</Text> : null}

            {usedBarbers.length ? (
              <View style={g.legend}>
                {usedBarbers.map((b) => (
                  <View key={b.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                    <View style={{ width: 9, height: 9, borderRadius: 3, backgroundColor: barberColorFor(barbers, b.id) }} />
                    <Text style={{ color: t.grey, fontSize: 12 }}>{b.name}</Text>
                  </View>
                ))}
              </View>
            ) : <View style={{ height: 10 }} />}

            {days.map((d) => {
              const list = (byDay[d] ?? []).filter((a) => a.display_status !== 'cancelled');
              const isToday = d === todayYmd;
              return (
                <View key={d} style={g.row}>
                  <Pressable onPress={() => onDay(d)} style={g.dayLbl} accessibilityRole="button">
                    <Text style={[g.dayTxt, isToday && { color: t.blue }]} numberOfLines={1}>
                      {cap(parse(d).toLocaleDateString('fr-FR', { weekday: 'short' })).replace('.', '')} {parse(d).getDate()}
                    </Text>
                  </Pressable>
                  <View style={g.lane}>
                    {list.length === 0 ? <Text style={g.laneEmpty}>Aucun RDV</Text> : list.map((a) => {
                      const r = range(a);
                      const st = a.display_status ?? 'confirmed';
                      return (
                        <Pressable key={a.id} onPress={() => onOpen(a)}
                          style={[g.blk, { left: pct(r.s), width: `${Math.max(1.5, (r.d / (G1 - G0)) * 100)}%` },
                            st === 'no_show' ? g.abs : { backgroundColor: st === 'completed' ? t.fill2 : barberColorFor(barbers, a.barber_id) }]} />
                      );
                    })}
                    {isToday && nowMin >= G0 && nowMin <= G1 ? <View style={[g.now, { left: pct(nowMin) }]} /> : null}
                  </View>
                  <TouchableOpacity style={g.calBtn} onPress={() => onDay(d)} accessibilityRole="button" accessibilityLabel={`Ouvrir le ${d}`}>
                    <Ionicons name="calendar-outline" size={15} color={t.blue} />
                  </TouchableOpacity>
                </View>
              );
            })}
            <View style={[g.axis, { marginLeft: 66 }]}>
              {['8h', '10h', '12h', '14h', '16h', '18h'].map((h) => <Text key={h} style={g.tick}>{h}</Text>)}
            </View>
          </>
        )}
      </View>

      {/* ----- Agenda 7 jours ----- */}
      <View style={c.card}>
        <View style={c.head}>
          <Text style={c.count} numberOfLines={1}>{weekItems.length} RDV cette semaine</Text>
          <ZoomSlider t={t} value={pxm} min={ZMIN} max={ZMAX} step={0.4} onChange={setPxm} width={isTablet ? 130 : 78} />
          <TouchableOpacity style={c.add} onPress={() => onAdd(days.find((d) => d >= todayYmd) ?? todayYmd)} accessibilityRole="button" accessibilityLabel="Ajouter un RDV">
            <Ionicons name="add" size={18} color="#fff" />
            {isTablet ? <Text style={c.addTxt}>Ajouter un RDV</Text> : null}
          </TouchableOpacity>
        </View>
        <View style={{ flexDirection: 'row' }} onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}>
          <View style={{ width: GUTTER, height: H + HEAD_H }}>
            {hours.filter((m) => m % 60 === 0).map((m) => (
              <Text key={m} style={[c.hour, { top: HEAD_H + y(m) - 7 }]}>{hm(m)}</Text>
            ))}
          </View>
          {fit ? <View style={{ flexDirection: 'row', flex: 1 }}>{columns}</View> : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }}>{columns}</ScrollView>
          )}
        </View>
        <Text style={c.tip}>Touchez un jour pour l'ouvrir, une case libre pour ajouter un RDV.</Text>
      </View>
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
    row: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
    dayLbl: { width: 58 },
    dayTxt: { color: t.ink, fontSize: 13, fontWeight: '700' },
    lane: { flex: 1, height: 28, borderRadius: 7, backgroundColor: t.fill, overflow: 'hidden', justifyContent: 'center' },
    laneEmpty: { color: t.grey, fontSize: 11.5, textAlign: 'center' },
    blk: { position: 'absolute', top: 3, bottom: 3, borderRadius: 5 },
    abs: { borderWidth: 1.5, borderStyle: 'dashed', borderColor: t.sep },
    now: { position: 'absolute', top: 0, bottom: 0, width: 2, backgroundColor: t.red },
    calBtn: { width: 28, height: 28, borderRadius: 8, backgroundColor: t.blueSoft, alignItems: 'center', justifyContent: 'center' },
    axis: { flexDirection: 'row', justifyContent: 'space-between', marginRight: 36, marginTop: 2 },
    tick: { color: t.grey, fontSize: 10.5, fontVariant: ['tabular-nums'] },
  });

const colStyles = (t: Palette) =>
  StyleSheet.create({
    card: { backgroundColor: t.card, borderRadius: 16, overflow: 'hidden', marginBottom: spacing.block, ...cardShadow(t) },
    head: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.hair },
    count: { flex: 1, color: t.grey, fontSize: 14 },
    zoom: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: t.fill, borderRadius: 99, paddingVertical: 5, paddingHorizontal: 10 },
    zTrack: { width: 50, height: 4, borderRadius: 2, backgroundColor: t.fill2, overflow: 'hidden' },
    zFill: { height: '100%', backgroundColor: t.blue },
    add: { flexDirection: 'row', alignItems: 'center', gap: 2, height: 34, minWidth: 34, justifyContent: 'center', paddingHorizontal: 8, borderRadius: 17, backgroundColor: t.blue },
    addTxt: { color: '#fff', fontSize: 14, fontWeight: '600', marginRight: 4 },
    hour: { position: 'absolute', right: 6, color: t.ink, fontSize: 11, fontWeight: '600', fontVariant: ['tabular-nums'] },
    col: { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: t.hair },
    colHead: { height: HEAD_H, alignItems: 'center', justifyContent: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.hair },
    wd: { color: t.grey, fontSize: 12, fontWeight: '600' },
    dn: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
    dnTxt: { color: t.ink, fontSize: 16, fontWeight: '700', fontVariant: ['tabular-nums'] },
    hl: { position: 'absolute', left: 0, right: 0, height: StyleSheet.hairlineWidth, backgroundColor: t.hair },
    ev: { position: 'absolute', left: 3, right: 3, borderRadius: 8, paddingVertical: 3, paddingHorizontal: 6, overflow: 'hidden' },
    evAbs: { backgroundColor: 'transparent', borderWidth: 1.5, borderStyle: 'dashed', borderColor: t.sep },
    evName: { color: t.ink, fontSize: 12, fontWeight: '700' },
    evMeta: { color: t.grey, fontSize: 10.5, fontVariant: ['tabular-nums'] },
    pick: { position: 'absolute', left: 3, right: 3, borderRadius: 8, borderWidth: 1.5, borderStyle: 'dashed', borderColor: t.blue, alignItems: 'center', justifyContent: 'center', backgroundColor: t.blueSoft },
    pickTxt: { color: t.blue, fontSize: 12, fontWeight: '700' },
    now: { position: 'absolute', left: 0, right: 0, height: 2, backgroundColor: t.red },
    tip: { color: t.grey, fontSize: 12, textAlign: 'center', paddingVertical: 8 },
  });
