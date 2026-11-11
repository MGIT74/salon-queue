// MAQUETTE — « Mon poste » (poste.html) : code PIN puis Timer / Agenda / Déconnexion.
// Le chrono tourne sur le téléphone ; dans l'app finale la file ne se recharge que quand le serveur signale un changement.
import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Agenda } from './Agenda';
import { EXTRAS, NOW_MIN, QUEUE_ITEMS, QueueItem, STAFF, Salon, WALKIN_TODAY, eur, hm } from './data';
import { Card, Pill, PinPad, Sheet, SoftButton, TabBar, ThemeButton, useT } from './ui';

export function StaffHeader({ salon, name, right }: { salon: Salon; name: string; right?: React.ReactNode }) {
  const { t } = useT();
  return (
    <View style={[st.row, { paddingHorizontal: 18, paddingTop: 6, paddingBottom: 12 }]}>
      <View style={{ flex: 1 }}>
        <Text style={{ color: t.grey, fontSize: 12.5, fontWeight: '700', letterSpacing: 0.6 }}>{(salon.name + ' ' + salon.city).toUpperCase()}</Text>
        <View style={[st.row, { gap: 8 }]}>
          <Text style={{ color: t.ink, fontSize: 26, fontWeight: '700' }}>{name}</Text>
          {/* Étiquette du mode du coiffeur ce jour-là, comme barberModeTagHtml du web. */}
          {WALKIN_TODAY.includes(name) ? <Pill label="Sans RDV" icon="walk-outline" tone="grey" /> : <Pill label="RDV" icon="calendar-outline" />}
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

/** Démarrage anticipé : un RDV peut être démarré au plus tôt 10 min avant son heure (réglage du web) ;
 *  s'il est oublié, le serveur le démarre tout seul à l'heure prévue. */
const EARLY_MIN = 10;
const toMin = (h: string) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5));

export function TimerTab({ staffId }: { staffId: string }) {
  const { t } = useT();
  const [items, setItems] = useState<QueueItem[]>(() => QUEUE_ITEMS.filter((q) => q.barberId === staffId));
  const [startedAt, setStartedAt] = useState(() => Date.now() - 18 * 60000);
  const [taken, setTaken] = useState(false);   // « Je prends » : pris sans lancer le timer
  const [now, setNow] = useState(Date.now());
  const [note, setNote] = useState('');
  const [nextNote, setNextNote] = useState('');
  const [nextSaved, setNextSaved] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [extraSheet, setExtraSheet] = useState(false);
  const [added, setAdded] = useState<string[]>([]);
  const [cancelOf, setCancelOf] = useState<QueueItem | null>(null);
  const [colleagueOf, setColleagueOf] = useState<QueueItem | null>(null);
  const [editOf, setEditOf] = useState<QueueItem | null>(null);
  // Avertissement « un collègue a pris votre client » (exemple : Tom a pris Karim pendant que Marco était occupé).
  const [takenNotice, setTakenNotice] = useState<string | null>(staffId === 'marco' ? 'Tom a pris votre client Ahmed (il était le suivant).' : null);
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, []);
  useEffect(() => { if (!toast) return; const id = setTimeout(() => setToast(null), 2800); return () => clearTimeout(id); }, [toast]);

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
    setNote(''); setAdded([]); setTaken(false);
  };
  const start = (id: string, withTimer: boolean) => {
    setItems((l) => l.map((q) => (q.id === id ? { ...q, status: 'in_progress' } : q)));
    setStartedAt(Date.now()); setTaken(!withTimer); setNextSaved(false);
    if (nextNote) setNote(nextNote); setNextNote('');
  };
  const remove = (id: string, msg: string) => { setItems((l) => l.filter((x) => x.id !== id)); setToast(msg); };

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 30 }}>
        {takenNotice ? (
          <View style={[st.notice, { backgroundColor: 'rgba(255,159,10,.14)' }]}>
            <Ionicons name="swap-horizontal" size={20} color={t.orange} />
            <Text style={{ color: t.ink, flex: 1 }}>{takenNotice}</Text>
            <Pressable onPress={() => setTakenNotice(null)} hitSlop={8}><Text style={{ color: t.blue, fontWeight: '700' }}>OK</Text></Pressable>
          </View>
        ) : null}
        {current ? (
          <Card style={{ padding: 20, alignItems: 'center' }}>
            <Text style={{ color: t.ink, fontSize: 22, fontWeight: '700' }}>{current.kind === 'Sans RDV' ? '🚶 ' : ''}{current.client}</Text>
            <View style={{ marginTop: 6 }}><Pill label={current.service + (added.length ? ` + ${added.length}` : '')} /></View>
            {taken ? (
              <>
                <Text style={{ color: t.ink, fontSize: 30, fontWeight: '800', marginTop: 12 }}>Pris sans timer</Text>
                <Text style={{ color: t.grey, fontSize: 14 }}>« Je prends » · prévu {current.minutes} min · {eur(current.priceCents + extraCents)}</Text>
              </>
            ) : (
              <>
                <Text style={{ color: over ? t.orange : t.green, fontSize: 56, fontWeight: '800', fontVariant: ['tabular-nums'], marginTop: 8 }}>{clock}</Text>
                <Text style={{ color: t.grey, fontSize: 14 }}>{over ? 'Dépassement' : 'Temps restant'} · prévu {current.minutes} min · {eur(current.priceCents + extraCents)}</Text>
              </>
            )}
            <View style={{ alignSelf: 'stretch', marginTop: 16 }}><SoftButton label="Ajouter un supplément" onPress={() => setExtraSheet(true)} /></View>
            <Text style={{ alignSelf: 'flex-start', color: t.grey, fontWeight: '600', marginTop: 16, marginBottom: 6 }}>Note sur ce client</Text>
            <TextInput value={note} onChangeText={setNote} placeholder="Ex : préfère dégradé américain, allergie…" placeholderTextColor={t.grey} multiline
              style={{ alignSelf: 'stretch', backgroundColor: t.fill, borderRadius: 12, padding: 12, minHeight: 64, color: t.ink, fontSize: 15, textAlignVertical: 'top' }} />
            <View style={{ alignSelf: 'stretch', marginTop: 8 }}><SoftButton label="Enregistrer la note" onPress={() => setToast('Note enregistrée sur la fiche du client')} /></View>
            <Pressable onPress={finish} style={({ pressed }) => [st.finish, { backgroundColor: t.green, opacity: pressed ? 0.85 : 1 }]}>
              <Text style={{ color: '#fff', fontSize: 17, fontWeight: '700' }}>Terminer</Text>
            </Pressable>
          </Card>
        ) : (
          <Card style={{ alignItems: 'center', paddingVertical: 26 }}><Text style={{ color: t.grey }}>Aucune coupe en cours</Text></Card>
        )}

        <Text style={[st.section, { color: t.grey }]}>À SUIVRE</Text>
        {waiting.length === 0 ? (
          <Card style={{ alignItems: 'center', paddingVertical: 22 }}><Text style={{ color: t.grey }}>Personne en attente pour vous pour le moment</Text></Card>
        ) : waiting.map((q, i) => {
          const allowedAt = q.time ? toMin(q.time) - EARLY_MIN : 0;
          const tooEarly = q.kind === 'RDV' && !!q.time && NOW_MIN < allowedAt;
          return (
            <Card key={q.id} style={{ marginBottom: 10 }}>
              <View style={st.row}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: t.ink, fontSize: 17, fontWeight: '700' }}>{q.kind === 'Sans RDV' ? '🚶 ' : ''}{q.client}</Text>
                  <Text style={{ color: t.grey, fontSize: 14 }}>{q.service} · {eur(q.priceCents)}</Text>
                  <Text style={{ color: t.orange, fontSize: 13, marginTop: 2 }}>{q.time ? `RDV à ${q.time}` : 'En attente de son tour'}</Text>
                </View>
                <Pill label={q.kind === 'RDV' ? q.time ?? 'RDV' : 'Sans RDV'} tone={q.kind === 'RDV' ? 'blue' : 'grey'} />
              </View>
              {i === 0 && !current ? (
                <>
                  <View style={[st.row, { marginTop: 12, gap: 8 }]}>
                    <Pressable disabled={tooEarly} onPress={() => start(q.id, true)} style={({ pressed }) => [st.startBtn, { flex: 1, justifyContent: 'center', backgroundColor: t.blue, opacity: tooEarly ? 0.45 : pressed ? 0.85 : 1 }]}>
                      <Ionicons name="play" size={16} color="#fff" /><Text style={{ color: '#fff', fontWeight: '700' }}>Démarrer</Text>
                    </Pressable>
                    <Pressable onPress={() => start(q.id, false)} style={[st.startBtn, { flex: 1, justifyContent: 'center', backgroundColor: t.fill }]}>
                      <Text style={{ color: t.ink, fontWeight: '700' }}>Je prends</Text>
                    </Pressable>
                  </View>
                  {q.time ? <Text style={{ color: t.grey, fontSize: 12.5, marginTop: 6 }}>{tooEarly ? `Démarrage possible à ${hm(allowedAt)} (${EARLY_MIN} min avant). ` : ''}S'il est oublié, le timer démarre tout seul à {q.time}.</Text> : null}
                </>
              ) : null}
              {i === 0 ? (
                <View style={{ marginTop: 12 }}>
                  <Text style={{ color: t.grey, fontWeight: '600', marginBottom: 6 }}>Note sur le prochain client</Text>
                  <TextInput value={nextNote} onChangeText={(v) => { setNextNote(v); setNextSaved(false); }} placeholder="Visible quand vous le prenez" placeholderTextColor={t.grey}
                    style={{ backgroundColor: t.fill, borderRadius: 12, padding: 11, color: t.ink, fontSize: 15 }} />
                  {nextNote ? <Pressable onPress={() => setNextSaved(true)} style={{ marginTop: 6 }}><Text style={{ color: t.blue, fontWeight: '600' }}>{nextSaved ? '✓ Note enregistrée' : 'Enregistrer la note'}</Text></Pressable> : null}
                </View>
              ) : null}
              <View style={[st.row, { marginTop: 12, gap: 10, flexWrap: 'wrap' }]}>
                <View style={{ flex: 1, minWidth: 150 }}><SoftButton label="Modifier la prestation" onPress={() => setEditOf(q)} /></View>
                <Pressable onPress={() => setColleagueOf(q)} hitSlop={8}><Text style={{ color: t.blue, fontWeight: '600' }}>Pris par un collègue</Text></Pressable>
                <Pressable onPress={() => setCancelOf(q)} hitSlop={8}><Text style={{ color: t.grey, fontWeight: '600' }}>Annuler</Text></Pressable>
              </View>
            </Card>
          );
        })}
      </ScrollView>

      {toast ? <View style={[st.toast, { backgroundColor: t.ink }]}><Text style={{ color: t.bg, fontWeight: '600', textAlign: 'center' }}>{toast}</Text></View> : null}

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
      <Sheet visible={!!cancelOf} onClose={() => setCancelOf(null)} title={`Annuler ${cancelOf?.client ?? ''} ?`}>
        <Text style={{ color: t.grey, textAlign: 'center', marginBottom: 16 }}>Il est retiré de la file. Si vous l'avez déjà prévenu (au salon, par téléphone), il ne reçoit pas de SMS.</Text>
        <Pressable onPress={() => { if (cancelOf) remove(cancelOf.id, `${cancelOf.client} annulé · SMS envoyé au client`); setCancelOf(null); }} style={[st.dangerBtn, { backgroundColor: t.red }]}>
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>Annuler et prévenir le client</Text>
        </Pressable>
        <View style={{ height: 10 }} />
        <SoftButton label="Annuler — le client est déjà prévenu" onPress={() => { if (cancelOf) remove(cancelOf.id, `${cancelOf.client} annulé (déjà prévenu)`); setCancelOf(null); }} />
        <View style={{ height: 10 }} />
        <SoftButton label="Garder" onPress={() => setCancelOf(null)} />
      </Sheet>
      <Sheet visible={!!colleagueOf} onClose={() => setColleagueOf(null)} title="Pris par un collègue">
        <Text style={{ color: t.grey, textAlign: 'center', marginBottom: 12 }}>Qui s'occupe de {colleagueOf?.client} ? Il passe dans sa file.</Text>
        {STAFF.filter((s) => s.id !== staffId).map((s) => (
          <Pressable key={s.id} onPress={() => { if (colleagueOf) remove(colleagueOf.id, `${colleagueOf.client} pris par ${s.name}`); setColleagueOf(null); }}
            style={[st.row, { paddingVertical: 13, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: t.sep }]}>
            <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: s.color, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: '#fff', fontWeight: '700' }}>{s.initials}</Text></View>
            <Text style={{ color: t.ink, fontSize: 16, flex: 1 }}>{s.name}</Text>
          </Pressable>
        ))}
      </Sheet>
      <Sheet visible={!!editOf} onClose={() => setEditOf(null)} title="Modifier la prestation">
        {['Coupe', 'Coupe + barbe', 'Barbe', 'Coupe enfant'].map((n) => (
          <Pressable key={n} onPress={() => { setItems((l) => l.map((x) => (x.id === editOf?.id ? { ...x, service: n } : x))); setEditOf(null); setToast('Prestation modifiée'); }}
            style={[st.row, { paddingVertical: 13, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: t.sep }]}>
            <Ionicons name={editOf?.service === n ? 'radio-button-on' : 'radio-button-off'} size={20} color={editOf?.service === n ? t.blue : t.sep} />
            <Text style={{ color: t.ink, fontSize: 16 }}>{n}</Text>
          </Pressable>
        ))}
      </Sheet>
    </View>
  );
}

const st = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  section: { fontSize: 13, fontWeight: '700', letterSpacing: 0.5, marginTop: 22, marginBottom: 8, marginLeft: 2 },
  finish: { alignSelf: 'stretch', borderRadius: 16, paddingVertical: 15, alignItems: 'center', marginTop: 16 },
  startBtn: { flexDirection: 'row', gap: 6, alignItems: 'center', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11 },
  notice: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 14, padding: 12, marginBottom: 12 },
  dangerBtn: { borderRadius: 16, paddingVertical: 15, alignItems: 'center' },
  toast: { position: 'absolute', left: 18, right: 18, bottom: 14, borderRadius: 14, padding: 14 },
});
