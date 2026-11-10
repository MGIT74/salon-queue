// MAQUETTE — Caisse (caisse.html) : bulles des coiffeurs, catalogue Prestations / Suppléments / Produits,
// ticket en cours, encaissement Espèces / CB / Partager, passages « à encaisser », clôture et ticket Z.
// Aucun paiement réel : le TPE et l'imprimante sont simulés.
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Agenda } from './Agenda';
import { CATALOG, CatalogItem, PENDING_PAYMENTS, STAFF, Salon, TODAY_SALES, eur } from './data';
import { StaffHeader, TimerTab } from './Poste';
import { Bubbles, Card, Go, Pill, Segmented, Sheet, SoftButton, TabBar, useT } from './ui';

type CTab = 'agenda' | 'timer' | 'caisse' | 'cloture';
type Line = { item: CatalogItem; qty: number };

export function CaisseApp({ salon, staffId, onExit }: { salon: Salon; staffId: string; onExit: () => void }) {
  const { t } = useT();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<CTab>('caisse');
  const [acting, setActing] = useState(staffId);
  const [closed, setClosed] = useState(false);
  const me = STAFF.find((s) => s.id === acting)!;

  if (closed) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30 }}>
        <Ionicons name="lock-closed-outline" size={46} color={t.grey} />
        <Text style={{ color: t.ink, fontSize: 26, fontWeight: '700', marginTop: 12 }}>Caisse fermée</Text>
        <Text style={{ color: t.grey, fontSize: 15, textAlign: 'center', marginTop: 8 }}>Caisse fermée suite à la clôture. Réouverture demain à 09h00.</Text>
        <Pressable onPress={onExit} style={{ marginTop: 26 }}><Text style={{ color: t.blue, fontWeight: '600' }}>Retour à l'accueil de la maquette</Text></Pressable>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <StaffHeader salon={salon} name={me.name} right={
        <Pressable style={[st.round, { backgroundColor: t.fill, borderColor: t.sep }]}><Ionicons name="settings-outline" size={20} color={t.ink} /></Pressable>
      } />
      <View style={{ paddingHorizontal: 18, marginBottom: 12 }}><Bubbles people={STAFF} value={acting} onChange={setActing} size={42} /></View>
      <View style={{ flex: 1 }}>
        {tab === 'caisse' && <CaisseTab actingId={acting} />}
        {tab === 'agenda' && <Agenda meId={acting} showAll />}
        {tab === 'timer' && <TimerTab staffId={acting} key={acting} />}
        {tab === 'cloture' && <ClotureTab by={me.name} onClosed={() => setClosed(true)} />}
      </View>
      <TabBar<CTab> bottomInset={insets.bottom} active={tab} onChange={setTab}
        tabs={[
          { key: 'agenda', label: 'Agenda', icon: 'calendar-outline' },
          { key: 'timer', label: 'Timer', icon: 'time-outline' },
          { key: 'caisse', label: 'Caisse', icon: 'card-outline' },
          { key: 'cloture', label: 'Clôture', icon: 'lock-closed-outline' },
        ]} />
    </View>
  );
}

function CaisseTab({ actingId }: { actingId: string }) {
  const { t } = useT();
  const [cat, setCat] = useState<'svc' | 'extra' | 'product'>('svc');
  const [lines, setLines] = useState<Line[]>([]);
  const [client, setClient] = useState<string | null>(null);
  const [pending, setPending] = useState(PENDING_PAYMENTS);
  const [pay, setPay] = useState<null | 'cb' | 'cash' | 'split'>(null);
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => { if (!toast) return; const id = setTimeout(() => setToast(null), 2600); return () => clearTimeout(id); }, [toast]);

  const total = lines.reduce((a, l) => a + l.item.priceCents * l.qty, 0);
  const add = (item: CatalogItem) => setLines((ls) => {
    const f = ls.find((l) => l.item.id === item.id);
    return f ? ls.map((l) => (l.item.id === item.id ? { ...l, qty: l.qty + 1 } : l)) : [...ls, { item, qty: 1 }];
  });
  const setQty = (id: string, d: number) => setLines((ls) => ls.map((l) => (l.item.id === id ? { ...l, qty: l.qty + d } : l)).filter((l) => l.qty > 0));
  const loadPending = (p: (typeof PENDING_PAYMENTS)[number]) => {
    const item = CATALOG.find((c) => c.name === p.service) ?? CATALOG[1];
    setLines([{ item, qty: 1 }]); setClient(p.client);
  };
  const paid = (how: string) => {
    setToast(`Vente enregistrée · ${how} · ${eur(total)}`);
    if (client) setPending((l) => l.filter((x) => x.client !== client));
    setLines([]); setClient(null); setPay(null);
  };

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 30 }}>
        {pending.length ? (
          <>
            <Text style={[st.section, { color: t.grey }]}>À ENCAISSER</Text>
            {pending.map((p) => {
              const b = STAFF.find((s) => s.id === p.barberId)!;
              return (
                <Pressable key={p.id} onPress={() => loadPending(p)} style={[st.pending, { backgroundColor: t.card, borderColor: client === p.client ? t.blue : 'transparent' }]}>
                  <View style={[st.dot, { backgroundColor: b.color }]}><Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>{b.initials}</Text></View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: t.ink, fontWeight: '700', fontSize: 15 }}>{p.client}</Text>
                    <Text style={{ color: t.grey, fontSize: 13 }}>{p.service} · terminé il y a {p.ago}</Text>
                  </View>
                  <Text style={{ color: t.ink, fontWeight: '700' }}>{eur(p.priceCents)}</Text>
                </Pressable>
              );
            })}
          </>
        ) : null}

        <Segmented style={{ marginTop: 14 }} value={cat} onChange={setCat} items={[{ key: 'svc', label: 'Prestations' }, { key: 'extra', label: 'Suppléments' }, { key: 'product', label: 'Produits' }]} />
        <View style={st.grid}>
          {CATALOG.filter((c) => c.kind === cat).map((c) => {
            const inTicket = lines.find((l) => l.item.id === c.id);
            return (
              <Pressable key={c.id} onPress={() => add(c)} style={({ pressed }) => [st.item, { backgroundColor: t.fill, borderColor: inTicket ? t.blue : 'transparent', transform: [{ scale: pressed ? 0.97 : 1 }] }]}>
                <View style={[st.itemArt, { backgroundColor: t.blueSoft }]}><Text style={{ fontSize: 34 }}>{c.emoji}</Text></View>
                <View style={{ padding: 12 }}>
                  <Text style={{ color: t.ink, fontWeight: '600', fontSize: 15 }} numberOfLines={1}>{c.name}</Text>
                  <Text style={{ color: t.grey, fontSize: 13 }}>{c.minutes ? `${c.minutes} min` : c.stock !== undefined ? `${c.stock} en stock` : 'Supplément'}</Text>
                  <View style={[st.row, { justifyContent: 'space-between', marginTop: 10 }]}>
                    <Text style={{ color: t.ink, fontWeight: '700', fontSize: 16 }}>{eur(c.priceCents)}</Text>
                    <View style={[st.plus, { backgroundColor: inTicket ? t.blue : t.card, borderColor: t.blue }]}>
                      <Ionicons name={inTicket ? 'checkmark' : 'add'} size={18} color={inTicket ? '#fff' : t.blue} />
                    </View>
                  </View>
                </View>
              </Pressable>
            );
          })}
        </View>

        <Card style={{ marginTop: 16 }}>
          <View style={[st.row, { justifyContent: 'space-between' }]}>
            <Text style={{ color: t.ink, fontSize: 17, fontWeight: '700' }}>Ticket en cours{client ? ` · ${client}` : ''}</Text>
            <Ionicons name="time-outline" size={22} color={t.grey} />
          </View>
          {lines.length === 0 ? (
            <Text style={{ color: t.grey, textAlign: 'center', paddingVertical: 22 }}>Aucun article sélectionné</Text>
          ) : (
            <>
              {lines.map((l) => {
                const b = STAFF.find((s) => s.id === actingId)!;
                return (
                  <View key={l.item.id} style={[st.row, { paddingVertical: 10 }]}>
                    <View style={[st.dot, { backgroundColor: b.color, width: 22, height: 22 }]}><Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>{b.initials}</Text></View>
                    <Text style={{ color: t.ink, flex: 1, fontSize: 15 }}>{l.item.name}</Text>
                    <Pressable onPress={() => setQty(l.item.id, -1)} style={[st.qty, { backgroundColor: t.fill }]}><Text style={{ color: t.ink }}>−</Text></Pressable>
                    <Text style={{ color: t.ink, width: 18, textAlign: 'center' }}>{l.qty}</Text>
                    <Pressable onPress={() => setQty(l.item.id, 1)} style={[st.qty, { backgroundColor: t.fill }]}><Text style={{ color: t.ink }}>+</Text></Pressable>
                    <Text style={{ color: t.ink, fontWeight: '600', width: 72, textAlign: 'right' }}>{eur(l.item.priceCents * l.qty)}</Text>
                  </View>
                );
              })}
              <View style={[st.row, { justifyContent: 'space-between', borderTopWidth: StyleSheet.hairlineWidth, borderColor: t.sep, paddingTop: 12, marginTop: 4 }]}>
                <Text style={{ color: t.ink, fontSize: 17, fontWeight: '700' }}>Total</Text>
                <Text style={{ color: t.ink, fontSize: 24, fontWeight: '800' }}>{eur(total)}</Text>
              </View>
              <View style={[st.row, { gap: 10, marginTop: 14 }]}>
                <Pressable onPress={() => setPay('cash')} style={[st.payBig, { backgroundColor: t.fill }]}><Ionicons name="cash-outline" size={26} color={t.ink} /><Text style={[st.payTxt, { color: t.ink }]}>Espèces</Text></Pressable>
                <Pressable onPress={() => setPay('cb')} style={[st.payBig, { backgroundColor: t.blue }]}><Ionicons name="card-outline" size={26} color="#fff" /><Text style={[st.payTxt, { color: '#fff' }]}>CB</Text></Pressable>
              </View>
              <View style={{ marginTop: 10 }}><SoftButton label="Partager (espèces + carte)" onPress={() => setPay('split')} /></View>
              <Pressable onPress={() => { setLines([]); setClient(null); }} style={[st.clear, { backgroundColor: t.red + '14' }]}>
                <Ionicons name="trash-outline" size={16} color={t.red} /><Text style={{ color: t.red, fontWeight: '600' }}>Vider le ticket</Text>
              </Pressable>
            </>
          )}
          <View style={{ marginTop: 10 }}><SoftButton label="Ouvrir la caisse" onPress={() => setToast('Tiroir-caisse ouvert')} /></View>
        </Card>

        <Text style={[st.section, { color: t.grey }]}>VENTES DU JOUR</Text>
        <Card style={{ paddingVertical: 4 }}>
          {TODAY_SALES.map((v, i) => (
            <View key={v.id} style={[st.row, { paddingVertical: 11, borderBottomWidth: i < TODAY_SALES.length - 1 ? StyleSheet.hairlineWidth : 0, borderColor: t.sep }]}>
              <Text style={{ color: t.grey, width: 44 }}>{v.time}</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ color: t.ink, fontWeight: '600' }}>#{v.ticket} · {v.client}</Text>
                <Text style={{ color: t.grey, fontSize: 13 }} numberOfLines={1}>{v.items}</Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 4 }}>
                <Text style={{ color: t.ink, fontWeight: '700' }}>{eur(v.priceCents)}</Text>
                <Pill label={v.method} tone={v.method === 'CB' ? 'blue' : v.method === 'Espèces' ? 'grey' : 'green'} />
              </View>
            </View>
          ))}
        </Card>
      </ScrollView>

      {toast ? <View style={[st.toast, { backgroundColor: t.ink }]}><Text style={{ color: t.bg, fontWeight: '600', textAlign: 'center' }}>{toast}</Text></View> : null}

      <Sheet visible={pay === 'cb'} onClose={() => setPay(null)} title="Paiement par carte">
        {pay === 'cb' ? <CardPayment amount={total} onDone={() => paid('CB')} /> : null}
      </Sheet>
      <Sheet visible={pay === 'cash'} onClose={() => setPay(null)} title="Paiement en espèces">
        {pay === 'cash' ? <CashPayment amount={total} onDone={() => paid('Espèces')} /> : null}
      </Sheet>
      <Sheet visible={pay === 'split'} onClose={() => setPay(null)} title="Partager le paiement">
        <Text style={{ color: t.grey, textAlign: 'center' }}>Montant en espèces, le reste passe sur le TPE.</Text>
        <TextInput defaultValue={(Math.floor(total / 200) / 100 * 1).toFixed(2).replace('.', ',')} keyboardType="decimal-pad"
          style={{ backgroundColor: t.fill, borderRadius: 14, padding: 16, fontSize: 28, fontWeight: '700', color: t.ink, textAlign: 'center', marginVertical: 16 }} />
        <Go label="Encaisser" onPress={() => paid('Espèces + CB')} />
      </Sheet>
    </View>
  );
}

function CardPayment({ amount, onDone }: { amount: number; onDone: () => void }) {
  const { t } = useT();
  const [state, setState] = useState<'wait' | 'ok'>('wait');
  useEffect(() => { const id = setTimeout(() => setState('ok'), 2200); return () => clearTimeout(id); }, []);
  return (
    <View style={{ alignItems: 'center' }}>
      <Text style={{ color: t.ink, fontSize: 34, fontWeight: '800', marginVertical: 8 }}>{eur(amount)}</Text>
      {state === 'wait' ? (
        <>
          <ActivityIndicator size="large" color={t.blue} style={{ marginVertical: 18 }} />
          <Text style={{ color: t.grey, textAlign: 'center' }}>Présentez la carte sur le TPE…{'\n'}(simulé dans la maquette)</Text>
        </>
      ) : (
        <>
          <View style={[st.ok, { backgroundColor: t.green }]}><Ionicons name="checkmark" size={34} color="#fff" /></View>
          <Text style={{ color: t.ink, fontWeight: '700', fontSize: 18 }}>Paiement accepté</Text>
          <View style={{ alignSelf: 'stretch', marginTop: 18 }}><Go label="Imprimer le reçu" icon="print-outline" onPress={onDone} /></View>
          <View style={{ alignSelf: 'stretch', marginTop: 10 }}><SoftButton label="Pas de reçu" onPress={onDone} /></View>
        </>
      )}
    </View>
  );
}

function CashPayment({ amount, onDone }: { amount: number; onDone: () => void }) {
  const { t } = useT();
  const [given, setGiven] = useState('');
  const g = Math.round(parseFloat(given.replace(',', '.') || '0') * 100);
  const change = g - amount;
  const quick = useMemo(() => [amount, Math.ceil(amount / 1000) * 1000, Math.ceil(amount / 2000) * 2000, 5000].filter((v, i, a) => a.indexOf(v) === i && v >= amount).slice(0, 4), [amount]);
  return (
    <View>
      <Text style={{ color: t.grey, textAlign: 'center' }}>À payer</Text>
      <Text style={{ color: t.ink, fontSize: 34, fontWeight: '800', textAlign: 'center' }}>{eur(amount)}</Text>
      <Text style={{ color: t.grey, marginTop: 16, marginBottom: 6 }}>Montant reçu</Text>
      <TextInput value={given} onChangeText={setGiven} keyboardType="decimal-pad" placeholder="0,00" placeholderTextColor={t.grey}
        style={{ backgroundColor: t.fill, borderRadius: 14, padding: 16, fontSize: 28, fontWeight: '700', color: t.ink, textAlign: 'center' }} />
      <View style={[st.row, { gap: 8, marginTop: 10 }]}>
        {quick.map((v) => (
          <Pressable key={v} onPress={() => setGiven((v / 100).toFixed(2).replace('.', ','))} style={{ flex: 1, backgroundColor: t.fill, borderRadius: 12, paddingVertical: 11, alignItems: 'center' }}>
            <Text style={{ color: t.ink, fontWeight: '600' }}>{eur(v)}</Text>
          </Pressable>
        ))}
      </View>
      <View style={[st.row, { justifyContent: 'space-between', marginVertical: 16 }]}>
        <Text style={{ color: t.grey, fontSize: 16 }}>Rendu monnaie</Text>
        <Text style={{ color: change >= 0 ? t.green : t.grey, fontSize: 22, fontWeight: '800' }}>{g ? eur(Math.max(0, change)) : '—'}</Text>
      </View>
      <Go label="Valider l'encaissement" disabled={!g || change < 0} onPress={onDone} />
    </View>
  );
}

function ClotureTab({ by: closer, onClosed }: { by: string; onClosed: () => void }) {
  const { t } = useT();
  const [step, setStep] = useState<'summary' | 'float' | 'confirm' | 'z'>('summary');
  const [float, setFloat] = useState('150,00');
  const [printed, setPrinted] = useState(false);
  const total = TODAY_SALES.reduce((a, s) => a + s.priceCents, 0);
  const by = (m: string) => TODAY_SALES.filter((s) => s.method === m).reduce((a, s) => a + s.priceCents, 0);
  const cash = by('Espèces');
  const floatC = Math.round(parseFloat(float.replace(',', '.') || '0') * 100);
  return (
    <ScrollView contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 30 }}>
      <Text style={{ color: t.grey, marginBottom: 12 }}>Vérifié par code PIN · {closer}</Text>
      <Card style={{ backgroundColor: t.fill }}>
        <Text style={{ color: t.grey, fontWeight: '600' }}>Période en cours</Text>
        <Text style={{ color: t.ink, fontSize: 34, fontWeight: '800', marginTop: 4 }}>{eur(total)}</Text>
        <Text style={{ color: t.grey }}>{TODAY_SALES.length} ventes depuis l'ouverture à 09:00</Text>
        {[['Espèces', cash], ['Carte bancaire', by('CB')]].map(([k, v]) => (
          <View key={k as string} style={[st.row, { justifyContent: 'space-between', marginTop: 10 }]}>
            <Text style={{ color: t.ink }}>{k}</Text><Text style={{ color: t.ink, fontWeight: '600' }}>{eur(v as number)}</Text>
          </View>
        ))}
      </Card>
      <View style={{ height: 18 }} />
      <Pressable onPress={() => setStep('float')} style={({ pressed }) => [st.closeBtn, { backgroundColor: t.red, opacity: pressed ? 0.85 : 1 }]}>
        <Ionicons name="lock-closed-outline" size={20} color="#fff" /><Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>Clôturer la caisse (ticket Z)</Text>
      </Pressable>

      <Sheet visible={step === 'float'} onClose={() => setStep('summary')} title="Fond de caisse">
        <Text style={{ color: t.grey, textAlign: 'center' }}>Fond de caisse actuellement dans le tiroir (en euros) — cet argent reste en caisse, il ne fait pas partie des ventes.</Text>
        <TextInput value={float} onChangeText={setFloat} keyboardType="decimal-pad"
          style={{ backgroundColor: t.fill, borderRadius: 14, padding: 16, fontSize: 28, fontWeight: '700', color: t.ink, textAlign: 'center', marginVertical: 16 }} />
        <SoftButton label="Ouvrir la caisse" onPress={() => {}} />
        <View style={{ height: 10 }} />
        <Go label="Continuer" onPress={() => setStep('confirm')} />
      </Sheet>
      <Sheet visible={step === 'confirm'} onClose={() => setStep('summary')} title="Dernière confirmation">
        <Text style={{ color: t.grey, textAlign: 'center' }}>Clôturer la caisse pour {eur(total)} ({TODAY_SALES.length} ventes) ? Fond de caisse : {eur(floatC)}.{'\n\n'}Cette action est définitive et ne peut pas être annulée.</Text>
        <View style={{ height: 18 }} />
        <Pressable onPress={() => setStep('z')} style={[st.closeBtn, { backgroundColor: t.red }]}><Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>Clôturer définitivement</Text></Pressable>
      </Sheet>
      <Sheet visible={step === 'z'} onClose={onClosed} title="CLÔTURE Z042">
        <Text style={{ color: t.grey, textAlign: 'center', marginBottom: 12 }}>Du {new Date().toLocaleDateString('fr-FR')} 09:00 au {new Date().toLocaleDateString('fr-FR')} {new Date().toTimeString().slice(0, 5)}{'\n'}Clôturé par : {closer}</Text>
        {[['Espèces', cash], ['Carte bancaire', by('CB')]].map(([k, v]) => <ZLine key={k as string} k={k as string} v={eur(v as number)} />)}
        <ZLine k={`Total (${TODAY_SALES.length} ventes)`} v={eur(total)} bold />
        <Text style={{ color: t.grey, fontWeight: '700', marginTop: 14, marginBottom: 4 }}>Détail par coiffeur</Text>
        {STAFF.map((s) => <ZLine key={s.id} k={s.name} v={eur(TODAY_SALES.filter((x) => x.barberId === s.id).reduce((a, x) => a + x.priceCents, 0))} />)}
        <Text style={{ color: t.grey, fontWeight: '700', marginTop: 14, marginBottom: 4 }}>Fond de caisse</Text>
        <ZLine k="Fond de caisse (reste en caisse)" v={eur(floatC)} />
        <ZLine k="+ Ventes en espèces" v={eur(cash)} />
        <ZLine k="= Espèces attendues dans le tiroir" v={eur(floatC + cash)} bold />
        <View style={[st.row, { gap: 10, marginTop: 18 }]}>
          <View style={{ flex: 1 }}><SoftButton label="Fermer" onPress={onClosed} /></View>
          <View style={{ flex: 1 }}><Go label={printed ? 'Imprimé ✓' : 'Imprimer'} onPress={() => setPrinted(true)} /></View>
        </View>
      </Sheet>
    </ScrollView>
  );
}

function ZLine({ k, v, bold }: { k: string; v: string; bold?: boolean }) {
  const { t } = useT();
  return (
    <View style={[st.row, { justifyContent: 'space-between', paddingVertical: 5, borderTopWidth: bold ? 1 : 0, borderColor: t.sep, marginTop: bold ? 4 : 0 }]}>
      <Text style={{ color: t.ink, fontWeight: bold ? '700' : '400', flex: 1, fontVariant: ['tabular-nums'] }}>{k}</Text>
      <Text style={{ color: t.ink, fontWeight: bold ? '800' : '500', fontVariant: ['tabular-nums'] }}>{v}</Text>
    </View>
  );
}

const st = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  round: { width: 42, height: 42, borderRadius: 21, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center', marginRight: 8 },
  section: { fontSize: 13, fontWeight: '700', letterSpacing: 0.5, marginTop: 6, marginBottom: 8, marginLeft: 2 },
  pending: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16, padding: 12, marginBottom: 8, borderWidth: 2 },
  dot: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 14 },
  item: { width: '48%', flexGrow: 1, borderRadius: 18, overflow: 'hidden', borderWidth: 2 },
  itemArt: { height: 78, alignItems: 'center', justifyContent: 'center' },
  plus: { width: 32, height: 32, borderRadius: 16, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  qty: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  payBig: { flex: 1, height: 96, borderRadius: 18, alignItems: 'center', justifyContent: 'center', gap: 6 },
  payTxt: { fontSize: 18, fontWeight: '700' },
  clear: { flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', borderRadius: 12, paddingVertical: 12, marginTop: 10 },
  toast: { position: 'absolute', left: 18, right: 18, bottom: 14, borderRadius: 14, padding: 14 },
  ok: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', marginVertical: 14 },
  closeBtn: { flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', borderRadius: 16, paddingVertical: 16 },
});
