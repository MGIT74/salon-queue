// MAQUETTE — « Mon poste » (poste.html) : code PIN puis Timer / Agenda / Déconnexion.
// Le chrono tourne sur le téléphone ; dans l'app finale la file ne se recharge que quand le serveur signale un changement.
import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Agenda } from './Agenda';
import { EXTRAS, QUEUE_ITEMS, QueueItem, STAFF, Salon, eur } from './data';
import { Card, Pill, PinPad, Sheet, SoftButton, TabBar, ThemeButton, useT } from './ui';

export function StaffHeader({ salon, name, right }: { salon: Salon; name: string; right?: React.ReactNode }) {
  const { t } = useT();
  return (
    <View style={[st.row, { paddingHorizontal: 18, paddingTop: 6, paddingBottom: 12 }]}>
      <View style={{ flex: 1 }}>
        <Text style={{ color: t.grey, fontSize: 12.5, fontWeight: '700', letterSpacing: 0.6 }}>{(salon.name + ' ' + salon.city).toUpperCase()}</Text>
        <View style={[st.row, { gap: 8 }]}>
          <Text style={{ color: t.ink, fontSize: 26, fontWeight: '700' }}>{name}</Text>
          <Pill label="RDV" icon="calendar-outline" />
        </View>
      </View>
      {right}
      <ThemeButton />
    </View>
  );
}

export function PinScreen({ salon, title, onOk, onBack }: { salon: Salon; title: string; onOk: (staffId: string) => void; onBack: () => void }) {
  const { t } = useT();
  const [err, setErr] = useState<string | undefined>();
  return (
    <View style={{ flex: 1 }}>
      <View style={[st.row, { paddingHorizontal: 18, justifyContent: 'space-between' }]}>
        <Pressable onPress={onBack} hitSlop={10} style={st.row}><Ionicons name="chevron-back" size={18} color={t.blue} /><Text style={{ color: t.blue, fontSize: 15 }}>Retour</Text></Pressable>
        <ThemeButton />
      </View>
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <Text style={{ color: t.grey, fontSize: 13, fontWeight: '600', letterSpacing: 0.6, textAlign: 'center', marginBottom: 6 }}>{(salon.name + ' ' + salon.city).toUpperCase()}</Text>
        <PinPad title={title} sub={`Code PIN du coiffeur · maquette : ${STAFF.map((s) => `${s.name} ${s.pin}`).join(', ')}`} error={err}
          onDone={(pin) => { const s = STAFF.find((x) => x.pin === pin); if (s) { setErr(undefined); onOk(s.id); } else setErr('Code incorrect'); }} />
      </View>
    </View>
  );
}

type PTab = 'timer' | 'agenda' | 'logout';

export function PosteApp({ salon, staffId, onExit }: { salon: Salon; staffId: string; onExit: () => void }) {
  const insets = useSafeAreaInsets();
  const me = STAFF.find((s) => s.id === staffId)!;
  const [tab, setTab] = useState<PTab>('timer');
  return (
    <View style={{ flex: 1 }}>
      <StaffHeader salon={salon} name={me.name} />
      <View style={{ flex: 1 }}>
        {tab === 'timer' ? <TimerTab staffId={staffId} /> : <Agenda meId={staffId} />}
      </View>
      <TabBar<PTab> bottomInset={insets.bottom} active={tab} onChange={(k) => (k === 'logout' ? onExit() : setTab(k))}
        tabs={[{ key: 'timer', label: 'Timer', icon: 'time-outline' }, { key: 'agenda', label: 'Agenda', icon: 'calendar-outline' }, { key: 'logout', label: 'Déconnexion', icon: 'log-out-outline' }]} />
    </View>
  );
}

export function TimerTab({ staffId }: { staffId: string }) {
  const { t } = useT();
  const [items, setItems] = useState<QueueItem[]>(() => QUEUE_ITEMS.filter((q) => q.barberId === staffId));
  const [startedAt, setStartedAt] = useState(() => Date.now() - 18 * 60000);
  const [now, setNow] = useState(Date.now());
  const [note, setNote] = useState('');
  const [toast, setToast] = useState<string | null>(null);
  const [extraSheet, setExtraSheet] = useState(false);
  const [added, setAdded] = useState<string[]>([]);
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, []);
  useEffect(() => { if (!toast) return; const id = setTimeout(() => setToast(null), 2600); return () => clearTimeout(id); }, [toast]);

  const current = items.find((q) => q.status === 'in_progress');
  const waiting = items.filter((q) => q.status === 'waiting');
  const extraCents = EXTRAS.filter((e) => added.includes(e.id)).reduce((a, e) => a + e.priceCents, 0);
  const left = current ? current.minutes * 60 - Math.floor((now - startedAt) / 1000) : 0;
  const over = left < 0;
  const abs = Math.abs(left);
  const clock = `${over ? '+' : ''}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;

  const finish = () => {
    if (!current) return;
    setItems((l) => l.map((q) => (q.id === current.id ? { ...q, status: 'done' } : q)));
    setToast(`${current.client} terminé · à encaisser en caisse (${eur(current.priceCents + extraCents)})`);
    setNote(''); setAdded([]);
  };
  const start = (id: string) => { setItems((l) => l.map((q) => (q.id === id ? { ...q, status: 'in_progress' } : q))); setStartedAt(Date.now()); };

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 30 }}>
        {current ? (
          <Card style={{ padding: 20, alignItems: 'center' }}>
            <Text style={{ color: t.ink, fontSize: 22, fontWeight: '700' }}>{current.kind === 'Sans RDV' ? '🚶 ' : ''}{current.client}</Text>
            <View style={{ marginTop: 6 }}><Pill label={current.service + (added.length ? ` + ${added.length}` : '')} /></View>
            <Text style={{ color: over ? t.orange : t.green, fontSize: 56, fontWeight: '800', fontVariant: ['tabular-nums'], marginTop: 8 }}>{clock}</Text>
            <Text style={{ color: t.grey, fontSize: 14 }}>{over ? 'Dépassement' : 'Temps restant'} · prévu {current.minutes} min · {eur(current.priceCents + extraCents)}</Text>
            <View style={{ alignSelf: 'stretch', marginTop: 16 }}><SoftButton label="Ajouter un supplément" onPress={() => setExtraSheet(true)} /></View>
            <Text style={{ alignSelf: 'flex-start', color: t.grey, fontWeight: '600', marginTop: 16, marginBottom: 6 }}>Note sur ce client</Text>
            <TextInput value={note} onChangeText={setNote} placeholder="Ex : préfère dégradé américain, allergie…" placeholderTextColor={t.grey} multiline
              style={{ alignSelf: 'stretch', backgroundColor: t.fill, borderRadius: 12, padding: 12, minHeight: 64, color: t.ink, fontSize: 15, textAlignVertical: 'top' }} />
            <Pressable onPress={finish} style={({ pressed }) => [st.finish, { backgroundColor: t.green, opacity: pressed ? 0.85 : 1 }]}>
              <Text style={{ color: '#fff', fontSize: 17, fontWeight: '700' }}>Terminer</Text>
            </Pressable>
          </Card>
        ) : (
          <Card style={{ alignItems: 'center', paddingVertical: 26 }}>
            <Text style={{ color: t.grey }}>Aucune coupe en cours</Text>
          </Card>
        )}

        <Text style={[st.section, { color: t.grey }]}>À SUIVRE</Text>
        {waiting.length === 0 ? (
          <Card style={{ alignItems: 'center', paddingVertical: 22 }}><Text style={{ color: t.grey }}>Personne en attente pour vous pour le moment</Text></Card>
        ) : waiting.map((q, i) => (
          <Card key={q.id} style={{ marginBottom: 10 }}>
            <View style={st.row}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: t.ink, fontSize: 17, fontWeight: '700' }}>{q.kind === 'Sans RDV' ? '🚶 ' : ''}{q.client}</Text>
                <Text style={{ color: t.grey, fontSize: 14 }}>{q.service} · {eur(q.priceCents)}</Text>
                <Text style={{ color: t.orange, fontSize: 13, marginTop: 2 }}>{q.time ? `RDV à ${q.time}` : 'En attente de son tour'}</Text>
              </View>
              <Pill label={q.kind === 'RDV' ? q.time ?? 'RDV' : 'Sans RDV'} tone={q.kind === 'RDV' ? 'blue' : 'grey'} />
            </View>
            <View style={[st.row, { marginTop: 12, gap: 10 }]}>
              {i === 0 && !current ? (
                <Pressable onPress={() => start(q.id)} style={({ pressed }) => [st.startBtn, { backgroundColor: t.blue, opacity: pressed ? 0.85 : 1 }]}>
                  <Ionicons name="play" size={16} color="#fff" /><Text style={{ color: '#fff', fontWeight: '700' }}>Démarrer</Text>
                </Pressable>
              ) : null}
              <View style={{ flex: 1 }}><SoftButton label="Modifier la prestation" onPress={() => {}} /></View>
              <Pressable onPress={() => setItems((l) => l.filter((x) => x.id !== q.id))} hitSlop={8}><Text style={{ color: t.grey, fontWeight: '600' }}>Annuler</Text></Pressable>
            </View>
          </Card>
        ))}
      </ScrollView>

      {toast ? (
        <View style={[st.toast, { backgroundColor: t.ink }]}><Text style={{ color: t.bg, fontWeight: '600', textAlign: 'center' }}>{toast}</Text></View>
      ) : null}

      <Sheet visible={extraSheet} onClose={() => setExtraSheet(false)} title="Ajouter un supplément">
        {EXTRAS.map((e) => {
          const on = added.includes(e.id);
          return (
            <Pressable key={e.id} onPress={() => setAdded((a) => (on ? a.filter((x) => x !== e.id) : [...a, e.id]))}
              style={[st.row, { paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: t.sep }]}>
              <Ionicons name={on ? 'checkmark-circle' : 'add-circle-outline'} size={22} color={on ? t.blue : t.grey} />
              <Text style={{ color: t.ink, fontSize: 16, flex: 1 }}>{e.name}</Text>
              <Text style={{ color: t.grey }}>+{eur(e.priceCents)}</Text>
            </Pressable>
          );
        })}
        <View style={{ height: 14 }} />
        <SoftButton label="Fermer" onPress={() => setExtraSheet(false)} />
      </Sheet>
    </View>
  );
}

const st = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  section: { fontSize: 13, fontWeight: '700', letterSpacing: 0.5, marginTop: 22, marginBottom: 8, marginLeft: 2 },
  finish: { alignSelf: 'stretch', borderRadius: 16, paddingVertical: 15, alignItems: 'center', marginTop: 16 },
  startBtn: { flexDirection: 'row', gap: 6, alignItems: 'center', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11 },
  toast: { position: 'absolute', left: 18, right: 18, bottom: 14, borderRadius: 14, padding: 14 },
});
