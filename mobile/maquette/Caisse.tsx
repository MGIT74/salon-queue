// MAQUETTE — Caisse (caisse.html), reprise fonction par fonction :
// bulles des coiffeurs (un ticket en brouillon par coiffeur), « À encaisser » (dont « reste à payer » après un paiement
// d'avance), « Encaisser à l'avance un client de la file », ticket groupé (« + Payer aussi pour un autre client », ✕),
// vendeur par ligne, remises fidélité, carte cadeau, douchette, Espèces / CB / Partager, TPE (annuler, relancer, carte
// débitée mais vente non enregistrée), reçu, historique filtré + réimpression, connexion TPE / imprimante,
// clôture avec code PIN, ticket Z détaillé (prestations / produits, TVA), recomptage, « Forcer l'ouverture (admin) ».
// Aucun paiement réel : le TPE et l'imprimante sont simulés.
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Agenda } from './Agenda';
import { BARCODES, CATALOG, CatalogItem, GIFT_CARDS, PENDING_PAYMENTS, Pending, QUEUE_ITEMS, STAFF, Sale, Salon, TODAY_SALES, eur } from './data';
import { StaffHeader, TimerTab } from './Poste';
import { Avatar, Bubbles, Card, Chips, Field, Go, Pill, PinPad, Segmented, Sheet, SoftButton, TabBar, useT, useToast } from './ui';

type CTab = 'agenda' | 'timer' | 'caisse' | 'cloture';
type Line = { key: string; item: CatalogItem; qty: number; person: string; seller: string; balanceOnly?: boolean };
type Ticket = { lines: Line[]; persons: string[]; advance?: boolean; discount?: 'svc50' | 'prod20' | null; gift?: { code: string; cents: number } | null; isGift?: boolean };
const EMPTY: Ticket = { lines: [], persons: [], discount: null, gift: null };
const VAT = 20;

export function CaisseApp({ salon, staffId, onExit }: { salon: Salon; staffId: string; onExit: () => void }) {
  const { t } = useT();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<CTab>('caisse');
  const [acting, setActing] = useState(staffId);
  const [closed, setClosed] = useState(false);
  const [conn, setConn] = useState(false);
  const [force, setForce] = useState(false);
  const [pw, setPw] = useState('');
  const [sales, setSales] = useState<Sale[]>(TODAY_SALES);
  const [toastNode, toast] = useToast();
  const me = STAFF.find((s) => s.id === acting)!;

  if (closed) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30 }}>
        <Ionicons name="lock-closed-outline" size={46} color={t.grey} />
        <Text style={{ color: t.ink, fontSize: 26, fontWeight: '700', marginTop: 12 }}>Caisse fermée</Text>
        <Text style={{ color: t.grey, fontSize: 15, textAlign: 'center', marginTop: 8 }}>Caisse fermée suite à la clôture. Réouverture demain à 09h00.</Text>
        <Pressable onPress={() => setForce(true)} style={{ marginTop: 22 }}><Text style={{ color: t.grey, fontSize: 13.5 }}>Forcer l'ouverture maintenant (admin)</Text></Pressable>
        <Pressable onPress={onExit} style={{ marginTop: 22 }}><Text style={{ color: t.blue, fontWeight: '600' }}>Retour à l'accueil de la maquette</Text></Pressable>
        <Sheet visible={force} onClose={() => setForce(false)} title="Forcer l'ouverture">
          <Text style={{ color: t.grey, textAlign: 'center', marginBottom: 14 }}>Mot de passe administrateur du salon (maquette : n'importe lequel).</Text>
          <Field label="Mot de passe" value={pw} onChangeText={setPw} secureTextEntry />
          <Go label="Ouvrir la caisse" disabled={!pw} onPress={() => { setForce(false); setClosed(false); setPw(''); setTab('caisse'); }} />
        </Sheet>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <StaffHeader salon={salon} name={me.name} right={
        <Pressable onPress={() => setConn(true)} style={[st.round, { backgroundColor: t.fill, borderColor: t.sep }]}>
          <Ionicons name="settings-outline" size={20} color={t.ink} />
          <View style={[st.connDot, { backgroundColor: t.green, borderColor: t.bg }]} />
        </Pressable>
      } />
      <View style={{ paddingHorizontal: 18, marginBottom: 12 }}><Bubbles people={STAFF} value={acting} onChange={setActing} size={42} /></View>
      <View style={{ flex: 1 }}>
        {tab === 'caisse' && <CaisseTab actingId={acting} sales={sales} onSale={(s) => setSales((l) => [...l, s])} toast={toast} />}
        {tab === 'agenda' && <Agenda meId={acting} showAll />}
        {tab === 'timer' && <TimerTab staffId={acting} key={acting} />}
        {tab === 'cloture' && <ClotureTab sales={sales} onClosed={() => setClosed(true)} />}
      </View>
      {toastNode}
      <TabBar<CTab> bottomInset={insets.bottom} active={tab} onChange={setTab}
        tabs={[
          { key: 'agenda', label: 'Agenda', icon: 'calendar-outline' },
          { key: 'timer', label: 'Timer', icon: 'time-outline' },
          { key: 'caisse', label: 'Caisse', icon: 'card-outline' },
          { key: 'cloture', label: 'Clôture', icon: 'lock-closed-outline' },
        ]} />
      <Sheet visible={conn} onClose={() => setConn(false)} title="Connexion TPE et imprimante">
        {[['Pont du salon (PC de la caisse)', 'Connecté', true], ['Terminal de paiement (Nepting)', 'Prêt', true], ['Imprimante de tickets', 'Prête', true], ['Tiroir-caisse', 'Branché sur l\'imprimante', true]].map(([k, v, ok]) => (
          <View key={k as string} style={[st.row, { paddingVertical: 13, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: t.sep }]}>
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: ok ? t.green : t.red }} />
            <Text style={{ color: t.ink, flex: 1, fontSize: 15 }}>{k}</Text><Text style={{ color: t.grey }}>{v}</Text>
          </View>
        ))}
        <Text style={{ color: t.grey, fontSize: 12.5, textAlign: 'center', marginVertical: 14 }}>La pastille de l'icône réglages passe au rouge si le pont ne répond plus (vérifié en continu).</Text>
        <SoftButton label="Imprimer un ticket de test" onPress={() => { setConn(false); toast('Ticket de test envoyé à l\'imprimante'); }} />
        <View style={{ height: 8 }} />
        <SoftButton label="Ouvrir la caisse (tiroir)" onPress={() => { setConn(false); toast('Tiroir-caisse ouvert'); }} />
      </Sheet>
    </View>
  );
}

function CaisseTab({ actingId, sales, onSale, toast }: { actingId: string; sales: Sale[]; onSale: (s: Sale) => void; toast: (m: string) => void }) {
  const { t } = useT();
  const [cat, setCat] = useState<'svc' | 'extra' | 'product'>('svc');
  // Un ticket en brouillon par coiffeur : changer de bulle ne perd pas le ticket en cours.
  const [drafts, setDrafts] = useState<Record<string, Ticket>>({});
  const tk = drafts[actingId] ?? EMPTY;
  const setTk = (fn: (x: Ticket) => Ticket) => setDrafts((d) => ({ ...d, [actingId]: fn(d[actingId] ?? EMPTY) }));
  const [pending, setPending] = useState<Pending[]>(PENDING_PAYMENTS);
  const [sheet, setSheet] = useState<null | 'cb' | 'cash' | 'split' | 'advance' | 'group' | 'seller' | 'gift' | 'scan' | 'history' | 'receipt'>(null);
  const [sellerLine, setSellerLine] = useState<string | null>(null);
  const [lastSale, setLastSale] = useState<Sale | null>(null);

  const persons = tk.persons;
  const pendingOf = (name: string) => pending.find((p) => p.client === name);
  const loyal = persons.some((n) => pendingOf(n)?.loyalty);
  const gross = tk.lines.reduce((a, l) => a + l.item.priceCents * l.qty, 0);
  const discountCents = tk.discount === 'svc50' ? Math.round(tk.lines.filter((l) => l.item.kind === 'svc').reduce((a, l) => a + l.item.priceCents * l.qty, 0) * 0.5)
    : tk.discount === 'prod20' ? Math.round(tk.lines.filter((l) => l.item.kind === 'product').reduce((a, l) => a + l.item.priceCents * l.qty, 0) * 0.2) : 0;
  const giftCents = tk.gift ? Math.min(tk.gift.cents, gross - discountCents) : 0;
  const total = Math.max(0, gross - discountCents - giftCents);

  const add = (item: CatalogItem, person = persons[0] ?? '') => setTk((x) => {
    const f = x.lines.find((l) => l.item.id === item.id && l.person === person && !l.balanceOnly);
    return { ...x, lines: f ? x.lines.map((l) => (l === f ? { ...l, qty: l.qty + 1 } : l)) : [...x.lines, { key: item.id + person + Date.now(), item, qty: 1, person, seller: actingId }] };
  });
  const setQty = (key: string, d: number) => setTk((x) => ({ ...x, lines: x.lines.map((l) => (l.key === key ? { ...l, qty: l.qty + d } : l)).filter((l) => l.qty > 0) }));
  const linesFor = (p: Pending): Line[] => {
    if (p.prepaid) return p.prepaid.extras.map((e, i) => ({ key: p.id + 'x' + i, item: CATALOG.find((c) => c.name === e.name) ?? { id: 'x' + i, name: e.name, priceCents: e.priceCents, emoji: '➕', kind: 'extra' }, qty: 1, person: p.client, seller: p.barberId, balanceOnly: true }));
    return [{ key: p.id + 'l', item: CATALOG.find((c) => c.name === p.service) ?? CATALOG[1], qty: 1, person: p.client, seller: p.barberId }];
  };
  const loadPending = (p: Pending, append = false) => setTk((x) => append
    ? { ...x, persons: [...x.persons, p.client], lines: [...x.lines, ...linesFor(p)] }
    : { ...EMPTY, persons: [p.client], lines: linesFor(p) });
  const removePerson = (name: string) => setTk((x) => ({ ...x, persons: x.persons.filter((n) => n !== name), lines: x.lines.filter((l) => l.person !== name) }));
  const finish = (method: string, receipt: boolean) => {
    const sale: Sale = { id: 's' + Date.now(), ticket: 45 + sales.length - TODAY_SALES.length, time: new Date().toTimeString().slice(0, 5), client: persons.join(', ') || 'Client de passage',
      items: tk.lines.map((l) => (l.qty > 1 ? `${l.qty} × ` : '') + l.item.name).join(', ') + (tk.advance ? " (payé d'avance)" : ''), method, priceCents: total, barberId: actingId };
    onSale(sale); setLastSale(sale);
    setPending((l) => l.filter((x) => !persons.includes(x.client)));
    setTk(() => EMPTY); setSheet(receipt ? 'receipt' : null);
    if (!receipt) toast(`Vente enregistrée · ${method} · ${eur(sale.priceCents)}`);
  };
  const waitingQueue = QUEUE_ITEMS.filter((q) => q.status !== 'done' && !pending.some((p) => p.client === q.client));

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 30 }} keyboardShouldPersistTaps="handled">
        {pending.length ? (
          <>
            <Text style={[st.section, { color: t.grey }]}>À ENCAISSER</Text>
            {pending.map((p) => {
              const b = STAFF.find((s) => s.id === p.barberId)!;
              const on = persons.includes(p.client);
              const rest = p.prepaid ? p.prepaid.extras.reduce((a, e) => a + e.priceCents, 0) : p.priceCents;
              return (
                <Pressable key={p.id} onPress={() => loadPending(p)} style={[st.pending, { backgroundColor: t.card, borderColor: on ? t.blue : 'transparent' }]}>
                  <Avatar initials={b.initials} color={b.color} size={30} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: t.ink, fontWeight: '700', fontSize: 15 }}>{p.client}{p.loyalty ? ' ⭐' : ''}</Text>
                    <Text style={{ color: t.grey, fontSize: 13 }}>{p.prepaid ? `Payé d'avance ${eur(p.prepaid.paidCents)} · ajouté : ${p.prepaid.extras.map((e) => e.name).join(', ')}` : `${p.service} · terminé il y a ${p.ago}`}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 4 }}>
                    <Text style={{ color: t.ink, fontWeight: '700' }}>{eur(rest)}</Text>
                    {p.prepaid ? <Pill label="Reste à payer" tone="orange" /> : null}
                  </View>
                </Pressable>
              );
            })}
          </>
        ) : null}
        <Pressable onPress={() => setSheet('advance')} style={[st.linkRow, { borderColor: t.sep }]}>
          <Ionicons name="time-outline" size={18} color={t.blue} /><Text style={{ color: t.blue, fontWeight: '600', flex: 1 }}>Encaisser à l'avance un client de la file</Text><Ionicons name="chevron-forward" size={16} color={t.grey} />
        </Pressable>

        <View style={[st.row, { marginTop: 14 }]}>
          <Segmented style={{ flex: 1 }} value={cat} onChange={setCat} items={[{ key: 'svc', label: 'Prestations' }, { key: 'extra', label: 'Suppléments' }, { key: 'product', label: 'Produits' }]} />
          <Pressable onPress={() => setSheet('scan')} style={[st.scanBtn, { backgroundColor: t.fill }]}><Ionicons name="barcode-outline" size={22} color={t.ink} /></Pressable>
        </View>
        <View style={st.grid}>
          {CATALOG.filter((c) => c.kind === cat).map((c) => {
            const inTicket = tk.lines.some((l) => l.item.id === c.id);
            return (
              <Pressable key={c.id} onPress={() => add(c)} style={({ pressed }) => [st.item, { backgroundColor: t.fill, borderColor: inTicket ? t.blue : 'transparent', transform: [{ scale: pressed ? 0.97 : 1 }] }]}>
                <View style={[st.itemArt, { backgroundColor: t.blueSoft }]}><Text style={{ fontSize: 34 }}>{c.emoji}</Text></View>
                <View style={{ padding: 12 }}>
                  <Text style={{ color: t.ink, fontWeight: '600', fontSize: 15 }} numberOfLines={1}>{c.name}</Text>
                  <Text style={{ color: c.stock !== undefined && c.stock <= 3 ? t.orange : t.grey, fontSize: 13 }}>{c.minutes ? `${c.minutes} min` : c.stock !== undefined ? `${c.stock} en stock` : 'Supplément'}</Text>
                  <View style={[st.row, { justifyContent: 'space-between', marginTop: 10 }]}>
                    <Text style={{ color: t.ink, fontWeight: '700', fontSize: 16 }}>{eur(c.priceCents)}</Text>
                    <View style={[st.plus, { backgroundColor: inTicket ? t.blue : t.card, borderColor: t.blue }]}><Ionicons name={inTicket ? 'checkmark' : 'add'} size={18} color={inTicket ? '#fff' : t.blue} /></View>
                  </View>
                </View>
              </Pressable>
            );
          })}
        </View>

        <Card style={{ marginTop: 16 }}>
          <View style={[st.row, { justifyContent: 'space-between' }]}>
            <Text style={{ color: t.ink, fontSize: 17, fontWeight: '700' }}>Ticket en cours{tk.advance ? " · paiement d'avance" : ''}</Text>
            <Pressable onPress={() => setSheet('history')} hitSlop={8} style={[st.round, { width: 36, height: 36, marginRight: 0, backgroundColor: t.fill, borderColor: t.sep }]}><Ionicons name="time-outline" size={19} color={t.ink} /></Pressable>
          </View>
          {tk.lines.length === 0 ? <Text style={{ color: t.grey, textAlign: 'center', paddingVertical: 22 }}>Aucun article sélectionné</Text> : null}
          {(persons.length ? persons : ['']).map((person) => {
            const ls = tk.lines.filter((l) => l.person === person || (!persons.length));
            if (!ls.length && !person) return null;
            return (
              <View key={person || 'none'}>
                {person ? (
                  <View style={[st.row, { marginTop: 12, marginBottom: 2 }]}>
                    <Ionicons name="person-outline" size={15} color={t.grey} />
                    <Text style={{ color: t.grey, fontWeight: '700', flex: 1 }}>{person}</Text>
                    {persons.length > 1 ? <Pressable onPress={() => removePerson(person)} hitSlop={8}><Text style={{ color: t.grey, fontSize: 16 }}>✕</Text></Pressable> : null}
                  </View>
                ) : null}
                {ls.map((l) => {
                  const seller = STAFF.find((s) => s.id === l.seller)!;
                  return (
                    <View key={l.key} style={[st.row, { paddingVertical: 9 }]}>
                      <Pressable onPress={() => { setSellerLine(l.key); setSheet('seller'); }} hitSlop={6}><Avatar initials={seller.initials} color={seller.color} size={24} /></Pressable>
                      <Text style={{ color: t.ink, flex: 1, fontSize: 15 }} numberOfLines={1}>{l.item.name}</Text>
                      <Pressable onPress={() => setQty(l.key, -1)} style={[st.qty, { backgroundColor: t.fill }]}><Text style={{ color: t.ink }}>−</Text></Pressable>
                      <Text style={{ color: t.ink, width: 18, textAlign: 'center' }}>{l.qty}</Text>
                      <Pressable onPress={() => setQty(l.key, 1)} style={[st.qty, { backgroundColor: t.fill }]}><Text style={{ color: t.ink }}>+</Text></Pressable>
                      <Text style={{ color: t.ink, fontWeight: '600', width: 70, textAlign: 'right' }}>{eur(l.item.priceCents * l.qty)}</Text>
                    </View>
                  );
                })}
                {person && pendingOf(person)?.prepaid ? <Text style={{ color: t.green, fontSize: 12.5 }}>✓ {pendingOf(person)!.prepaid!.paidCents / 100} € déjà payés d'avance — seul le reste est encaissé</Text> : null}
              </View>
            );
          })}
          {tk.lines.length ? (
            <>
              <Pressable onPress={() => setSheet('group')} style={{ marginTop: 10 }}><Text style={{ color: t.blue, fontWeight: '600' }}>+ Payer aussi pour un autre client</Text></Pressable>
              {loyal ? (
                <View style={{ marginTop: 12 }}>
                  <Text style={{ color: t.grey, fontWeight: '600', marginBottom: 6 }}>⭐ Récompense fidélité</Text>
                  <Chips items={[{ key: 'svc50', label: '−50 % prestation' }, { key: 'prod20', label: '−20 % produit' }]} value={tk.discount ? [tk.discount] : []}
                    onToggle={(k) => setTk((x) => ({ ...x, discount: x.discount === k ? null : k }))} />
                </View>
              ) : null}
              <View style={[st.row, { marginTop: 12 }]}>
                <Pressable onPress={() => setSheet('gift')} style={[st.row, { gap: 6, flex: 1 }]}><Ionicons name="gift-outline" size={17} color={t.blue} /><Text style={{ color: t.blue, fontWeight: '600' }}>{tk.gift ? `Carte cadeau ${tk.gift.code}` : 'Utiliser une carte cadeau'}</Text></Pressable>
                {tk.gift ? <Pressable onPress={() => setTk((x) => ({ ...x, gift: null }))}><Text style={{ color: t.grey }}>Retirer</Text></Pressable> : null}
              </View>
              <View style={[st.row, { marginTop: 8 }]}>
                <Switch value={!!tk.isGift} onValueChange={(v) => setTk((x) => ({ ...x, isGift: v }))} trackColor={{ true: t.green, false: t.fill2 }} />
                <Text style={{ color: t.ink, flex: 1 }}>C'est un cadeau pour quelqu'un d'autre</Text>
              </View>
              {discountCents ? <View style={[st.row, { justifyContent: 'space-between', marginTop: 8 }]}><Text style={{ color: t.green }}>Remise fidélité</Text><Text style={{ color: t.green, fontWeight: '600' }}>−{eur(discountCents)}</Text></View> : null}
              {giftCents ? <View style={[st.row, { justifyContent: 'space-between', marginTop: 4 }]}><Text style={{ color: t.green }}>Carte cadeau</Text><Text style={{ color: t.green, fontWeight: '600' }}>−{eur(giftCents)}</Text></View> : null}
              <View style={[st.row, { justifyContent: 'space-between', borderTopWidth: StyleSheet.hairlineWidth, borderColor: t.sep, paddingTop: 12, marginTop: 8 }]}>
                <Text style={{ color: t.ink, fontSize: 17, fontWeight: '700' }}>{persons.some((n) => pendingOf(n)?.prepaid) ? 'Reste à payer' : 'Total'}</Text>
                <Text style={{ color: t.ink, fontSize: 24, fontWeight: '800' }}>{eur(total)}</Text>
              </View>
              <View style={[st.row, { gap: 10, marginTop: 14 }]}>
                <Pressable onPress={() => (total ? setSheet('cash') : finish('Carte cadeau', true))} style={[st.payBig, { backgroundColor: t.fill }]}><Ionicons name="cash-outline" size={26} color={t.ink} /><Text style={[st.payTxt, { color: t.ink }]}>Espèces</Text></Pressable>
                <Pressable onPress={() => (total ? setSheet('cb') : finish('Carte cadeau', true))} style={[st.payBig, { backgroundColor: t.blue }]}><Ionicons name="card-outline" size={26} color="#fff" /><Text style={[st.payTxt, { color: '#fff' }]}>CB</Text></Pressable>
              </View>
              <View style={{ marginTop: 10 }}><SoftButton label="Partager (espèces + carte)" onPress={() => setSheet('split')} /></View>
              <Pressable onPress={() => setTk(() => EMPTY)} style={[st.clear, { backgroundColor: t.red + '14' }]}><Ionicons name="trash-outline" size={16} color={t.red} /><Text style={{ color: t.red, fontWeight: '600' }}>Vider le ticket</Text></Pressable>
            </>
          ) : null}
          <View style={{ marginTop: 10 }}><SoftButton label="Ouvrir la caisse" onPress={() => toast('Tiroir-caisse ouvert')} /></View>
        </Card>
        <Text style={{ color: t.grey, fontSize: 12, textAlign: 'center', marginTop: 10 }}>Le ticket est gardé pour chaque coiffeur : changer de bulle ne le perd pas.</Text>
      </ScrollView>

      <Sheet visible={sheet === 'cb'} onClose={() => setSheet(null)} title="Paiement par carte">
        {sheet === 'cb' ? <CardPayment amount={total} onCancel={() => { setSheet(null); toast('Paiement annulé sur le TPE'); }} onDone={() => finish('CB', true)} onAbandon={() => { setSheet(null); toast('Vente abandonnée — le client a été débité : à rembourser sur le TPE'); }} /> : null}
      </Sheet>
      <Sheet visible={sheet === 'cash'} onClose={() => setSheet(null)} title="Paiement en espèces">
        {sheet === 'cash' ? <CashPayment amount={total} onDone={() => finish('Espèces', true)} /> : null}
      </Sheet>
      <Sheet visible={sheet === 'split'} onClose={() => setSheet(null)} title="Partager le paiement">
        <SplitPayment amount={total} onDone={() => finish('Espèces + CB', true)} />
      </Sheet>
      <Sheet visible={sheet === 'receipt'} onClose={() => setSheet(null)} title="Vente enregistrée">
        <View style={{ alignItems: 'center' }}>
          <View style={[st.ok, { backgroundColor: t.green }]}><Ionicons name="checkmark" size={34} color="#fff" /></View>
          <Text style={{ color: t.ink, fontWeight: '700', fontSize: 18 }}>Ticket #{lastSale?.ticket} · {lastSale ? eur(lastSale.priceCents) : ''}</Text>
          <Text style={{ color: t.grey, marginTop: 4 }}>{lastSale?.method}</Text>
          <View style={{ alignSelf: 'stretch', marginTop: 18 }}><Go label="Imprimer le reçu" icon="print-outline" onPress={() => { setSheet(null); toast('Reçu envoyé à l\'imprimante'); }} /></View>
          <View style={{ alignSelf: 'stretch', marginTop: 10 }}><SoftButton label="Pas de reçu" onPress={() => setSheet(null)} /></View>
        </View>
      </Sheet>
      <Sheet visible={sheet === 'advance'} onClose={() => setSheet(null)} title="Encaisser à l'avance">
        <Text style={{ color: t.grey, textAlign: 'center', marginBottom: 12 }}>Clients de la file pas encore passés : ils paient maintenant, leur passage sera marqué « ✓ Payé d'avance ».</Text>
        {waitingQueue.map((q) => {
          const b = STAFF.find((s) => s.id === q.barberId)!;
          return (
            <Pressable key={q.id} onPress={() => { setTk(() => ({ ...EMPTY, advance: true, persons: [q.client], lines: [{ key: q.id, item: CATALOG.find((c) => c.name === q.service) ?? CATALOG[1], qty: 1, person: q.client, seller: q.barberId }] })); setSheet(null); }}
              style={[st.row, { paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: t.sep }]}>
              <Avatar initials={b.initials} color={b.color} size={28} />
              <View style={{ flex: 1 }}><Text style={{ color: t.ink, fontWeight: '600' }}>{q.client}</Text><Text style={{ color: t.grey, fontSize: 13 }}>{q.service} · {q.status === 'in_progress' ? 'au fauteuil' : q.time ? `RDV ${q.time}` : 'en attente'}</Text></View>
              <Text style={{ color: t.ink, fontWeight: '700' }}>{eur(q.priceCents)}</Text>
            </Pressable>
          );
        })}
      </Sheet>
      <Sheet visible={sheet === 'group'} onClose={() => setSheet(null)} title="Payer aussi pour un autre client">
        <Text style={{ color: t.grey, textAlign: 'center', marginBottom: 12 }}>Tous les clients du salon en attente d'encaissement (même ceux d'un autre coiffeur).</Text>
        {pending.filter((p) => !persons.includes(p.client)).map((p) => (
          <Pressable key={p.id} onPress={() => { loadPending(p, true); setSheet(null); }} style={[st.row, { paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: t.sep }]}>
            <Avatar initials={STAFF.find((s) => s.id === p.barberId)!.initials} color={STAFF.find((s) => s.id === p.barberId)!.color} size={28} />
            <Text style={{ color: t.ink, flex: 1, fontWeight: '600' }}>{p.client}</Text><Text style={{ color: t.ink }}>{eur(p.priceCents)}</Text>
          </Pressable>
        ))}
        {pending.filter((p) => !persons.includes(p.client)).length === 0 ? <Text style={{ color: t.grey, textAlign: 'center' }}>Personne d'autre à encaisser.</Text> : null}
      </Sheet>
      <Sheet visible={sheet === 'seller'} onClose={() => setSheet(null)} title="Vendu par">
        <Text style={{ color: t.grey, textAlign: 'center', marginBottom: 12 }}>À qui revient cette ligne (chiffre et classement) ?</Text>
        {STAFF.map((s) => (
          <Pressable key={s.id} onPress={() => { setTk((x) => ({ ...x, lines: x.lines.map((l) => (l.key === sellerLine ? { ...l, seller: s.id } : l)) })); setSheet(null); }}
            style={[st.row, { paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: t.sep }]}>
            <Avatar initials={s.initials} color={s.color} size={30} /><Text style={{ color: t.ink, flex: 1, fontSize: 16 }}>{s.name}</Text>
            {tk.lines.find((l) => l.key === sellerLine)?.seller === s.id ? <Ionicons name="checkmark" size={20} color={t.blue} /> : null}
          </Pressable>
        ))}
      </Sheet>
      <Sheet visible={sheet === 'gift'} onClose={() => setSheet(null)} title="Carte cadeau">
        <GiftLookup onUse={(code, cents) => { setTk((x) => ({ ...x, gift: { code, cents } })); setSheet(null); }} />
      </Sheet>
      <Sheet visible={sheet === 'scan'} onClose={() => setSheet(null)} title="Scanner un article">
        <ScanSheet onFound={(item) => { add(item); setSheet(null); toast(`${item.name} ajouté au ticket`); }} />
      </Sheet>
      <Sheet visible={sheet === 'history'} onClose={() => setSheet(null)} title="Historique de la caisse">
        <History sales={sales} onReprint={(s) => toast(`Ticket #${s.ticket} réimprimé`)} />
      </Sheet>
    </View>
  );
}

function GiftLookup({ onUse }: { onUse: (code: string, cents: number) => void }) {
  const { t } = useT();
  const [code, setCode] = useState('');
  const card = GIFT_CARDS[code.trim().toUpperCase()];
  return (
    <View>
      <Field label="Code de la carte" value={code} onChangeText={setCode} autoCapitalize="characters" placeholder="Ex : TBO-7F3K" />
      <Text style={{ color: t.grey, fontSize: 12.5, marginTop: -4, marginBottom: 12 }}>Maquette : essayez TBO-7F3K ou TBO-Q2M9.</Text>
      {code.length >= 8 ? (card ? (
        <Card style={{ backgroundColor: t.fill, marginBottom: 14 }}>
          <Text style={{ color: t.ink, fontWeight: '700' }}>Solde {eur(card.balanceCents)}</Text>
          <Text style={{ color: t.grey }}>Offerte par {card.from} à {card.to}</Text>
        </Card>
      ) : <Text style={{ color: t.red, marginBottom: 14 }}>Code inconnu ou carte déjà utilisée</Text>) : null}
      <Go label="Utiliser la carte" disabled={!card} onPress={() => card && onUse(code.trim().toUpperCase(), card.balanceCents)} />
    </View>
  );
}

function ScanSheet({ onFound }: { onFound: (item: CatalogItem) => void }) {
  const { t } = useT();
  const [code, setCode] = useState('');
  const find = (c: string) => { const id = BARCODES[c.trim()]; const it = CATALOG.find((x) => x.id === id); if (it) onFound(it); return !!it; };
  return (
    <View>
      <View style={{ alignItems: 'center', marginBottom: 14 }}><Ionicons name="barcode-outline" size={56} color={t.grey} /><Text style={{ color: t.grey, textAlign: 'center' }}>Passez la douchette sur le code-barres : l'article s'ajoute tout seul au ticket.</Text></View>
      <Field label="Code-barres" value={code} onChangeText={(v) => { setCode(v); if (v.length === 13) find(v); }} keyboardType="number-pad" placeholder="13 chiffres" />
      {code.length === 13 && !BARCODES[code] ? <Text style={{ color: t.red, marginBottom: 10 }}>Code inconnu : ajoutez-le dans la fiche du produit.</Text> : null}
      <Text style={{ color: t.grey, fontWeight: '600', marginBottom: 6 }}>Simuler un scan</Text>
      {Object.entries(BARCODES).map(([c, id]) => (
        <Pressable key={c} onPress={() => find(c)} style={[st.row, { paddingVertical: 10 }]}><Ionicons name="scan-outline" size={18} color={t.blue} /><Text style={{ color: t.ink }}>{CATALOG.find((x) => x.id === id)!.name} · {c}</Text></Pressable>
      ))}
    </View>
  );
}

function History({ sales, onReprint }: { sales: Sale[]; onReprint: (s: Sale) => void }) {
  const { t } = useT();
  const [f, setF] = useState<string>('all');
  const list = [...sales].reverse().filter((s) => f === 'all' || s.barberId === f);
  return (
    <View>
      <Chips items={[{ key: 'all', label: 'Tous' }, ...STAFF.map((s) => ({ key: s.id, label: s.name, color: s.color }))]} value={[f]} onToggle={setF} />
      <Text style={{ color: t.grey, marginVertical: 10 }}>{list.length} ventes · {eur(list.reduce((a, s) => a + s.priceCents, 0))}</Text>
      {list.map((v) => (
        <View key={v.id} style={[st.row, { paddingVertical: 11, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: t.sep }]}>
          <Text style={{ color: t.grey, width: 44 }}>{v.time}</Text>
          <View style={{ flex: 1 }}><Text style={{ color: t.ink, fontWeight: '600' }}>#{v.ticket} · {v.client}</Text><Text style={{ color: t.grey, fontSize: 13 }} numberOfLines={1}>{v.items}</Text></View>
          <View style={{ alignItems: 'flex-end', gap: 4 }}>
            <Text style={{ color: t.ink, fontWeight: '700' }}>{eur(v.priceCents)}</Text>
            <Pressable onPress={() => onReprint(v)}><Text style={{ color: t.blue, fontWeight: '600', fontSize: 13 }}>Imprimer</Text></Pressable>
          </View>
        </View>
      ))}
    </View>
  );
}

/** Paiement carte : attente sur le TPE (Annuler), accepté, refusé (Relancer), ou carte débitée mais vente non
 *  enregistrée (Réessayer / Abandonner) — les cas du web. Le résultat est choisi pour la démonstration. */
function CardPayment({ amount, onDone, onCancel, onAbandon }: { amount: number; onDone: () => void; onCancel: () => void; onAbandon: () => void }) {
  const { t } = useT();
  const [outcome, setOutcome] = useState<'ok' | 'refused' | 'uncertain'>('ok');
  const [state, setState] = useState<'choose' | 'wait' | 'ok' | 'refused' | 'uncertain' | 'saving'>('choose');
  useEffect(() => {
    if (state === 'wait') { const id = setTimeout(() => setState(outcome), 2000); return () => clearTimeout(id); }
    if (state === 'saving') { const id = setTimeout(() => setState('ok'), 1200); return () => clearTimeout(id); }
  }, [state, outcome]);
  return (
    <View style={{ alignItems: 'center' }}>
      <Text style={{ color: t.ink, fontSize: 34, fontWeight: '800', marginVertical: 8 }}>{eur(amount)}</Text>
      {state === 'choose' ? (
        <>
          <Text style={{ color: t.grey, marginBottom: 8 }}>Démonstration : résultat du TPE</Text>
          <Segmented value={outcome} onChange={setOutcome} items={[{ key: 'ok', label: 'Accepté' }, { key: 'refused', label: 'Refusé' }, { key: 'uncertain', label: 'Coupure' }]} />
          <View style={{ alignSelf: 'stretch', marginTop: 16 }}><Go label="Envoyer au TPE" icon="card-outline" onPress={() => setState('wait')} /></View>
        </>
      ) : null}
      {state === 'wait' || state === 'saving' ? (
        <>
          <ActivityIndicator size="large" color={t.blue} style={{ marginVertical: 18 }} />
          <Text style={{ color: t.grey, textAlign: 'center' }}>{state === 'wait' ? 'Présentez la carte sur le TPE…' : 'Enregistrement de la vente…'}</Text>
          {state === 'wait' ? <View style={{ alignSelf: 'stretch', marginTop: 16 }}><SoftButton label="Annuler le paiement" danger onPress={onCancel} /></View> : null}
        </>
      ) : null}
      {state === 'ok' ? (
        <>
          <View style={[st.ok, { backgroundColor: t.green }]}><Ionicons name="checkmark" size={34} color="#fff" /></View>
          <Text style={{ color: t.ink, fontWeight: '700', fontSize: 18 }}>Paiement accepté</Text>
          <View style={{ alignSelf: 'stretch', marginTop: 18 }}><Go label="Continuer" onPress={onDone} /></View>
        </>
      ) : null}
      {state === 'refused' ? (
        <>
          <View style={[st.ok, { backgroundColor: t.red }]}><Ionicons name="close" size={34} color="#fff" /></View>
          <Text style={{ color: t.ink, fontWeight: '700', fontSize: 18 }}>Paiement refusé</Text>
          <Text style={{ color: t.grey, textAlign: 'center', marginTop: 4 }}>Carte refusée par la banque. Rien n'a été débité.</Text>
          <View style={{ alignSelf: 'stretch', marginTop: 18 }}><Go label="Relancer le paiement" onPress={() => { setOutcome('ok'); setState('wait'); }} /></View>
          <View style={{ alignSelf: 'stretch', marginTop: 10 }}><SoftButton label="Annuler" onPress={onCancel} /></View>
        </>
      ) : null}
      {state === 'uncertain' ? (
        <>
          <View style={[st.ok, { backgroundColor: t.orange }]}><Ionicons name="warning-outline" size={32} color="#fff" /></View>
          <Text style={{ color: t.ink, fontWeight: '700', fontSize: 18, textAlign: 'center' }}>Carte débitée, vente non enregistrée</Text>
          <Text style={{ color: t.grey, textAlign: 'center', marginTop: 4 }}>Le TPE a accepté mais la connexion a coupé avant l'enregistrement. Ne relancez pas le paiement : réessayez d'enregistrer.</Text>
          <View style={{ alignSelf: 'stretch', marginTop: 18 }}><Go label="Réessayer l'enregistrement" onPress={() => setState('saving')} /></View>
          <View style={{ alignSelf: 'stretch', marginTop: 10 }}><SoftButton label="Abandonner" danger onPress={onAbandon} /></View>
        </>
      ) : null}
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

function SplitPayment({ amount, onDone }: { amount: number; onDone: () => void }) {
  const { t } = useT();
  const [cash, setCash] = useState('');
  const c = Math.min(amount, Math.round(parseFloat(cash.replace(',', '.') || '0') * 100));
  return (
    <View>
      <Text style={{ color: t.grey, textAlign: 'center' }}>Total {eur(amount)} : la part en espèces, le reste passe sur le TPE.</Text>
      <Field label="Espèces" style={{ marginTop: 14 }} value={cash} onChangeText={setCash} keyboardType="decimal-pad" placeholder="0,00" />
      <View style={[st.row, { justifyContent: 'space-between', marginBottom: 16 }]}><Text style={{ color: t.grey }}>Carte bancaire</Text><Text style={{ color: t.ink, fontWeight: '800', fontSize: 20 }}>{eur(amount - c)}</Text></View>
      <Go label="Encaisser" disabled={!c || c >= amount} onPress={onDone} />
    </View>
  );
}

function ClotureTab({ sales, onClosed }: { sales: Sale[]; onClosed: () => void }) {
  const { t } = useT();
  const [closer, setCloser] = useState<string | null>(null);
  const [err, setErr] = useState<string | undefined>();
  const [step, setStep] = useState<'summary' | 'float' | 'confirm' | 'z' | 'recount'>('summary');
  const [float, setFloat] = useState('150,00');
  const [printed, setPrinted] = useState(false);
  const [rc, setRc] = useState<'ask' | 'gap' | 'saved'>('ask');
  const [counted, setCounted] = useState('');
  const total = sales.reduce((a, s) => a + s.priceCents, 0);
  const by = (m: string) => sales.filter((s) => s.method === m || (m === 'CB' && s.method === 'Espèces + CB')).reduce((a, s) => a + s.priceCents, 0);
  const cash = by('Espèces');
  const floatC = Math.round(parseFloat(float.replace(',', '.') || '0') * 100);
  const expected = floatC + cash;
  const countedC = Math.round(parseFloat(counted.replace(',', '.') || '0') * 100);
  const byItem = useMemo(() => {
    const m: Record<string, { q: number; c: number }> = {};
    sales.forEach((s) => s.items.split(', ').forEach((raw) => {
      const mm = raw.match(/^(\d+) × (.*)$/); const q = mm ? Number(mm[1]) : 1; const name = (mm ? mm[2] : raw).replace(" (payé d'avance)", '');
      const it = CATALOG.find((c) => c.name === name); if (!it) return;
      m[name] = { q: (m[name]?.q ?? 0) + q, c: (m[name]?.c ?? 0) + it.priceCents * q };
    }));
    return Object.entries(m).sort((a, b) => b[1].c - a[1].c);
  }, [sales]);
  const ht = Math.round(total / (1 + VAT / 100));

  if (!closer) {
    return (
      <ScrollView contentContainerStyle={{ paddingTop: 10, paddingBottom: 30 }}>
        <PinPad title="Clôture" sub="Code PIN du coiffeur qui clôture" error={err}
          onDone={(pin) => { const s = STAFF.find((x) => x.pin === pin); if (s) { setErr(undefined); setCloser(s.name); } else setErr('Code incorrect'); }} />
      </ScrollView>
    );
  }
  return (
    <ScrollView contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 30 }}>
      <Text style={{ color: t.grey, marginBottom: 12 }}>Vérifié par code PIN · {closer}</Text>
      <Card style={{ backgroundColor: t.fill }}>
        <Text style={{ color: t.grey, fontWeight: '600' }}>Période en cours</Text>
        <Text style={{ color: t.ink, fontSize: 34, fontWeight: '800', marginTop: 4 }}>{eur(total)}</Text>
        <Text style={{ color: t.grey }}>{sales.length} ventes depuis l'ouverture à 09:00</Text>
        {[['Espèces', cash], ['Carte bancaire', by('CB')]].map(([k, v]) => (
          <View key={k as string} style={[st.row, { justifyContent: 'space-between', marginTop: 10 }]}><Text style={{ color: t.ink }}>{k}</Text><Text style={{ color: t.ink, fontWeight: '600' }}>{eur(v as number)}</Text></View>
        ))}
      </Card>
      <View style={{ height: 18 }} />
      <Pressable onPress={() => setStep('float')} style={({ pressed }) => [st.closeBtn, { backgroundColor: t.red, opacity: pressed ? 0.85 : 1 }]}>
        <Ionicons name="lock-closed-outline" size={20} color="#fff" /><Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>Clôturer la caisse (ticket Z)</Text>
      </Pressable>

      <Sheet visible={step === 'float'} onClose={() => setStep('summary')} title="Fond de caisse">
        <Text style={{ color: t.grey, textAlign: 'center' }}>Fond de caisse actuellement dans le tiroir (en euros) — cet argent reste en caisse, il ne fait pas partie des ventes.</Text>
        <TextInput value={float} onChangeText={setFloat} keyboardType="decimal-pad" style={{ backgroundColor: t.fill, borderRadius: 14, padding: 16, fontSize: 28, fontWeight: '700', color: t.ink, textAlign: 'center', marginVertical: 16 }} />
        <SoftButton label="Ouvrir la caisse" onPress={() => {}} />
        <View style={{ height: 10 }} />
        <Go label="Continuer" onPress={() => setStep('confirm')} />
      </Sheet>
      <Sheet visible={step === 'confirm'} onClose={() => setStep('summary')} title="Dernière confirmation">
        <Text style={{ color: t.grey, textAlign: 'center' }}>Clôturer la caisse pour {eur(total)} ({sales.length} ventes) ? Fond de caisse : {eur(floatC)}.{'\n\n'}Cette action est définitive et ne peut pas être annulée.</Text>
        <View style={{ height: 18 }} />
        <Pressable onPress={() => setStep('z')} style={[st.closeBtn, { backgroundColor: t.red }]}><Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>Clôturer définitivement</Text></Pressable>
      </Sheet>
      <Sheet visible={step === 'z'} onClose={() => setStep('recount')} title="CLÔTURE Z042">
        <Text style={{ color: t.grey, textAlign: 'center', marginBottom: 12 }}>Du {new Date().toLocaleDateString('fr-FR')} 09:00 au {new Date().toLocaleDateString('fr-FR')} {new Date().toTimeString().slice(0, 5)}{'\n'}Clôturé par : {closer}</Text>
        <ZHead label="Détail par mode de paiement" />
        <ZLine k="Espèces" v={eur(cash)} /><ZLine k="Carte bancaire" v={eur(by('CB'))} />
        <ZLine k={`Total (${sales.length} ventes)`} v={eur(total)} bold />
        <ZHead label="Détail par coiffeur" />
        {STAFF.map((s) => { const l = sales.filter((x) => x.barberId === s.id); return <ZLine key={s.id} k={`${s.name} (${l.length})`} v={eur(l.reduce((a, x) => a + x.priceCents, 0))} />; })}
        <ZHead label="Détail par prestation / produit" />
        {byItem.map(([n, v]) => <ZLine key={n} k={`${v.q} × ${n}`} v={eur(v.c)} />)}
        <ZHead label="Détail TVA" />
        <ZLine k={`TVA ${VAT}% (HT ${eur(ht)})`} v={eur(total - ht)} />
        <ZLine k="Total TVA" v={eur(total - ht)} bold />
        <ZHead label="Fond de caisse" />
        <ZLine k="Fond de caisse (reste en caisse)" v={eur(floatC)} />
        <ZLine k="+ Ventes en espèces" v={eur(cash)} />
        <ZLine k="= Espèces attendues dans le tiroir" v={eur(expected)} bold />
        <View style={[st.row, { gap: 10, marginTop: 18 }]}>
          <View style={{ flex: 1 }}><SoftButton label="Fermer" onPress={() => setStep('recount')} /></View>
          <View style={{ flex: 1 }}><Go label={printed ? 'Imprimé ✓' : 'Imprimer'} onPress={() => setPrinted(true)} /></View>
        </View>
      </Sheet>
      <Sheet visible={step === 'recount'} onClose={onClosed} title="Recomptage du tiroir">
        {rc === 'saved' ? (
          <View style={{ alignItems: 'center' }}>
            <View style={[st.ok, { backgroundColor: countedC === expected || !counted ? t.green : t.orange }]}><Ionicons name={countedC === expected || !counted ? 'checkmark' : 'alert'} size={32} color="#fff" /></View>
            <Text style={{ color: t.ink, fontWeight: '700', fontSize: 17, textAlign: 'center' }}>{!counted || countedC === expected ? 'Tiroir juste' : `Écart de ${eur(countedC - expected)} enregistré`}</Text>
            <View style={{ alignSelf: 'stretch', marginTop: 18 }}><Go label="Terminer" onPress={onClosed} /></View>
          </View>
        ) : (
          <>
            <Text style={{ color: t.grey, textAlign: 'center' }}>Comptez les espèces du tiroir. Attendu :</Text>
            <Text style={{ color: t.ink, fontSize: 30, fontWeight: '800', textAlign: 'center', marginVertical: 8 }}>{eur(expected)}</Text>
            {rc === 'ask' ? (
              <>
                <Go label="Le compte est bon" onPress={() => { setCounted(''); setRc('saved'); }} />
                <View style={{ height: 10 }} />
                <SoftButton label="Il y a un écart" onPress={() => setRc('gap')} />
              </>
            ) : (
              <>
                <Field label="Montant compté" value={counted} onChangeText={setCounted} keyboardType="decimal-pad" placeholder="0,00" />
                {counted ? <Text style={{ color: countedC === expected ? t.green : t.orange, fontWeight: '700', marginBottom: 12, textAlign: 'center' }}>Écart : {eur(countedC - expected)}</Text> : null}
                <Go label="Enregistrer l'écart" disabled={!counted} onPress={() => setRc('saved')} />
              </>
            )}
          </>
        )}
      </Sheet>
    </ScrollView>
  );
}

function ZHead({ label }: { label: string }) {
  const { t } = useT();
  return <Text style={{ color: t.grey, fontWeight: '700', marginTop: 14, marginBottom: 4 }}>{label}</Text>;
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
  connDot: { position: 'absolute', top: 4, right: 4, width: 10, height: 10, borderRadius: 5, borderWidth: 2 },
  section: { fontSize: 13, fontWeight: '700', letterSpacing: 0.5, marginTop: 6, marginBottom: 8, marginLeft: 2 },
  pending: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16, padding: 12, marginBottom: 8, borderWidth: 2 },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderStyle: 'dashed', borderRadius: 14, padding: 12, marginTop: 4 },
  scanBtn: { width: 48, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 14 },
  item: { width: '48%', flexGrow: 1, borderRadius: 18, overflow: 'hidden', borderWidth: 2 },
  itemArt: { height: 78, alignItems: 'center', justifyContent: 'center' },
  plus: { width: 32, height: 32, borderRadius: 16, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  qty: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  payBig: { flex: 1, height: 96, borderRadius: 18, alignItems: 'center', justifyContent: 'center', gap: 6 },
  payTxt: { fontSize: 18, fontWeight: '700' },
  clear: { flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', borderRadius: 12, paddingVertical: 12, marginTop: 10 },
  ok: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', marginVertical: 14 },
  closeBtn: { flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', borderRadius: 16, paddingVertical: 16 },
});
