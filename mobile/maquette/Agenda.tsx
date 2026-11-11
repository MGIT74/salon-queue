// MAQUETTE — Agenda, repris fonction par fonction du web (posteDayHtml / pdWeekHtml / pdMonthHtml de dashboard.html) :
// - Aujourd'hui, ‹ ›, Jour / Semaine / Mois ;
// - « La journée en un coup d'œil » : une barre par coiffeur (à venir / terminé / absent / maintenant), recherche client,
//   repli, toucher un espace libre de la barre = ajouter un RDV à cette heure ; sur téléphone, toucher la ligne choisit la colonne ;
// - colonne du coiffeur : pauses, créneaux « Libre · durée + Ajouter », blocs (heure, client, prestations, Prochain / En cours /
//   Terminé / Absent, ⚠ Forcé avec la partie qui chevauche hachurée) ;
// - Décaler de 5 min : ▲ / ▼ sur le bloc ou le glisser (5 min max autour de l'heure du client, s'il y a la place),
//   bandeau « Revenir en arrière », pastille ⇅ dans l'en-tête → « ↩ Remettre à l'heure du client » ;
// - zoom de la grille ; fiche du RDV : Modifier, Modifier la prestation, Déplacer, Annuler le RDV, historique.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, LayoutChangeEvent, PanResponder, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BREAKS, CATALOG, CLIENTS_LIST, HOURS, NOW_MIN, NUDGE, OFF, SERVICES, STAFF, Staff, apptsForDay, Appt, eur, hm } from './data';
import { Avatar, Go, Pill, Segmented, Sheet, SoftButton, useT } from './ui';

type St = 'todo' | 'inprogress' | 'done' | 'absent';
type Item = Appt & { end: number; st: St };
const R0 = 9 * 60, R1 = 19 * 60, SPAN = R1 - R0;

const stateOf = (a: Appt, offset: number): St => {
  if (a.noShow) return 'absent';
  if (offset < 0) return 'done';
  if (offset > 0) return 'todo';
  if (a.start + a.minutes <= NOW_MIN) return 'done';
  if (a.start <= NOW_MIN) return 'inprogress';
  return 'todo';
};
const dur = (m: number) => (m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}` : `${m} min`);
const dateOf = (offset: number) => { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + offset); return d; };
const isClosed = (offset: number) => [0, 1].includes(dateOf(offset).getDay());
const offWhy = (barberId: string, offset: number) => (OFF[offset] ?? []).find((o) => o.barberId === barberId)?.why ?? '';

export function Agenda({ meId, showAll }: { meId?: string; showAll?: boolean }) {
  const { t } = useT();
  const [view, setView] = useState<'day' | 'week' | 'month'>('day');
  const [offset, setOffset] = useState(0);
  const [focus, setFocus] = useState<string>(meId ?? STAFF[0].id);
  const [folded, setFolded] = useState(false);
  const [q, setQ] = useState('');
  const [px, setPx] = useState(1.6);
  const [store, setStore] = useState<Record<number, Appt[]>>({});
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState<{ barberId: string; time: number } | null>(null);
  const [movedOf, setMovedOf] = useState<string | null>(null);
  const [toast, setToast] = useState<{ text: string; undo?: () => void } | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  useEffect(() => { if (!toast) return; const id = setTimeout(() => setToast(null), 5000); return () => clearTimeout(id); }, [toast]);
  useEffect(() => { if (!flash) return; const id = setTimeout(() => setFlash(null), 2500); return () => clearTimeout(id); }, [flash]);

  const dayList = (o: number) => store[o] ?? apptsForDay(o);
  const setDay = (o: number, fn: (l: Appt[]) => Appt[]) => setStore((s) => ({ ...s, [o]: fn(s[o] ?? apptsForDay(o)) }));
  const items: Item[] = dayList(offset).map((a) => ({ ...a, end: a.start + a.minutes, st: stateOf(a, offset) }));
  const closed = isClosed(offset);
  const past = offset < 0;
  const isToday = offset === 0;
  const nowMin = isToday ? NOW_MIN : -1;
  const meNext = items.filter((i) => i.barberId === (meId ?? focus)).sort((a, b) => a.start - b.start)
    .find((i) => i.st === 'inprogress') ?? items.filter((i) => i.barberId === (meId ?? focus) && i.st === 'todo').sort((a, b) => a.start - b.start)[0];

  /* Créneaux libres d'un coiffeur (entre ses RDV, dans ses horaires, sans les pauses, à partir de maintenant). */
  const freeSpans = (bid: string): [number, number][] => {
    if (closed || past || offWhy(bid, offset)) return [];
    const [hs, he] = HOURS[bid];
    const busy = items.filter((i) => i.barberId === bid && i.st !== 'absent').map((i) => [i.start, i.end] as [number, number])
      .concat(BREAKS[bid] ?? []).sort((a, b) => a[0] - b[0]);
    const out: [number, number][] = [];
    let cur = Math.max(hs, isToday ? NOW_MIN : hs);
    busy.forEach(([s, e]) => { if (s - cur >= 20 && s <= he) out.push([cur, Math.min(s, he)]); cur = Math.max(cur, e); });
    if (he - cur >= 20) out.push([cur, he]);
    return out;
  };
  /* Décaler de 5 min : place libre juste avant / après, et 5 min au plus autour de l'heure réservée par le client. */
  const nudgeRoom = (it: Item): [boolean, boolean] => {
    if (closed || past || it.st !== 'todo') return [false, false];
    const [hs, he] = HOURS[it.barberId];
    let prevEnd = Math.max(hs, isToday ? NOW_MIN + 1 : hs), nextStart = he;
    items.filter((o) => o.id !== it.id && o.barberId === it.barberId && o.st !== 'absent').map((o) => [o.start, o.end] as [number, number])
      .concat(BREAKS[it.barberId] ?? []).forEach(([s, e]) => {
        if (e <= it.start) prevEnd = Math.max(prevEnd, e);
        else if (s >= it.end) nextStart = Math.min(nextStart, s);
        else { prevEnd = Infinity; nextStart = -Infinity; }
      });
    const ct = it.clientTime ?? it.start;
    return [it.start - prevEnd >= NUDGE && it.start - NUDGE >= ct - NUDGE, nextStart - it.end >= NUDGE && it.start + NUDGE <= ct + NUDGE];
  };
  const nudge = (id: string, dir: 1 | -1, undo?: boolean) => {
    const a = dayList(offset).find((x) => x.id === id); if (!a) return;
    const from = a.start, to = a.start + dir * NUDGE;
    const ct = a.clientTime ?? from;
    setDay(offset, (l) => l.map((x) => (x.id === id ? { ...x, start: to, clientTime: to === ct ? undefined : ct } : x)));
    setFlash(id);
    if (!undo) setToast({ text: `${a.client} : ${hm(from)} → ${hm(to)} · client non prévenu (5 min)`, undo: () => nudge(id, (dir * -1) as 1 | -1, true) });
    else setToast(null);
  };
  const restore = (id: string) => {
    const a = dayList(offset).find((x) => x.id === id); if (!a || a.clientTime === undefined) return;
    setDay(offset, (l) => l.map((x) => (x.id === id ? { ...x, start: a.clientTime as number, clientTime: undefined } : x)));
    setFlash(id); setToast({ text: `${a.client} remis à ${hm(a.clientTime)} (heure réservée)` });
  };

  /* Tablette (≥ 700 px) : toutes les colonnes côte à côte, ordre changé en glissant les noms (comme le web) ;
     téléphone : une seule colonne, choisie en touchant sa ligne dans le coup d'œil. */
  const { width } = useWindowDimensions();
  const wide = width >= 700;
  const [order, setOrder] = useState<string[]>(STAFF.map((s) => s.id));
  const [dragging, setDragging] = useState(false);
  const team = order.map((id) => STAFF.find((s) => s.id === id)!) as Staff[];
  const cols = wide ? team : team.filter((s) => s.id === focus);
  const move = (id: string, by: number) => setOrder((o) => {
    const i = o.indexOf(id); const j = Math.max(0, Math.min(o.length - 1, i + by)); if (i === j) return o;
    const n = [...o]; n.splice(i, 1); n.splice(j, 0, id); return n;
  });
  const found = q.trim() ? items.filter((a) => a.client.toLowerCase().includes(q.trim().toLowerCase())) : [];
  const date = dateOf(offset);
  const label = view === 'month' ? date.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
    : view === 'week' ? `Semaine du ${weekStart(offset).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}`
    : date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  const step = view === 'day' ? 1 : view === 'week' ? 7 : 30;
  const open = items.find((i) => i.id === openId) ?? null;

  return (
    <View style={{ flex: 1 }}>
      <ScrollView scrollEnabled={!dragging} contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 40 }}>
        {/* Barre de l'agenda */}
        <View style={[st.panel, { backgroundColor: t.card }]}>
          <View style={st.row}>
            <Pressable onPress={() => setOffset(offset - step)} style={[st.navBtn, { backgroundColor: t.fill }]}><Ionicons name="chevron-back" size={20} color={t.ink} /></Pressable>
            <Text style={{ flex: 1, textAlign: 'center', color: t.ink, fontSize: 17, fontWeight: '700', textTransform: view === 'week' ? 'none' : 'capitalize' }}>{label}</Text>
            <Pressable onPress={() => setOffset(offset + step)} style={[st.navBtn, { backgroundColor: t.fill }]}><Ionicons name="chevron-forward" size={20} color={t.ink} /></Pressable>
          </View>
          <View style={[st.row, { marginTop: 12 }]}>
            <Pressable onPress={() => setOffset(0)} style={[st.today, { borderColor: t.sep, backgroundColor: offset === 0 ? t.fill : t.card }]}><Text style={{ color: t.ink, fontWeight: '600' }}>Aujourd'hui</Text></Pressable>
            <Segmented style={{ flex: 1 }} value={view} onChange={setView} items={[{ key: 'day', label: 'Jour' }, { key: 'week', label: 'Semaine' }, { key: 'month', label: 'Mois' }]} />
          </View>
        </View>

        {view === 'week' && <WeekView offset={offset} dayList={dayList} onDay={(o) => { setOffset(o); setView('day'); }} />}
        {view === 'month' && <MonthView offset={offset} dayList={dayList} onDay={(o) => { setOffset(o); setView('day'); }} />}

        {view === 'day' && (
          <>
            {closed ? <View style={[st.banner, { backgroundColor: t.fill }]}><Text style={{ color: t.ink, textAlign: 'center' }}>Salon fermé — aucun rendez-vous ne peut être ajouté ce jour.</Text></View> : null}

            {/* La journée en un coup d'œil */}
            <View style={[st.panel, { backgroundColor: t.fill, marginTop: 12 }]}>
              <View style={[st.row, { justifyContent: 'space-between' }]}>
                <Pressable onPress={() => setFolded(!folded)} style={[st.row, { gap: 6, flex: 1 }]}>
                  <Text style={{ color: t.ink, fontWeight: '700', fontSize: 15 }}>La journée en un coup d'œil</Text>
                  <Ionicons name={folded ? 'chevron-down' : 'chevron-up'} size={16} color={t.grey} />
                </Pressable>
                <Pressable onPress={() => setFolded(!folded)}><Text style={{ color: t.blue, fontWeight: '600' }}>{folded ? 'Déplier' : 'Replier'}</Text></Pressable>
              </View>
              <View style={[st.search, { backgroundColor: t.card }]}>
                <Ionicons name="search" size={17} color={t.grey} />
                <TextInput value={q} onChangeText={setQ} placeholder="Rechercher un client…" placeholderTextColor={t.grey} style={{ flex: 1, color: t.ink, fontSize: 15, paddingVertical: 10 }} />
                {q ? <Pressable onPress={() => setQ('')}><Ionicons name="close-circle" size={18} color={t.grey} /></Pressable> : null}
              </View>
              {q.trim() ? (
                <View style={{ marginTop: 6 }}>
                  {found.length === 0 ? <Text style={{ color: t.grey, paddingVertical: 6 }}>Aucun RDV ce jour pour « {q} »</Text> : found.map((a) => (
                    <Pressable key={a.id} onPress={() => { setFocus(a.barberId); setOpenId(a.id); setQ(''); }} style={[st.row, { paddingVertical: 7 }]}>
                      <Avatar initials={STAFF.find((s) => s.id === a.barberId)!.initials} color={STAFF.find((s) => s.id === a.barberId)!.color} size={22} />
                      <Text style={{ color: t.ink, flex: 1 }}>{a.client}</Text><Text style={{ color: t.grey }}>{hm(a.start)}</Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
              {!folded ? (
                <>
                  <View style={[st.row, { flexWrap: 'wrap', gap: 12, marginTop: 10 }]}>
                    <Legend sw={{ backgroundColor: t.ink, opacity: 0.75 }} label="À venir" />
                    <Legend sw={{ backgroundColor: t.ink, opacity: 0.25 }} label="Terminé" />
                    <Legend sw={{ borderWidth: 1, borderStyle: 'dashed', borderColor: t.grey }} label="Absent" />
                    {isToday ? <Legend sw={{ width: 2, backgroundColor: t.red }} label="Maintenant" /> : null}
                  </View>
                  {team.map((s) => (
                    <GlanceRow key={s.id} staff={s} items={items.filter((i) => i.barberId === s.id)} focus={s.id === focus} me={s.id === meId}
                      off={offWhy(s.id, offset)} nowMin={nowMin} nextId={meNext?.id}
                      onPick={() => setFocus(s.id)} onAdd={(time) => !closed && !past && !offWhy(s.id, offset) && setAdding({ barberId: s.id, time })} />
                  ))}
                  <View style={{ flexDirection: 'row', marginLeft: 38, marginRight: 30, marginTop: 4 }}>
                    {[9, 12, 15, 18].map((h) => <Text key={h} style={{ position: 'absolute', left: `${((h * 60 - R0) / SPAN) * 100}%`, color: t.grey, fontSize: 10.5, marginLeft: -12 }}>{hm(h * 60)}</Text>)}
                  </View>
                  <View style={{ height: 14 }} />
                </>
              ) : null}
            </View>

            {/* Colonnes des coiffeurs */}
            <View style={[st.panel, { backgroundColor: t.card, marginTop: 12, paddingHorizontal: 8 }]}>
              <View style={[st.row, { justifyContent: 'space-between', marginBottom: 6 }]}>
                <Text style={{ color: t.grey, fontSize: 13, marginLeft: 6 }}>{wide ? 'Glissez un nom pour changer l\'ordre des coiffeurs' : `${items.filter((i) => i.barberId === focus).length} RDV ce jour`}</Text>
                <Zoom px={px} setPx={setPx} />
              </View>
              <HScroll on={wide} enabled={!dragging && cols.length * 200 + 52 > width - 60}>
                <View style={{ flexDirection: 'row', minWidth: wide ? Math.max(width - 70, cols.length * 200 + 52) : undefined }}>
                  <View style={{ width: 46 }}>
                    <View style={{ height: 48 }} />
                    <HourGutter px={px} />
                  </View>
                  {cols.map((b, i) => {
                    const its = items.filter((x) => x.barberId === b.id);
                    const moved = its.filter((x) => x.clientTime !== undefined && x.clientTime !== x.start);
                    const why = offWhy(b.id, offset);
                    return (
                      <DragCol key={b.id} first={i === 0} wide={wide} staff={b} me={b.id === meId} draggable={wide && cols.length > 1}
                        index={i} count={cols.length} moved={moved.length} canAdd={!closed && !past && !why}
                        onMoved={() => setMovedOf(b.id)} onAdd={() => setAdding({ barberId: b.id, time: freeSpans(b.id)[0]?.[0] ?? 15 * 60 })}
                        onStep={(by) => move(b.id, by)} onDragging={setDragging}>
                        <DayColumn staff={b} items={its} px={px} nowMin={nowMin} why={why} closed={closed} past={past}
                          free={freeSpans(b.id)} nextId={meNext?.id} flash={flash} nudgeRoom={nudgeRoom}
                          onOpen={(id) => setOpenId(id)} onNudge={nudge} onAdd={(time) => setAdding({ barberId: b.id, time })} />
                      </DragCol>
                    );
                  })}
                </View>
              </HScroll>
            </View>
          </>
        )}
      </ScrollView>

      {toast ? (
        <View style={[st.toast, { backgroundColor: t.ink }]}>
          <Text style={{ color: t.bg, fontWeight: '600', flex: 1 }}>{toast.text}</Text>
          {toast.undo ? <Pressable onPress={toast.undo} hitSlop={8}><Text style={{ color: '#ffd60a', fontWeight: '800' }}>Revenir en arrière</Text></Pressable> : null}
        </View>
      ) : null}

      <Sheet visible={!!open} onClose={() => setOpenId(null)} title={open?.client}>
        {open ? (
          <ApptDrawer appt={open} offset={offset}
            onClose={() => setOpenId(null)}
            onRestore={() => { restore(open.id); }}
            onSave={(patch, msg) => { setDay(offset, (l) => l.map((x) => (x.id === open.id ? { ...x, ...patch } : x))); setToast({ text: msg }); }}
            onMove={(barberId, toOffset, start) => {
              const a = dayList(offset).find((x) => x.id === open.id)!;
              setDay(offset, (l) => l.filter((x) => x.id !== open.id));
              setDay(toOffset, (l) => [...l, { ...a, barberId, start, clientTime: undefined }]);
              setOpenId(null); setToast({ text: `RDV de ${a.client} déplacé · le client est prévenu par email` });
            }}
            onCancel={() => { setDay(offset, (l) => l.filter((x) => x.id !== open.id)); setOpenId(null); setToast({ text: `RDV de ${open.client} annulé · le créneau est libéré` }); }} />
        ) : null}
      </Sheet>

      <Sheet visible={!!adding} onClose={() => setAdding(null)} title="Ajouter un rendez-vous">
        {adding ? (
          <AddAppt barberId={adding.barberId} time={adding.time} items={items}
            onDone={(a) => { setDay(offset, (l) => [...l, a]); setAdding(null); setFocus(a.barberId); setFlash(a.id); setToast({ text: `RDV ajouté · ${a.client} à ${hm(a.start)}${a.forcedBy ? ' (forcé)' : ''}` }); }} />
        ) : null}
      </Sheet>

      <Sheet visible={!!movedOf} onClose={() => setMovedOf(null)} title="RDV décalés de 5 min">
        <Text style={{ color: t.grey, marginBottom: 12, textAlign: 'center' }}>Décalés de 5 min dans l'agenda (clients non prévenus). « Remettre » les replace à l'heure réservée par le client.</Text>
        {items.filter((i) => i.barberId === movedOf && i.clientTime !== undefined && i.clientTime !== i.start).map((i) => (
          <View key={i.id} style={[st.row, { paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: t.sep }]}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: t.ink, fontWeight: '700' }}>{i.client}</Text>
              <Text style={{ color: t.grey, fontSize: 13 }}>Agenda {hm(i.start)} · réservé à {hm(i.clientTime as number)}</Text>
            </View>
            <Pressable onPress={() => restore(i.id)} style={[st.restore, { backgroundColor: t.fill }]}><Text style={{ color: t.ink, fontWeight: '600' }}>↩ Remettre à {hm(i.clientTime as number)}</Text></Pressable>
          </View>
        ))}
        {items.filter((i) => i.barberId === movedOf && i.clientTime !== undefined && i.clientTime !== i.start).length === 0 ? <Text style={{ color: t.grey, textAlign: 'center' }}>Tout est à l'heure du client.</Text> : null}
      </Sheet>
    </View>
  );
}

function weekStart(offset: number) { const d = dateOf(offset); const dow = (d.getDay() + 6) % 7; d.setDate(d.getDate() - dow); return d; }
const offsetOf = (d: Date) => Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12).getTime() - dateOf(0).getTime()) / 86400000);

/** Sur tablette, les colonnes défilent à gauche / à droite s'il y a beaucoup de coiffeurs (heures collées à gauche). */
function HScroll({ on, enabled, children }: { on: boolean; enabled: boolean; children: React.ReactNode }) {
  return on ? <ScrollView horizontal scrollEnabled={enabled} bounces={false} overScrollMode="never" showsHorizontalScrollIndicator={false}>{children}</ScrollView> : <View>{children}</View>;
}

function HourGutter({ px }: { px: number }) {
  const { t } = useT();
  const hours: number[] = [];
  for (let m = R0; m <= R1; m += 30) hours.push(m);
  return (
    <View style={{ height: SPAN * px + 16 }}>
      {hours.map((m) => (
        <Text key={m} style={{ position: 'absolute', right: 6, top: (m - R0) * px, color: t.grey, fontSize: m % 60 === 0 ? 12 : 10 }}>{hm(m)}</Text>
      ))}
    </View>
  );
}

/** Colonne d'un coiffeur (en-tête + journée). Sur tablette, on attrape l'en-tête (≡, photo, nom) et SEULE cette colonne
 *  suit le doigt ; en passant la moitié de la voisine, elle prend sa place (les autres glissent d'un cran). Le reste de
 *  l'agenda ne bouge pas : défilements bloqués pendant le geste, pas d'effet élastique. */
const COL_STEP = 198;
function DragCol({ first, wide, staff, me, draggable, index, count, moved, canAdd, onMoved, onAdd, onStep, onDragging, children }: {
  first: boolean; wide: boolean; staff: Staff; me: boolean; draggable: boolean; index: number; count: number; moved: number; canAdd: boolean;
  onMoved: () => void; onAdd: () => void; onStep: (by: number) => void; onDragging: (v: boolean) => void; children: React.ReactNode;
}) {
  const { t } = useT();
  const dx = useRef(new Animated.Value(0)).current;
  const [drag, setDrag] = useState(false);
  const shift = useRef(0);
  const step = useRef(COL_STEP);
  const pos = useRef({ index, count }); pos.current = { index, count };
  const cb = useRef({ onStep, onDragging }); cb.current = { onStep, onDragging };
  const pan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => draggable,
    onStartShouldSetPanResponderCapture: () => draggable,
    onMoveShouldSetPanResponderCapture: () => draggable,
    onPanResponderTerminationRequest: () => false,
    onShouldBlockNativeResponder: () => true,
    onPanResponderGrant: () => { shift.current = 0; setDrag(true); cb.current.onDragging(true); },
    onPanResponderMove: (_e, g) => {
      let x = g.dx - shift.current;
      // Passé la moitié de la colonne voisine : on échange les places, la colonne reste sous le doigt.
      const W = step.current;
      if (x > W / 2 && pos.current.index < pos.current.count - 1) { cb.current.onStep(1); shift.current += W; x -= W; }
      else if (x < -W / 2 && pos.current.index > 0) { cb.current.onStep(-1); shift.current -= W; x += W; }
      const lo = pos.current.index === 0 ? -12 : -W, hi = pos.current.index === pos.current.count - 1 ? 12 : W;
      dx.setValue(Math.max(lo, Math.min(hi, x)));
    },
    onPanResponderRelease: () => { Animated.spring(dx, { toValue: 0, useNativeDriver: true, speed: 30, bounciness: 0 }).start(); setDrag(false); cb.current.onDragging(false); },
    onPanResponderTerminate: () => { dx.setValue(0); setDrag(false); cb.current.onDragging(false); },
  }), [draggable]);
  return (
    <Animated.View onLayout={(e) => { step.current = e.nativeEvent.layout.width + 8; }} style={{ flex: 1, minWidth: wide ? 190 : undefined, marginLeft: first ? 0 : 8, transform: [{ translateX: dx }], zIndex: drag ? 20 : 1,
      opacity: drag ? 0.96 : 1, ...(drag ? { shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 8 } : {}),
      backgroundColor: drag ? t.card : 'transparent', borderRadius: 12 }}>
      <View style={[st.row, { height: 44, marginBottom: 4, paddingHorizontal: 6, borderRadius: 12, gap: 6, backgroundColor: drag ? t.blueSoft : 'transparent' }]}>
        <View {...pan.panHandlers} style={[st.row, { flex: 1, gap: 6, height: '100%' }]}>
          {draggable ? <Ionicons name="reorder-three" size={20} color={drag ? t.blue : t.grey} /> : null}
          <Avatar initials={staff.initials} color={staff.color} size={28} />
          <Text selectable={false} style={{ color: t.ink, fontWeight: '700', flexShrink: 1 }} numberOfLines={1}>{staff.name}{me ? ' · moi' : ''}</Text>
        </View>
        {moved ? <Pressable onPress={onMoved} style={[st.movedBadge, { backgroundColor: t.blueSoft }]}><Text style={{ color: t.blue, fontWeight: '800', fontSize: 12.5 }}>⇅ {moved}</Text></Pressable> : null}
        {canAdd ? <Pressable onPress={onAdd} style={[st.addRdv, { backgroundColor: t.blue, paddingHorizontal: 11 }]}><Text style={{ color: '#fff', fontWeight: '700' }}>+ RDV</Text></Pressable> : null}
      </View>
      {children}
    </Animated.View>
  );
}

function Legend({ sw, label }: { sw: object; label: string }) {
  const { t } = useT();
  return <View style={[st.row, { gap: 5 }]}><View style={[{ width: 14, height: 8, borderRadius: 2 }, sw]} /><Text style={{ color: t.grey, fontSize: 12 }}>{label}</Text></View>;
}

function Zoom({ px, setPx }: { px: number; setPx: (v: number) => void }) {
  const { t } = useT();
  const pct = (px - 1) / 2;
  return (
    <View style={[st.row, { backgroundColor: t.fill, borderRadius: 99, paddingHorizontal: 10, paddingVertical: 6, gap: 8 }]}>
      <Pressable onPress={() => setPx(Math.max(1, +(px - 0.4).toFixed(1)))} hitSlop={8}><Ionicons name="remove-circle-outline" size={20} color={t.ink} /></Pressable>
      <View style={{ width: 90, height: 4, borderRadius: 2, backgroundColor: t.fill2 }}>
        <View style={{ position: 'absolute', left: `${pct * 100}%`, top: -5, width: 14, height: 14, borderRadius: 7, marginLeft: -7, backgroundColor: t.blue }} />
      </View>
      <Pressable onPress={() => setPx(Math.min(3, +(px + 0.4).toFixed(1)))} hitSlop={8}><Ionicons name="add-circle-outline" size={20} color={t.ink} /></Pressable>
    </View>
  );
}

function GlanceRow({ staff, items, focus, me, off, nowMin, nextId, onPick, onAdd }: {
  staff: Staff; items: Item[]; focus: boolean; me: boolean; off: string; nowMin: number; nextId?: string; onPick: () => void; onAdd: (time: number) => void;
}) {
  const { t } = useT();
  const [w, setW] = useState(1);
  return (
    <View style={[st.row, { marginTop: 8 }]}>
      <Pressable onPress={onPick} style={{ padding: 2, borderRadius: 99, borderWidth: 2, borderColor: focus ? t.blue : 'transparent' }}>
        <Avatar initials={staff.initials} color={staff.color} size={24} />
      </Pressable>
      <Pressable onLayout={(e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width)}
        onPress={(e) => { onPick(); const m = R0 + Math.round(((e.nativeEvent.locationX / w) * SPAN) / 15) * 15; if (!items.some((i) => i.st !== 'absent' && m >= i.start && m < i.end)) onAdd(m); }}
        style={{ flex: 1, height: 24, borderRadius: 8, backgroundColor: t.card, overflow: 'hidden', borderWidth: focus ? 1.5 : 0, borderColor: t.blue }}>
        {off ? <Text style={{ color: t.grey, fontSize: 12, textAlign: 'center', marginTop: 4 }}>{staff.name} {off}</Text>
          : items.length === 0 ? <Text style={{ color: t.grey, fontSize: 12, textAlign: 'center', marginTop: 4 }}>Aucun RDV</Text> : null}
        {items.map((it) => (
          <View key={it.id} style={{
            position: 'absolute', top: 4, bottom: 4, borderRadius: 4, left: `${((it.start - R0) / SPAN) * 100}%`, width: `${(it.minutes / SPAN) * 100}%`,
            backgroundColor: it.st === 'absent' ? 'transparent' : staff.color, opacity: it.st === 'done' ? 0.3 : it.st === 'absent' ? 1 : 0.85,
            borderWidth: it.st === 'absent' ? 1 : it.id === nextId ? 2 : 0, borderStyle: it.st === 'absent' ? 'dashed' : 'solid', borderColor: it.st === 'absent' ? t.grey : t.ink,
          }} />
        ))}
        {nowMin >= R0 ? <View style={{ position: 'absolute', top: 0, bottom: 0, width: 2, backgroundColor: t.red, left: `${((nowMin - R0) / SPAN) * 100}%` }} /> : null}
      </Pressable>
      <Ionicons name="calendar-outline" size={16} color={off ? t.grey : t.blue} style={{ width: 22 }} />
    </View>
  );
}

function DayColumn({ staff, items, px, nowMin, why, closed, past, free, nextId, flash, nudgeRoom, onOpen, onNudge, onAdd }: {
  staff: Staff; items: Item[]; px: number; nowMin: number; why: string; closed: boolean; past: boolean; free: [number, number][]; nextId?: string; flash: string | null;
  nudgeRoom: (it: Item) => [boolean, boolean]; onOpen: (id: string) => void; onNudge: (id: string, dir: 1 | -1) => void; onAdd: (time: number) => void;
}) {
  const { t } = useT();
  const hours: number[] = [];
  for (let m = R0; m <= R1; m += 30) hours.push(m);
  // Blocs qui se chevauchent (RDV forcé) : côte à côte, comme pdLayout.
  const lanes = useMemo(() => {
    const out: Record<string, { lane: number; of: number }> = {};
    const sorted = [...items].sort((a, b) => a.start - b.start);
    sorted.forEach((it) => {
      const overl = sorted.filter((o) => o.id !== it.id && o.start < it.end && it.start < o.end);
      if (!overl.length) out[it.id] = { lane: 0, of: 1 };
      else { const grp = [it, ...overl].sort((a, b) => a.start - b.start || a.id.localeCompare(b.id)); out[it.id] = { lane: grp.indexOf(it), of: grp.length }; }
    });
    return out;
  }, [items]);
  return (
    <View style={{ height: SPAN * px + 16, opacity: past ? 0.85 : 1 }}>
      {hours.map((m) => (
        <View key={m} style={{ position: 'absolute', left: 0, right: 0, top: (m - R0) * px + 7, height: StyleSheet.hairlineWidth, backgroundColor: t.sep, opacity: m % 60 === 0 ? 1 : 0.45 }} />
      ))}
      {why ? <View style={[st.colOff, { backgroundColor: t.fill }]}><Text style={{ color: t.grey, fontWeight: '600' }}>{why.charAt(0).toUpperCase() + why.slice(1)}</Text></View> : null}
      {!why && (BREAKS[staff.id] ?? []).map(([s, e]) => (
        <View key={s} style={[st.pause, { top: (s - R0) * px, height: Math.max(14, (e - s) * px - 3), backgroundColor: t.fill }]}><Text style={{ color: t.grey, fontSize: 12, fontWeight: '600' }}>Pause</Text></View>
      ))}
      {free.map(([s, e]) => {
        const h = Math.max(12, (e - s) * px - 3);
        return (
          <Pressable key={'f' + s} onPress={() => onAdd(s)} style={[st.free, { top: (s - R0) * px, height: h, borderColor: t.sep }]}>
            {h >= 22 ? <Text style={{ color: t.grey, fontSize: 12 }}>Libre · {dur(e - s)}  <Text style={{ color: t.blue, fontWeight: '700' }}>+ Ajouter</Text></Text> : null}
          </Pressable>
        );
      })}
      {items.map((it) => (
        <Block key={it.id} it={it} color={staff.color} px={px} lane={lanes[it.id]} next={it.id === nextId} flash={flash === it.id}
          room={nudgeRoom(it)} overlap={items.find((o) => o.id !== it.id && it.forcedBy && o.start < it.end && o.start >= it.start)}
          onOpen={() => onOpen(it.id)} onNudge={(d) => onNudge(it.id, d)} />
      ))}
      {nowMin >= R0 && nowMin <= R1 ? (
        <View pointerEvents="none" style={{ position: 'absolute', left: -6, right: 0, top: (nowMin - R0) * px + 3, flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: t.red }} /><View style={{ flex: 1, height: 2, backgroundColor: t.red }} />
        </View>
      ) : null}
      {closed ? <View style={[st.colOff, { backgroundColor: t.fill }]}><Text style={{ color: t.grey, fontWeight: '600' }}>Salon fermé</Text></View> : null}
    </View>
  );
}

function Block({ it, color, px, lane, next, flash, room, overlap, onOpen, onNudge }: {
  it: Item; color: string; px: number; lane: { lane: number; of: number }; next: boolean; flash: boolean; room: [boolean, boolean]; overlap?: Item;
  onOpen: () => void; onNudge: (d: 1 | -1) => void;
}) {
  const { t } = useT();
  const h = Math.max(18, it.minutes * px - 3);
  const narrow = lane.of > 1;
  const can = room[0] || room[1];
  const label = it.st === 'absent' ? 'Absent' : it.st === 'done' ? 'Terminé' : it.st === 'inprogress' ? 'En cours' : next ? 'Prochain' : '';
  const chips = [it.service, ...(it.extras ?? []), ...(it.products ?? [])];
  /* Glisser le bloc (5 min max) : suit le doigt, retombe sur l'heure d'avant / d'après s'il y a la place. */
  const dy = useRef(new Animated.Value(0)).current;
  const roomRef = useRef(room); roomRef.current = room;
  const stepPx = NUDGE * px;
  const pan = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_e, g) => can && Math.abs(g.dy) > 6 && Math.abs(g.dy) > Math.abs(g.dx) * 1.5,
    onPanResponderMove: (_e, g) => {
      const lo = roomRef.current[0] ? -stepPx : 0, hi = roomRef.current[1] ? stepPx : 0;
      dy.setValue(Math.max(lo, Math.min(hi, g.dy)));
    },
    onPanResponderRelease: (_e, g) => {
      const d = g.dy <= -stepPx / 2 && roomRef.current[0] ? -1 : g.dy >= stepPx / 2 && roomRef.current[1] ? 1 : 0;
      Animated.spring(dy, { toValue: 0, useNativeDriver: true, speed: 40 }).start();
      if (d) onNudge(d as 1 | -1);
    },
    onPanResponderTerminate: () => Animated.spring(dy, { toValue: 0, useNativeDriver: true }).start(),
  }), [can, stepPx]);
  const done = it.st === 'done';
  return (
    <Animated.View {...pan.panHandlers} style={[st.block, {
      top: (it.start - R0) * px, height: h, left: `${(lane.lane / lane.of) * 100}%`, width: `${100 / lane.of}%`,
      backgroundColor: it.st === 'absent' ? 'transparent' : color + (done ? '1f' : '33'), borderLeftColor: color,
      borderWidth: it.st === 'absent' ? 1 : 0, borderStyle: 'dashed', borderColor: t.grey,
      transform: [{ translateY: dy }], zIndex: flash ? 3 : 1,
    }, flash && { shadowColor: '#30d158', shadowOpacity: 1, shadowRadius: 0, shadowOffset: { width: 0, height: 0 }, borderWidth: 2, borderStyle: 'solid', borderColor: '#30d158' },
    next && { borderWidth: 2, borderStyle: 'solid', borderColor: t.ink }]}>
      <Pressable onPress={onOpen} style={{ flex: 1, paddingHorizontal: 7, paddingVertical: 4 }}>
        {overlap ? (
          <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: (overlap.start - it.start) * px, bottom: 0, backgroundColor: 'rgba(255,159,10,.28)', borderTopWidth: 1, borderColor: '#ff9f0a' }} />
        ) : null}
        <View style={[st.row, { gap: 4 }]}>
          <Text style={{ color: t.grey, fontSize: 11.5, fontWeight: '600' }} numberOfLines={1}>{hm(it.start)} – {hm(it.end)}</Text>
          {it.clientTime !== undefined && it.clientTime !== it.start ? <Text style={{ color: t.blue, fontSize: 11, fontWeight: '800' }}>⇅</Text> : null}
          {it.prepaid ? <Ionicons name="checkmark-circle" size={13} color={t.green} /> : null}
        </View>
        <Text style={{ color: t.ink, fontWeight: '700', fontSize: 14, opacity: done ? 0.6 : 1, textDecorationLine: it.st === 'absent' ? 'line-through' : 'none' }} numberOfLines={1}>{it.client}</Text>
        {h >= 46 && !narrow ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 3 }}>
            {chips.map((c) => <View key={c} style={{ backgroundColor: t.card, borderRadius: 6, paddingHorizontal: 5, paddingVertical: 1 }}><Text style={{ color: t.ink, fontSize: 11 }}>{c}</Text></View>)}
          </View>
        ) : null}
        {label && !narrow ? <Text style={{ position: 'absolute', right: 6, top: 4, color: it.st === 'inprogress' ? t.green : next ? t.blue : t.grey, fontSize: 11, fontWeight: '800' }}>{label}</Text> : null}
        {it.forcedBy ? <Text style={{ position: 'absolute', right: 6, bottom: can ? 22 : 3, color: '#b35a00', fontSize: 11, fontWeight: '800' }}>⚠{narrow ? '' : ' Forcé'}</Text> : null}
      </Pressable>
      {can ? (
        <View style={[st.nudges, narrow && { flexDirection: 'column' }]}>
          {room[0] ? <Pressable onPress={() => onNudge(-1)} hitSlop={6} style={st.nudge}><Text style={st.nudgeTxt}>▲ 5 min</Text></Pressable> : null}
          {room[1] ? <Pressable onPress={() => onNudge(1)} hitSlop={6} style={st.nudge}><Text style={st.nudgeTxt}>▼ 5 min</Text></Pressable> : null}
        </View>
      ) : null}
    </Animated.View>
  );
}

/* ------------------------------------------------------------ Semaine et mois */

function WeekView({ offset, dayList, onDay }: { offset: number; dayList: (o: number) => Appt[]; onDay: (o: number) => void }) {
  const { t } = useT();
  const start = weekStart(offset);
  const days = [...Array(7)].map((_, i) => { const d = new Date(start); d.setDate(d.getDate() + i); return d; });
  return (
    <View style={{ marginTop: 12, gap: 10 }}>
      {days.map((d) => {
        const o = offsetOf(d);
        const list = dayList(o);
        const closed = isClosed(o);
        return (
          <Pressable key={o} onPress={() => onDay(o)} style={[st.panel, { backgroundColor: t.card, opacity: closed ? 0.55 : 1, borderWidth: o === 0 ? 2 : 0, borderColor: t.blue }]}>
            <View style={[st.row, { justifyContent: 'space-between' }]}>
              <Text style={{ color: t.ink, fontWeight: '700', textTransform: 'capitalize' }}>{d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric' })}</Text>
              <Text style={{ color: t.grey, fontSize: 13 }}>{closed ? 'Fermé' : `${list.length} RDV`}</Text>
            </View>
            {!closed ? STAFF.map((s) => {
              const why = offWhy(s.id, o);
              const its = list.filter((a) => a.barberId === s.id);
              return (
                <View key={s.id} style={[st.row, { marginTop: 6 }]}>
                  <Avatar initials={s.initials} color={s.color} size={18} />
                  <View style={{ flex: 1, height: 14, borderRadius: 5, backgroundColor: t.fill, overflow: 'hidden' }}>
                    {why ? <Text style={{ color: t.grey, fontSize: 10, textAlign: 'center' }}>{why}</Text> : its.map((a) => (
                      <View key={a.id} style={{ position: 'absolute', top: 2, bottom: 2, borderRadius: 3, backgroundColor: s.color, opacity: stateOf(a, o) === 'done' ? 0.3 : 0.85,
                        left: `${((a.start - R0) / SPAN) * 100}%`, width: `${(a.minutes / SPAN) * 100}%` }} />
                    ))}
                  </View>
                </View>
              );
            }) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

function MonthView({ offset, dayList, onDay }: { offset: number; dayList: (o: number) => Appt[]; onDay: (o: number) => void }) {
  const { t } = useT();
  const ref = dateOf(offset);
  const first = new Date(ref.getFullYear(), ref.getMonth(), 1, 12);
  const lead = (first.getDay() + 6) % 7;
  const n = new Date(ref.getFullYear(), ref.getMonth() + 1, 0).getDate();
  const cells: (Date | null)[] = [...Array(lead).fill(null), ...[...Array(n)].map((_, i) => new Date(ref.getFullYear(), ref.getMonth(), i + 1, 12))];
  while (cells.length % 7) cells.push(null);
  const monthTotal = cells.reduce((a, d) => a + (d ? dayList(offsetOf(d)).length : 0), 0);
  return (
    <View style={[st.panel, { backgroundColor: t.card, marginTop: 12 }]}>
      <Text style={{ color: t.grey, marginBottom: 8 }}>{monthTotal} RDV ce mois-ci</Text>
      <View style={st.row}>{['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((x, i) => <Text key={i} style={{ flex: 1, textAlign: 'center', color: t.grey, fontWeight: '700', fontSize: 12 }}>{x}</Text>)}</View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 6 }}>
        {cells.map((d, i) => {
          if (!d) return <View key={i} style={{ width: `${100 / 7}%`, height: 62 }} />;
          const o = offsetOf(d); const list = dayList(o); const closed = isClosed(o);
          return (
            <Pressable key={i} onPress={() => onDay(o)} style={{ width: `${100 / 7}%`, height: 62, padding: 2 }}>
              <View style={{ flex: 1, borderRadius: 10, backgroundColor: o === 0 ? t.blue : closed ? 'transparent' : t.fill, alignItems: 'center', paddingTop: 5, opacity: o < 0 ? 0.6 : 1 }}>
                <Text style={{ color: o === 0 ? '#fff' : t.ink, fontWeight: '700', fontSize: 14 }}>{d.getDate()}</Text>
                {!closed && list.length ? (
                  <>
                    <View style={{ flexDirection: 'row', gap: 2, marginTop: 4 }}>
                      {STAFF.map((s) => list.some((a) => a.barberId === s.id) ? <View key={s.id} style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: s.color }} /> : null)}
                    </View>
                    <Text style={{ color: o === 0 ? '#fff' : t.grey, fontSize: 10.5, marginTop: 2 }}>{list.length}</Text>
                  </>
                ) : null}
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/* --------------------------------------------------------------- Fiche du RDV */

function ApptDrawer({ appt, offset, onClose, onRestore, onSave, onMove, onCancel }: {
  appt: Item; offset: number; onClose: () => void; onRestore: () => void;
  onSave: (patch: Partial<Appt>, msg: string) => void; onMove: (barberId: string, toOffset: number, start: number) => void; onCancel: () => void;
}) {
  const { t } = useT();
  const [mode, setMode] = useState<'info' | 'edit' | 'svc' | 'move' | 'cancel'>('info');
  const [name, setName] = useState(appt.client);
  const [phone, setPhone] = useState(appt.phone ?? '');
  const [email, setEmail] = useState(appt.email ?? '');
  const [svc, setSvc] = useState(appt.service);
  const [extras, setExtras] = useState<string[]>(appt.extras ?? []);
  const [products, setProducts] = useState<string[]>(appt.products ?? []);
  const [mvBarber, setMvBarber] = useState(appt.barberId);
  const [mvDay, setMvDay] = useState(offset);
  const [half, setHalf] = useState<'am' | 'pm'>(appt.start < 13 * 60 ? 'am' : 'pm');
  const [mvTime, setMvTime] = useState<number | null>(null);
  const b = STAFF.find((s) => s.id === appt.barberId)!;
  const client = CLIENTS_LIST.find((c) => c.name.split(' ')[0] === appt.client.split(' ')[0]);
  const editable = appt.st === 'todo';

  if (mode === 'edit') return (
    <View>
      {([['Nom', name, setName], ['Email', email, setEmail], ['Téléphone', phone, setPhone]] as const).map(([k, v, set]) => (
        <View key={k} style={{ marginBottom: 10 }}>
          <Text style={{ color: t.grey, marginBottom: 5 }}>{k}</Text>
          <TextInput value={v} onChangeText={set} style={[st.input, { backgroundColor: t.fill, color: t.ink }]} />
        </View>
      ))}
      <View style={[st.row, { marginTop: 6 }]}>
        <View style={{ flex: 1 }}><Go label="Enregistrer" onPress={() => { onSave({ client: name, phone, email }, 'Fiche client enregistrée'); setMode('info'); }} /></View>
        <View style={{ flex: 1 }}><SoftButton label="Annuler" onPress={() => setMode('info')} /></View>
      </View>
    </View>
  );

  if (mode === 'svc') {
    const s = SERVICES.find((x) => x.name === svc) ?? SERVICES[0];
    const exC = CATALOG.filter((c) => c.kind === 'extra' && extras.includes(c.name)).reduce((a, c) => a + c.priceCents, 0);
    const prC = CATALOG.filter((c) => c.kind === 'product' && products.includes(c.name)).reduce((a, c) => a + c.priceCents, 0);
    const chip = (label: string, on: boolean, onPress: () => void) => (
      <Pressable key={label} onPress={onPress} style={{ paddingHorizontal: 12, paddingVertical: 9, borderRadius: 10, backgroundColor: on ? t.blue : t.fill }}>
        <Text style={{ color: on ? '#fff' : t.ink, fontWeight: '600' }}>{label}</Text>
      </Pressable>
    );
    return (
      <View>
        <Text style={st.lbl(t)}>Prestation</Text>
        <View style={st.wrap}>{SERVICES.map((x) => chip(x.name, x.name === svc, () => setSvc(x.name)))}</View>
        <Text style={st.lbl(t)}>Suppléments</Text>
        <View style={st.wrap}>{CATALOG.filter((c) => c.kind === 'extra').map((c) => chip(c.name, extras.includes(c.name), () => setExtras((e) => (e.includes(c.name) ? e.filter((x) => x !== c.name) : [...e, c.name]))))}</View>
        <Text style={st.lbl(t)}>Produits</Text>
        <View style={st.wrap}>{CATALOG.filter((c) => c.kind === 'product').map((c) => chip(c.name, products.includes(c.name), () => setProducts((e) => (e.includes(c.name) ? e.filter((x) => x !== c.name) : [...e, c.name]))))}</View>
        <View style={[st.row, { justifyContent: 'space-between', marginVertical: 16 }]}>
          <Text style={{ color: t.grey }}>{dur(s.minutes)}</Text><Text style={{ color: t.ink, fontSize: 20, fontWeight: '800' }}>{eur(s.priceCents + exC + prC)}</Text>
        </View>
        <Go label="Enregistrer" onPress={() => { onSave({ service: svc, extras, products, minutes: s.minutes, priceCents: s.priceCents + exC + prC }, 'Prestation modifiée'); setMode('info'); }} />
        <View style={{ height: 8 }} /><SoftButton label="Retour" onPress={() => setMode('info')} />
      </View>
    );
  }

  if (mode === 'move') {
    const days = [...Array(8)].map((_, i) => offset + i).filter((o) => !isClosed(o));
    const slots: number[] = [];
    for (let m = half === 'am' ? 9 * 60 : 13 * 60 + 30; m < (half === 'am' ? 12 * 60 + 30 : 19 * 60); m += 15) {
      const busy = apptsForDay(mvDay).some((a) => a.barberId === mvBarber && a.id !== appt.id && m < a.start + a.minutes && a.start < m + appt.minutes);
      const br = (BREAKS[mvBarber] ?? []).some(([s, e]) => m < e && s < m + appt.minutes);
      if (!busy && !br && !offWhy(mvBarber, mvDay) && !(mvDay === 0 && m <= NOW_MIN)) slots.push(m);
    }
    return (
      <View>
        <Text style={st.lbl(t)}>Coiffeur</Text>
        <View style={st.wrap}>{STAFF.map((s) => (
          <Pressable key={s.id} onPress={() => { setMvBarber(s.id); setMvTime(null); }} style={[st.row, { gap: 6, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 99, backgroundColor: s.id === mvBarber ? t.blueSoft : t.fill, borderWidth: 1.5, borderColor: s.id === mvBarber ? t.blue : 'transparent' }]}>
            <Avatar initials={s.initials} color={s.color} size={22} /><Text style={{ color: t.ink, fontWeight: '600' }}>{s.name}</Text>
          </Pressable>
        ))}</View>
        <Text style={st.lbl(t)}>Jour</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {days.map((o) => {
            const d = dateOf(o); const on = o === mvDay;
            return (
              <Pressable key={o} onPress={() => { setMvDay(o); setMvTime(null); }} style={{ width: 58, borderRadius: 12, paddingVertical: 8, alignItems: 'center', backgroundColor: on ? t.blue : t.fill }}>
                <Text style={{ color: on ? '#fff' : t.grey, fontSize: 11.5, fontWeight: '600' }}>{d.toLocaleDateString('fr-FR', { weekday: 'short' })}</Text>
                <Text style={{ color: on ? '#fff' : t.ink, fontSize: 18, fontWeight: '700' }}>{d.getDate()}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
        <Segmented style={{ marginTop: 14 }} value={half} onChange={(v) => { setHalf(v); setMvTime(null); }} items={[{ key: 'am', label: 'Matin' }, { key: 'pm', label: 'Après-midi' }]} />
        <View style={[st.wrap, { marginTop: 12 }]}>
          {slots.length === 0 ? <Text style={{ color: t.grey }}>Aucun créneau libre</Text> : slots.map((m) => (
            <Pressable key={m} onPress={() => setMvTime(m)} style={{ width: '22%', flexGrow: 1, paddingVertical: 11, borderRadius: 12, alignItems: 'center', backgroundColor: m === mvTime ? t.blue : t.fill }}>
              <Text style={{ color: m === mvTime ? '#fff' : t.ink, fontWeight: '700' }}>{hm(m)}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={{ color: t.grey, fontSize: 12.5, textAlign: 'center', marginTop: 12 }}>Le client reçoit un email avec le nouvel horaire.</Text>
        <View style={{ height: 12 }} />
        <Go label={mvTime !== null ? `Déplacer à ${hm(mvTime)}` : 'Choisissez un créneau'} disabled={mvTime === null} onPress={() => mvTime !== null && onMove(mvBarber, mvDay, mvTime)} />
        <View style={{ height: 8 }} /><SoftButton label="Retour" onPress={() => setMode('info')} />
      </View>
    );
  }

  if (mode === 'cancel') return (
    <View>
      <Text style={{ color: t.grey, textAlign: 'center', lineHeight: 21 }}>{hm(appt.start)} · {appt.service} avec {b.name}{'\n'}Le client est prévenu par email et le créneau est libéré.</Text>
      <View style={{ height: 16 }} />
      <Pressable onPress={onCancel} style={{ backgroundColor: t.red, borderRadius: 16, paddingVertical: 15, alignItems: 'center' }}><Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>Annuler le RDV</Text></Pressable>
      <View style={{ height: 8 }} /><SoftButton label="Garder le RDV" onPress={() => setMode('info')} />
    </View>
  );

  const rows: [string, string][] = [
    ['Heure', `${hm(appt.start)} – ${hm(appt.end)}`],
    ['Coiffeur', b.name],
    ['Prestation', [appt.service, ...(appt.extras ?? []), ...(appt.products ?? [])].join(' + ')],
    ['Prix', eur(appt.priceCents)],
    ['Réservé', appt.online ? 'En ligne' : 'Au salon'],
    ['Téléphone', appt.phone || '—'],
    ['Email', appt.email || '—'],
  ];
  return (
    <View>
      <View style={[st.row, { justifyContent: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }]}>
        {appt.prepaid ? <Pill label="✓ Déjà payé" tone="green" /> : null}
        {client?.account ? <Pill label={`⭐ Fidélité · ${client.loyalty} pts`} tone="orange" /> : <Pill label="Carte de fidélité non activée" tone="grey" />}
        {appt.st === 'absent' ? <Pill label="Absent" tone="red" /> : null}
        {appt.forcedBy ? <Pill label={`⚠ Forcé par ${appt.forcedBy}`} tone="orange" /> : null}
      </View>
      <Pressable onPress={() => setMode('edit')} style={[st.row, { gap: 6, alignSelf: 'center', marginBottom: 12 }]}><Ionicons name="create-outline" size={16} color={t.blue} /><Text style={{ color: t.blue, fontWeight: '500' }}>Modifier</Text></Pressable>
      {editable ? (
        <View style={{ gap: 8, marginBottom: 12 }}>
          <SoftButton label="Modifier la prestation" onPress={() => setMode('svc')} />
          <View style={[st.row, { gap: 8 }]}>
            <View style={{ flex: 1 }}><SoftButton label="Déplacer" onPress={() => setMode('move')} /></View>
            <View style={{ flex: 1 }}><SoftButton label="Annuler le RDV" danger onPress={() => setMode('cancel')} /></View>
          </View>
          {appt.clientTime !== undefined && appt.clientTime !== appt.start ? <SoftButton label={`↩ Remettre à ${hm(appt.clientTime)} (heure réservée par le client)`} onPress={onRestore} /> : null}
        </View>
      ) : null}
      {rows.map(([k, v]) => (
        <View key={k} style={[st.row, { justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: t.sep }]}>
          <Text style={{ color: t.grey }}>{k}</Text><Text style={{ color: t.ink, fontWeight: '600', flexShrink: 1, textAlign: 'right' }}>{v}</Text>
        </View>
      ))}
      {appt.note ? (
        <View style={{ marginTop: 12 }}><Text style={{ color: t.grey, fontWeight: '600' }}>📝 Note du client (RDV)</Text><Text style={{ color: t.ink, marginTop: 4 }}>{appt.note}</Text></View>
      ) : null}
      <Text style={{ color: t.grey, fontWeight: '700', marginTop: 16, marginBottom: 6 }}>Historique des passages</Text>
      {client ? [['17 oct.', 'Coupe', 'Tom', 2500], ['19 sept.', 'Coupe + barbe', b.name, 3500], ['22 août', 'Coupe', b.name, 2500]].slice(0, Math.min(3, client.visits)).map(([d, s, w, p]) => (
        <View key={d as string} style={[st.row, { justifyContent: 'space-between', paddingVertical: 7 }]}>
          <Text style={{ color: t.ink }}>{d} · {s}</Text><Text style={{ color: t.grey }}>{w} · {eur(p as number)}</Text>
        </View>
      )) : <Text style={{ color: t.grey }}>Aucun passage enregistré</Text>}
      <View style={{ height: 14 }} /><SoftButton label="Fermer" onPress={onClose} />
    </View>
  );
}

/** « Ajouter un RDV » : Une personne / Plusieurs personnes, heure touchée présélectionnée (« Continuer à HH:MM »).
 *  « Forcer le RDV » seulement si l'heure touchée tombe dans un trou trop court pour la prestation (règle du web). */
function AddAppt({ barberId, time, items, onDone }: { barberId: string; time: number; items: Item[]; onDone: (a: Appt) => void }) {
  const { t } = useT();
  const [mode, setMode] = useState<'one' | 'group'>('one');
  const [client, setClient] = useState('');
  const [svc, setSvc] = useState(SERVICES[0].id);
  const [bid, setBid] = useState(barberId);
  const [start, setStart] = useState(time);
  const service = SERVICES.find((x) => x.id === svc)!;
  const sugg = client.trim().length >= 2 ? CLIENTS_LIST.filter((c) => c.name.toLowerCase().includes(client.trim().toLowerCase())).slice(0, 3) : [];
  const clash = items.find((i) => i.barberId === bid && i.st !== 'absent' && start < i.end && i.start < start + service.minutes);
  const startsFree = !items.some((i) => i.barberId === bid && i.st !== 'absent' && start >= i.start && start < i.end);
  const canForce = !!clash && startsFree && clash.start > start;
  const make = (forced: boolean) => onDone({ id: 'n' + Date.now(), barberId: bid, client: client || 'Nouveau client', service: service.name, start, minutes: service.minutes, priceCents: service.priceCents, online: false, forcedBy: forced ? STAFF.find((s) => s.id === bid)!.name : undefined });
  return (
    <View>
      <Segmented value={mode} onChange={setMode} items={[{ key: 'one', label: 'Une personne' }, { key: 'group', label: 'Plusieurs personnes' }]} />
      <Text style={st.lbl(t)}>Client</Text>
      <TextInput value={client} onChangeText={setClient} placeholder="Nom ou téléphone du client" placeholderTextColor={t.grey} style={[st.input, { backgroundColor: t.fill, color: t.ink }]} />
      {sugg.map((c) => (
        <Pressable key={c.name} onPress={() => setClient(c.name)} style={[st.row, { paddingVertical: 8 }]}>
          <Ionicons name="person-circle-outline" size={20} color={t.blue} /><Text style={{ color: t.ink, flex: 1 }}>{c.name}</Text><Text style={{ color: t.grey, fontSize: 12.5 }}>{c.phone}</Text>
        </Pressable>
      ))}
      <Text style={st.lbl(t)}>Prestation</Text>
      <View style={st.wrap}>
        {SERVICES.map((x) => (
          <Pressable key={x.id} onPress={() => setSvc(x.id)} style={{ paddingHorizontal: 12, paddingVertical: 9, borderRadius: 10, backgroundColor: x.id === svc ? t.blue : t.fill }}>
            <Text style={{ color: x.id === svc ? '#fff' : t.ink, fontWeight: '600' }}>{x.name} · {x.minutes} min</Text>
          </Pressable>
        ))}
      </View>
      <Text style={st.lbl(t)}>Coiffeur</Text>
      <View style={st.wrap}>
        {STAFF.map((s) => (
          <Pressable key={s.id} onPress={() => setBid(s.id)} style={[st.row, { gap: 6, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 99, backgroundColor: s.id === bid ? t.blueSoft : t.fill, borderWidth: 1.5, borderColor: s.id === bid ? t.blue : 'transparent' }]}>
            <Avatar initials={s.initials} color={s.color} size={22} /><Text style={{ color: t.ink, fontWeight: '600' }}>{s.name}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={st.lbl(t)}>Heure</Text>
      <View style={[st.row, { gap: 8 }]}>
        {[-15, -5, 0, 5, 15].map((d) => {
          const m = start + d; const on = d === 0;
          return (
            <Pressable key={d} onPress={() => setStart(m)} style={{ flex: 1, paddingVertical: 11, borderRadius: 12, alignItems: 'center', backgroundColor: on ? t.blue : t.fill }}>
              <Text style={{ color: on ? '#fff' : t.ink, fontWeight: '700', fontSize: 13.5 }}>{hm(m)}</Text>
            </Pressable>
          );
        })}
      </View>
      {mode === 'group' ? <Text style={{ color: t.grey, marginTop: 12, fontSize: 13 }}>Plusieurs personnes : on ajoute ensuite chaque personne, « À la suite de » (même coiffeur) ou « En même temps que » (autre coiffeur).</Text> : null}
      {clash ? (
        <View style={{ marginTop: 14, backgroundColor: 'rgba(255,159,10,.14)', borderRadius: 12, padding: 12 }}>
          <Text style={{ color: '#b35a00', fontWeight: '700' }}>{canForce ? `Libre jusqu'à ${hm(clash.start)} seulement` : `Occupé : ${clash.client} à ${hm(clash.start)}`}</Text>
          <Text style={{ color: t.ink, fontSize: 13, marginTop: 2 }}>{canForce ? `${service.name} dure ${service.minutes} min : il chevaucherait le RDV de ${clash.client}.` : 'Choisissez une autre heure ou un autre coiffeur.'}</Text>
        </View>
      ) : null}
      <View style={{ height: 16 }} />
      {canForce ? (
        <Pressable onPress={() => make(true)} style={{ backgroundColor: '#b35a00', borderRadius: 16, paddingVertical: 15, alignItems: 'center' }}><Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>⚠ Forcer le RDV à {hm(start)}</Text></Pressable>
      ) : (
        <Go label={`Continuer à ${hm(start)}`} disabled={!!clash} onPress={() => make(false)} />
      )}
    </View>
  );
}

const base = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  panel: { borderRadius: 20, padding: 14 },
  navBtn: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  today: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, paddingHorizontal: 12, marginTop: 12 },
  banner: { borderRadius: 14, padding: 12, marginTop: 12 },
  addRdv: { borderRadius: 99, paddingHorizontal: 14, paddingVertical: 8 },
  movedBadge: { borderRadius: 99, paddingHorizontal: 10, paddingVertical: 6 },
  restore: { borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8 },
  block: { position: 'absolute', borderLeftWidth: 4, borderRadius: 8, overflow: 'hidden' },
  pause: { position: 'absolute', left: 2, right: 2, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  free: { position: 'absolute', left: 2, right: 2, borderRadius: 8, borderWidth: 1, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  colOff: { position: 'absolute', left: 8, right: 8, top: 40, borderRadius: 12, padding: 14, alignItems: 'center' },
  nudges: { position: 'absolute', right: 4, bottom: 3, flexDirection: 'row', gap: 4 },
  nudge: { backgroundColor: '#fff', borderRadius: 99, paddingHorizontal: 7, paddingVertical: 3, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 2 },
  nudgeTxt: { color: '#111', fontSize: 10.5, fontWeight: '800' },
  toast: { position: 'absolute', left: 14, right: 14, bottom: 12, borderRadius: 14, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  input: { borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16 },
});
const st = { ...base, lbl: (t: { grey: string }) => ({ color: t.grey, marginTop: 14, marginBottom: 6, fontWeight: '600' as const }) };
