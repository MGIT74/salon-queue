// MAQUETTE — agenda du jour, partagé par « Mon poste » et le dashboard (comme sur le web, où l'agenda admin
// est une copie de celui du poste) : navigation de date, Jour / Semaine / Mois, « La journée en un coup d'œil »,
// frise par coiffeur, puis les rendez-vous sur une grille horaire. Toucher une heure libre = « + RDV » à cette heure.
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { APPTS, Appt, DAY_END, DAY_START, SERVICES, STAFF, Staff, eur, hm } from './data';
import { Avatar, Bubbles, Go, Pill, Segmented, Sheet, SoftButton, useT } from './ui';

const PX_PER_MIN = 1.5;

export function Agenda({ meId, showAll }: { meId?: string; showAll?: boolean }) {
  const { t } = useT();
  const [view, setView] = useState<'day' | 'week' | 'month'>('day');
  const [offset, setOffset] = useState(0);
  const [who, setWho] = useState<string>(meId ?? STAFF[0].id);
  const [glance, setGlance] = useState(true);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<Appt | null>(null);
  const [adding, setAdding] = useState<{ time: number } | null>(null);
  const [extra, setExtra] = useState<Appt[]>([]);

  const date = useMemo(() => { const d = new Date(); d.setDate(d.getDate() + offset); return d; }, [offset]);
  const label = date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  const all = [...APPTS, ...extra];
  const appts = offset === 0 ? all : all.filter((a) => (a.start + offset * 37) % 3 !== 0);
  const mine = appts.filter((a) => a.barberId === who).sort((a, b) => a.start - b.start);
  const people = showAll ? STAFF : STAFF.filter((s) => s.id === meId);
  const found = q.trim() ? appts.filter((a) => a.client.toLowerCase().includes(q.trim().toLowerCase())) : [];

  return (
    <ScrollView contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 30 }}>
      {showAll ? <View style={{ marginBottom: 14 }}><Bubbles people={STAFF} value={who} onChange={setWho} size={40} /></View> : null}

      <View style={[st.panel, { backgroundColor: t.card }]}>
        <View style={st.row}>
          <Pressable onPress={() => setOffset(offset - 1)} style={[st.navBtn, { backgroundColor: t.fill }]}><Ionicons name="chevron-back" size={20} color={t.ink} /></Pressable>
          <Text style={{ flex: 1, textAlign: 'center', color: t.ink, fontSize: 17, fontWeight: '700', textTransform: 'capitalize' }}>{label}</Text>
          <Pressable onPress={() => setOffset(offset + 1)} style={[st.navBtn, { backgroundColor: t.fill }]}><Ionicons name="chevron-forward" size={20} color={t.ink} /></Pressable>
        </View>
        <View style={[st.row, { marginTop: 12 }]}>
          <Pressable onPress={() => setOffset(0)} style={[st.today, { borderColor: t.sep, backgroundColor: offset === 0 ? t.fill : t.card }]}>
            <Text style={{ color: t.ink, fontWeight: '600' }}>Aujourd'hui</Text>
          </Pressable>
          <Segmented style={{ flex: 1 }} value={view} onChange={setView} items={[{ key: 'day', label: 'Jour' }, { key: 'week', label: 'Semaine' }, { key: 'month', label: 'Mois' }]} />
        </View>
      </View>

      {view !== 'day' ? (
        <View style={[st.panel, { backgroundColor: t.card, marginTop: 12, alignItems: 'center', paddingVertical: 30 }]}>
          <Ionicons name="calendar-outline" size={34} color={t.grey} />
          <Text style={{ color: t.grey, marginTop: 8, textAlign: 'center' }}>Vue {view === 'week' ? 'semaine' : 'mois'} : même grille que le web, à affiner dans la version finale.</Text>
          <Pressable onPress={() => setView('day')} style={{ marginTop: 10 }}><Text style={{ color: t.blue, fontWeight: '600' }}>Revenir à la vue Jour</Text></Pressable>
        </View>
      ) : (
        <>
          <View style={[st.panel, { backgroundColor: t.fill, marginTop: 12 }]}>
            <Pressable onPress={() => setGlance(!glance)} style={[st.row, { justifyContent: 'space-between' }]}>
              <View style={[st.row, { gap: 6 }]}>
                <Text style={{ color: t.ink, fontWeight: '700', fontSize: 15 }}>La journée en un coup d'œil</Text>
                <Ionicons name={glance ? 'chevron-up' : 'chevron-down'} size={16} color={t.grey} />
              </View>
              <Text style={{ color: t.blue, fontWeight: '600' }}>{glance ? 'Replier' : 'Déplier'}</Text>
            </Pressable>
            {glance ? (
              <>
                <View style={[st.search, { backgroundColor: t.card }]}>
                  <Ionicons name="search" size={17} color={t.grey} />
                  <TextInput value={q} onChangeText={setQ} placeholder="Rechercher un client…" placeholderTextColor={t.grey} style={{ flex: 1, color: t.ink, fontSize: 15, paddingVertical: 10 }} />
                </View>
                {found.map((a) => (
                  <Pressable key={a.id} onPress={() => { setWho(a.barberId); setOpen(a); }} style={[st.row, { paddingVertical: 6 }]}>
                    <Ionicons name="person-outline" size={16} color={t.blue} />
                    <Text style={{ color: t.ink }}>{a.client} · {hm(a.start)} · {STAFF.find((s) => s.id === a.barberId)?.name}</Text>
                  </Pressable>
                ))}
                {(showAll ? STAFF : people).map((s) => <GlanceRow key={s.id} staff={s} appts={appts.filter((a) => a.barberId === s.id)} on={s.id === who} onPress={() => setWho(s.id)} />)}
                <View style={[st.row, { justifyContent: 'space-between', marginLeft: 40, marginTop: 4 }]}>
                  {['09:00', '12:00', '15:00', '18:00'].map((h) => <Text key={h} style={{ color: t.grey, fontSize: 11 }}>{h}</Text>)}
                </View>
              </>
            ) : null}
          </View>

          <View style={[st.panel, { backgroundColor: t.card, marginTop: 12, paddingHorizontal: 10 }]}>
            <View style={[st.row, { justifyContent: 'space-between', paddingHorizontal: 6, marginBottom: 8 }]}>
              <View style={[st.row, { gap: 8 }]}>
                <Avatar initials={STAFF.find((s) => s.id === who)!.initials} color={STAFF.find((s) => s.id === who)!.color} size={28} />
                <Text style={{ color: t.ink, fontWeight: '700' }}>{STAFF.find((s) => s.id === who)!.name}{who === meId ? ' · moi' : ''}</Text>
              </View>
              <Text style={{ color: t.grey, fontSize: 13 }}>{mine.length} RDV ce jour</Text>
              <Pressable onPress={() => setAdding({ time: 15 * 60 })} style={[st.addRdv, { backgroundColor: t.blue }]}>
                <Text style={{ color: '#fff', fontWeight: '700' }}>+ RDV</Text>
              </Pressable>
            </View>
            <Timeline appts={mine} color={STAFF.find((s) => s.id === who)!.color} onOpen={setOpen} onEmpty={(time) => setAdding({ time })} />
          </View>
        </>
      )}

      <Sheet visible={!!open} onClose={() => setOpen(null)} title={open?.client}>
        {open ? <ApptDetail appt={open} onClose={() => setOpen(null)} /> : null}
      </Sheet>
      <Sheet visible={!!adding} onClose={() => setAdding(null)} title="Ajouter un rendez-vous">
        {adding ? (
          <AddAppt time={adding.time} barber={STAFF.find((s) => s.id === who)!} onDone={(a) => { setExtra((x) => [...x, a]); setAdding(null); }} />
        ) : null}
      </Sheet>
    </ScrollView>
  );
}

function GlanceRow({ staff, appts, on, onPress }: { staff: Staff; appts: Appt[]; on: boolean; onPress: () => void }) {
  const { t } = useT();
  const span = DAY_END - DAY_START;
  return (
    <Pressable onPress={onPress} style={[st.row, { marginTop: 8 }]}>
      <View style={{ padding: 2, borderRadius: 99, borderWidth: 2, borderColor: on ? t.blue : 'transparent' }}><Avatar initials={staff.initials} color={staff.color} size={24} /></View>
      <View style={{ flex: 1, height: 22, borderRadius: 8, backgroundColor: t.card, overflow: 'hidden' }}>
        {appts.length === 0 ? <Text style={{ color: t.grey, fontSize: 12, textAlign: 'center', marginTop: 3 }}>Aucun RDV</Text> : null}
        {appts.map((a) => (
          <View key={a.id} style={{ position: 'absolute', top: 4, bottom: 4, borderRadius: 4, backgroundColor: staff.color, opacity: 0.85,
            left: `${((a.start - DAY_START) / span) * 100}%`, width: `${(a.minutes / span) * 100}%` }} />
        ))}
      </View>
    </Pressable>
  );
}

function Timeline({ appts, color, onOpen, onEmpty }: { appts: Appt[]; color: string; onOpen: (a: Appt) => void; onEmpty: (time: number) => void }) {
  const { t } = useT();
  const hours: number[] = [];
  for (let m = DAY_START; m < DAY_END; m += 30) hours.push(m);
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
  return (
    <View style={{ height: (DAY_END - DAY_START) * PX_PER_MIN, marginLeft: 48 }}>
      {hours.map((m) => (
        <Pressable key={m} onPress={() => onEmpty(m)} style={{ position: 'absolute', left: -48, right: 0, top: (m - DAY_START) * PX_PER_MIN, height: 30 * PX_PER_MIN }}>
          <View style={[st.row, { gap: 6 }]}>
            <Text style={{ width: 42, color: t.grey, fontSize: m % 60 === 0 ? 12.5 : 10.5, textAlign: 'right' }}>{hm(m)}</Text>
            <View style={{ flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: t.sep, opacity: m % 60 === 0 ? 1 : 0.5 }} />
          </View>
        </Pressable>
      ))}
      {nowMin > DAY_START && nowMin < DAY_END ? (
        <View pointerEvents="none" style={{ position: 'absolute', left: -6, right: 0, top: (nowMin - DAY_START) * PX_PER_MIN, flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: t.red }} />
          <View style={{ flex: 1, height: 2, backgroundColor: t.red }} />
        </View>
      ) : null}
      {appts.map((a) => (
        <Pressable key={a.id} onPress={() => onOpen(a)}
          style={({ pressed }) => [st.block, { top: (a.start - DAY_START) * PX_PER_MIN + 8, height: a.minutes * PX_PER_MIN - 2, backgroundColor: color + '22', borderColor: color, opacity: pressed ? 0.8 : 1 }]}>
          <View style={[st.row, { gap: 6 }]}>
            <Text style={{ color: t.ink, fontWeight: '700', fontSize: 13.5 }} numberOfLines={1}>{a.client}</Text>
            {a.prepaid ? <Ionicons name="checkmark-circle" size={14} color={t.green} /> : null}
            {a.online ? <Ionicons name="globe-outline" size={13} color={t.grey} /> : null}
          </View>
          {a.minutes >= 25 ? <Text style={{ color: t.grey, fontSize: 12 }} numberOfLines={1}>{hm(a.start)} · {a.service}</Text> : null}
        </Pressable>
      ))}
    </View>
  );
}

function ApptDetail({ appt, onClose }: { appt: Appt; onClose: () => void }) {
  const { t } = useT();
  const b = STAFF.find((s) => s.id === appt.barberId)!;
  const rows: [string, string][] = [
    ['Heure', `${hm(appt.start)} – ${hm(appt.start + appt.minutes)}`],
    ['Prestation', appt.service],
    ['Coiffeur', b.name],
    ['Prix', eur(appt.priceCents)],
    ['Réservé', appt.online ? 'En ligne' : 'Au salon'],
  ];
  return (
    <View>
      <View style={{ alignItems: 'center', gap: 6, marginBottom: 10 }}>
        {appt.prepaid ? <Pill label="✓ Payé d'avance" tone="green" /> : <Pill label="À encaisser" tone="grey" />}
      </View>
      {rows.map(([k, v]) => (
        <View key={k} style={[st.row, { justifyContent: 'space-between', paddingVertical: 11, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: t.sep }]}>
          <Text style={{ color: t.grey }}>{k}</Text><Text style={{ color: t.ink, fontWeight: '600' }}>{v}</Text>
        </View>
      ))}
      <View style={{ height: 16 }} />
      <Go label="Démarrer maintenant" icon="play" onPress={onClose} />
      <View style={[st.row, { gap: 10, marginTop: 10 }]}>
        <View style={{ flex: 1 }}><SoftButton label="Déplacer" onPress={onClose} /></View>
        <View style={{ flex: 1 }}><SoftButton label="Fiche client" onPress={onClose} /></View>
        <View style={{ flex: 1 }}><SoftButton label="Annuler" danger onPress={onClose} /></View>
      </View>
    </View>
  );
}

/** « Ajouter un RDV » : même fenêtre qu'admin / poste / caisse (Une personne / Plusieurs personnes). */
function AddAppt({ time, barber, onDone }: { time: number; barber: Staff; onDone: (a: Appt) => void }) {
  const { t } = useT();
  const [mode, setMode] = useState<'one' | 'group'>('one');
  const [client, setClient] = useState('');
  const [svc, setSvc] = useState(SERVICES[0].id);
  const [start, setStart] = useState(time);
  const service = SERVICES.find((x) => x.id === svc)!;
  return (
    <View>
      <Segmented value={mode} onChange={setMode} items={[{ key: 'one', label: 'Une personne' }, { key: 'group', label: 'Plusieurs personnes' }]} />
      <Text style={{ color: t.grey, marginTop: 16, marginBottom: 6 }}>Client</Text>
      <TextInput value={client} onChangeText={setClient} placeholder="Nom ou téléphone du client" placeholderTextColor={t.grey}
        style={{ backgroundColor: t.fill, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, color: t.ink, fontSize: 16 }} />
      <Text style={{ color: t.grey, marginTop: 14, marginBottom: 6 }}>Prestation</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {SERVICES.map((x) => (
          <Pressable key={x.id} onPress={() => setSvc(x.id)} style={{ paddingHorizontal: 12, paddingVertical: 9, borderRadius: 10, backgroundColor: x.id === svc ? t.blue : t.fill }}>
            <Text style={{ color: x.id === svc ? '#fff' : t.ink, fontWeight: '600' }}>{x.name}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={{ color: t.grey, marginTop: 14, marginBottom: 6 }}>Heure · avec {barber.name}</Text>
      <View style={[st.row, { gap: 8 }]}>
        {[-30, 0, 30, 60].map((d) => {
          const m = start + d;
          const on = d === 0;
          return (
            <Pressable key={d} onPress={() => setStart(m)} style={{ flex: 1, paddingVertical: 11, borderRadius: 12, alignItems: 'center', backgroundColor: on ? t.blue : t.fill }}>
              <Text style={{ color: on ? '#fff' : t.ink, fontWeight: '700' }}>{hm(m)}</Text>
            </Pressable>
          );
        })}
      </View>
      {mode === 'group' ? <Text style={{ color: t.grey, marginTop: 12, fontSize: 13 }}>Plusieurs personnes : on ajoute ensuite chaque personne, « À la suite » ou « En même temps », comme sur le web.</Text> : null}
      <View style={{ height: 18 }} />
      <Go label={`Continuer à ${hm(start)}`} onPress={() => onDone({ id: 'n' + Date.now(), barberId: barber.id, client: client || 'Nouveau client', service: service.name, start, minutes: service.minutes, priceCents: service.priceCents, online: false })} />
    </View>
  );
}

const st = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  panel: { borderRadius: 20, padding: 14 },
  navBtn: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  today: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, paddingHorizontal: 12, marginTop: 12 },
  addRdv: { borderRadius: 99, paddingHorizontal: 14, paddingVertical: 8 },
  block: { position: 'absolute', left: 2, right: 2, borderLeftWidth: 4, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, overflow: 'hidden' },
});
