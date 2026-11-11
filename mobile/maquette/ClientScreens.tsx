// MAQUETTE — espace client (compte.html) et prise de RDV (rdv.html), version téléphone, reprise fonction par fonction :
// connexion, inscription avec confirmation de l'email (renvoi du lien), mot de passe oublié, profil et mot de passe,
// indicatif par pays, proches, historique des passages (détail, note, « Reprendre ce RDV »), cartes cadeaux,
// réservation (catégories, recherche, suppléments puis produits, « suppléments seuls », premier disponible puis choix
// du coiffeur au créneau, Matin / Après-midi, congés grisés, code cadeau), réservation à plusieurs, réservation sans
// compte avec code à 6 chiffres, confirmation avec retour au site du salon, annulation depuis le lien de l'email.
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradientFallback } from './gradient';
import { Avatar, BackLink, Card, Chips, Eyebrow, Field, Go, Pill, RowLink, Segmented, Sheet, SoftButton, useT } from './ui';
import { BARBERS, CATEGORIES, CLIENT, Day, EXTRAS, GIFT_CARDS, OFF, PHONE_CC, PRODUCTS, SERVICES, Salon, dur, eur, nextDays, slotsFor } from './data';

type IconName = React.ComponentProps<typeof Ionicons>['name'];
export type Prefill = { serviceId?: string; barberId?: string; extras?: string[]; gift?: string } | null;

/* ------------------------------------------------------------------ Accueil */

export function HomeTab({ onBook, onRebook }: { onBook: (p?: Prefill) => void; onRebook: (p: Prefill) => void }) {
  const { t } = useT();
  const next = CLIENT.nextAppointment;
  const [sheet, setSheet] = useState<'note' | 'cancel' | 'history' | null>(null);
  const [cancelled, setCancelled] = useState(false);
  const [note, setNote] = useState('');
  return (
    <ScrollView contentContainerStyle={st.page} showsVerticalScrollIndicator={false}>
      <Text style={[st.hello, { color: t.ink }]}>Bonjour {CLIENT.name}</Text>

      <Eyebrow>Prochain rendez-vous</Eyebrow>
      {cancelled ? (
        <Card style={{ backgroundColor: t.fill }}>
          <Text style={[st.meta, { color: t.grey, marginTop: 0 }]}>Aucun rendez-vous à venir.</Text>
          <Pressable onPress={() => onBook()} style={{ marginTop: 10 }}><Text style={{ color: t.blue, fontWeight: '600' }}>Prendre rendez-vous</Text></Pressable>
        </Card>
      ) : (
        <Card>
          <View style={st.row}>
            <View style={[st.dateBadge, { backgroundColor: t.blueSoft }]}>
              <Text style={[st.dateBadgeDay, { color: t.blue }]}>SAM</Text>
              <Text style={[st.dateBadgeNum, { color: t.blue }]}>14</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[st.strong, { color: t.ink }]}>{next.day} · {next.time}</Text>
              <Text style={[st.meta, { color: t.grey }]}>{next.service} avec {next.barber} · {eur(next.priceCents)}</Text>
              {next.paidWithGift ? <View style={{ marginTop: 4 }}><Pill label="🎁 Payé avec une carte cadeau" tone="green" /></View> : null}
            </View>
          </View>
          {note ? <Text style={[st.meta, { color: t.ink, marginTop: 10, fontStyle: 'italic' }]}>Note : {note}</Text> : null}
          <View style={[st.row, { marginTop: 14, gap: 10 }]}>
            <View style={{ flex: 1 }}><SoftButton label={note ? 'Modifier la note' : 'Ajouter une note'} onPress={() => setSheet('note')} /></View>
            <View style={{ flex: 1 }}><SoftButton label="Annuler" danger onPress={() => setSheet('cancel')} /></View>
          </View>
        </Card>
      )}

      <Eyebrow>Fidélité</Eyebrow>
      <LinearGradientFallback colors={['#0a84ff', '#5e5ce6']} style={st.cardArt}><View style={st.shine} /></LinearGradientFallback>
      <View style={[st.cardInfo, { backgroundColor: t.card, borderColor: t.sep }]}>
        <View style={[st.row, { justifyContent: 'space-between' }]}>
          <View style={[st.logo, { backgroundColor: t.fill }]}><Ionicons name="cut" size={22} color={t.ink} /></View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={[st.big, { color: t.ink }]}>{CLIENT.points}</Text>
            <Text style={[st.meta, { color: t.grey }]}>points de fidélité</Text>
          </View>
        </View>
      </View>
      <View style={st.tiers}>
        {CLIENT.tiers.map((tier) => {
          const pct = Math.min(1, CLIENT.points / tier.need);
          return (
            <View key={tier.label} style={[st.tier, { backgroundColor: t.card }]}>
              <View style={[st.row, { justifyContent: 'space-between' }]}>
                <Text style={[st.tierLbl, { color: t.ink }]} numberOfLines={1}>{tier.label}</Text>
                <Text style={[st.tierLbl, { color: t.grey }]}>{tier.need}</Text>
              </View>
              <View style={[st.bar, { backgroundColor: t.fill }]}><View style={[st.barFill, { width: `${pct * 100}%`, backgroundColor: pct >= 1 ? t.green : t.blue }]} /></View>
              <Text style={[st.tierHint, { color: pct >= 1 ? t.green : t.grey }]}>{pct >= 1 ? 'Disponible' : `Encore ${tier.need - CLIENT.points} pts`}</Text>
            </View>
          );
        })}
      </View>

      <Eyebrow>Carte cadeau</Eyebrow>
      <LinearGradientFallback colors={['#7c3aed', '#db2777']} style={[st.cardArt, { aspectRatio: 9 / 3 }]}><View style={st.shine} /></LinearGradientFallback>
      <View style={[st.cardInfo, { backgroundColor: t.card, borderColor: t.sep }]}>
        <View style={[st.row, { justifyContent: 'space-between' }]}>
          <View>
            <Text style={[st.strong, { color: t.ink }]}>Offerte par {CLIENT.giftCard.from}</Text>
            <Text style={[st.meta, { color: t.grey }]}>Code {CLIENT.giftCard.code}</Text>
          </View>
          <Text style={[st.big, { color: t.ink }]}>{eur(CLIENT.giftCard.amountCents)}</Text>
        </View>
        <Pressable onPress={() => onBook({ gift: CLIENT.giftCard.code })} style={[st.useGift, { backgroundColor: t.blueSoft }]}>
          <Ionicons name="gift-outline" size={17} color={t.blue} /><Text style={{ color: t.blue, fontWeight: '700' }}>Utiliser cette carte pour un rendez-vous</Text>
        </Pressable>
      </View>

      <View style={[st.row, { justifyContent: 'space-between' }]}>
        <Eyebrow>Dernier passage</Eyebrow>
        <Pressable onPress={() => setSheet('history')} style={{ marginTop: 12 }}><Text style={{ color: t.blue, fontWeight: '600' }}>Historique</Text></Pressable>
      </View>
      <Card style={{ backgroundColor: t.fill }}>
        <Text style={[st.strong, { color: t.ink }]}>{CLIENT.lastVisit.day}</Text>
        <Text style={[st.meta, { color: t.grey }]}>{CLIENT.lastVisit.service} avec {CLIENT.lastVisit.barber} · {eur(CLIENT.lastVisit.priceCents)}</Text>
        <Pressable onPress={() => onRebook({ serviceId: CLIENT.visits[0].serviceId, barberId: CLIENT.visits[0].barberId })} style={{ marginTop: 10 }}>
          <Text style={{ color: t.blue, fontWeight: '700' }}>↻ Reprendre ce RDV</Text>
        </Pressable>
      </Card>

      <View style={{ height: 18 }} />
      <Go label="Prendre rendez-vous" icon="calendar-outline" onPress={() => onBook()} />
      <View style={{ height: 24 }} />

      <Sheet visible={sheet === 'note'} onClose={() => setSheet(null)} title="Note pour votre coiffeur">
        <Text style={[st.meta, { color: t.grey, marginBottom: 10, textAlign: 'center' }]}>Elle sera visible par {next.barber} sur son poste.</Text>
        <TextInput value={note} onChangeText={setNote} placeholder="Ex : dégradé américain, je serai 5 min en retard…" placeholderTextColor={t.grey} multiline
          style={[st.input, { backgroundColor: t.fill, borderColor: t.fill, color: t.ink, minHeight: 90, textAlignVertical: 'top' }]} />
        <View style={{ height: 14 }} />
        <Go label="Enregistrer la note" onPress={() => setSheet(null)} />
      </Sheet>
      <Sheet visible={sheet === 'cancel'} onClose={() => setSheet(null)} title="Annuler ce rendez-vous ?">
        <Text style={[st.doneSub, { color: t.grey, marginTop: 0 }]}>{next.day} à {next.time} · {next.service} avec {next.barber}</Text>
        <Text style={[st.doneSub, { color: t.grey }]}>Le créneau sera rendu aux autres clients. Cette action est définitive.{next.paidWithGift ? `\nLe montant (${eur(next.priceCents)}) est recrédité sur votre carte cadeau.` : ''}</Text>
        <View style={{ height: 18 }} />
        <Pressable onPress={() => { setCancelled(true); setSheet(null); }} style={({ pressed }) => [st.dangerBtn, { backgroundColor: t.red, opacity: pressed ? 0.85 : 1 }]}>
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>Annuler le rendez-vous</Text>
        </Pressable>
        <View style={{ height: 10 }} />
        <SoftButton label="Garder mon rendez-vous" onPress={() => setSheet(null)} />
      </Sheet>
      <Sheet visible={sheet === 'history'} onClose={() => setSheet(null)} title="Historique des passages">
        <History onRebook={(p) => { setSheet(null); onRebook(p); }} />
      </Sheet>
    </ScrollView>
  );
}

function History({ onRebook }: { onRebook: (p: Prefill) => void }) {
  const { t } = useT();
  const [open, setOpen] = useState<number | null>(0);
  const [notes, setNotes] = useState<Record<number, string>>({});
  return (
    <View>
      {CLIENT.visits.map((v, i) => (
        <View key={i} style={{ borderBottomWidth: StyleSheet.hairlineWidth, borderColor: t.sep, paddingVertical: 12 }}>
          <Pressable onPress={() => setOpen(open === i ? null : i)} style={st.row}>
            <View style={{ flex: 1 }}>
              <Text style={[st.strong, { color: t.ink }]}>{v.day}</Text>
              <Text style={[st.meta, { color: t.grey }]}>{v.service} avec {v.barber}</Text>
            </View>
            <Text style={{ color: t.ink, fontWeight: '700' }}>{eur(v.priceCents)}</Text>
            <Ionicons name={open === i ? 'chevron-up' : 'chevron-down'} size={18} color={t.grey} />
          </Pressable>
          {open === i ? (
            <View style={{ marginTop: 10, gap: 6 }}>
              {[['Prestation', v.service], ['Suppléments', v.extras.join(', ') || '—'], ['Produits', v.products.join(', ') || '—'], ['Payé', v.paid]].map(([k, x]) => (
                <View key={k} style={[st.row, { justifyContent: 'space-between' }]}><Text style={{ color: t.grey }}>{k}</Text><Text style={{ color: t.ink }}>{x}</Text></View>
              ))}
              <TextInput value={notes[i] ?? ''} onChangeText={(x) => setNotes({ ...notes, [i]: x })} placeholder="Ma note sur cette visite (ex : bien court sur les côtés)" placeholderTextColor={t.grey}
                style={[st.input, { backgroundColor: t.fill, borderColor: t.fill, color: t.ink, marginTop: 6 }]} />
              <Pressable onPress={() => onRebook({ serviceId: v.serviceId, barberId: v.barberId, extras: EXTRAS.filter((e) => v.extras.includes(e.name)).map((e) => e.id) })} style={{ marginTop: 4 }}>
                <Text style={{ color: t.blue, fontWeight: '700' }}>↻ Reprendre ce RDV</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      ))}
    </View>
  );
}

/* --------------------------------------------------------- Prise de RDV */

type Step = 'who' | 'name' | 'service' | 'extras' | 'products' | 'barber' | 'slot' | 'confirm' | 'contact' | 'verify' | 'cart' | 'done' | 'cancelLink';
const STEPS: Step[] = ['service', 'extras', 'products', 'barber', 'slot', 'confirm'];
type Person = { name: string; serviceId: string; extras: string[]; products: string[]; barberId: string; dayKey: string; slot: string };
const EXTRAS_ONLY = 'extras-only';

const toMin = (h: string) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5));
const toHm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const svcMinutes = (id: string, extras: string[]) => (id === EXTRAS_ONLY ? 10 * Math.max(1, extras.length) : SERVICES.find((x) => x.id === id)?.minutes ?? 30);
const endOf = (p: Person) => toHm(Math.ceil((toMin(p.slot) + svcMinutes(p.serviceId, p.extras)) / 15) * 15);
const priceOf = (id: string, extras: string[], products: string[]) => (SERVICES.find((x) => x.id === id)?.priceCents ?? 0)
  + EXTRAS.filter((e) => extras.includes(e.id)).reduce((a, e) => a + e.priceCents, 0) + PRODUCTS.filter((p) => products.includes(p.id)).reduce((a, p) => a + p.priceCents, 0);
const barberOff = (barberId: string, dayIdx: number) => (OFF[dayIdx] ?? []).find((o) => o.barberId === barberId)?.why;

export function BookTab({ salon, onFinished, prefill, guest, onExitGuest }: { salon: Salon; onFinished: () => void; prefill?: Prefill; guest?: boolean; onExitGuest?: () => void }) {
  const { t } = useT();
  const days = useMemo(() => nextDays(10), []);
  const firstOpen = days.find((d) => !d.closed)?.key ?? days[0].key;
  const [step, setStep] = useState<Step>(prefill?.serviceId ? 'barber' : 'who');
  const [group, setGroup] = useState(false);
  const [cart, setCart] = useState<Person[]>([]);
  const [name, setName] = useState('');
  const [serviceId, setServiceId] = useState<string | null>(prefill?.serviceId ?? null);
  const [extras, setExtras] = useState<string[]>(prefill?.extras ?? []);
  const [products, setProducts] = useState<string[]>([]);
  const [barberId, setBarberId] = useState<string | null>(prefill?.barberId ?? null);
  const [slotBarber, setSlotBarber] = useState<string>('any');
  const [dayKey, setDayKey] = useState(firstOpen);
  const [half, setHalf] = useState<'morning' | 'afternoon'>('morning');
  const [slot, setSlot] = useState<string | null>(null);
  const [cat, setCat] = useState<string>('all');
  const [q, setQ] = useState('');
  const [gift, setGift] = useState(prefill?.gift ?? '');
  const [giftOpen, setGiftOpen] = useState(!!prefill?.gift);

  const idx = cart.length;
  const who = idx === 0 ? 'vous' : name || `Personne ${idx + 1}`;
  const service = SERVICES.find((x) => x.id === serviceId) ?? null;
  const extrasOnly = serviceId === EXTRAS_ONLY;
  const barber = BARBERS.find((x) => x.id === barberId) ?? null;
  const dayIdx = days.findIndex((d) => d.key === dayKey);
  const day = days[dayIdx] as Day;
  const total = priceOf(serviceId ?? '', extras, products);
  const giftCard = GIFT_CARDS[gift.trim().toUpperCase()];
  const giftCents = giftCard ? Math.min(giftCard.balanceCents, total) : 0;
  const cartTotal = cart.reduce((a, p) => a + priceOf(p.serviceId, p.extras, p.products), 0);
  const freeAt = BARBERS.filter((b) => b.id !== 'any' && !barberOff(b.id, dayIdx) && slot && (toMin(slot) + dayIdx * 7 + b.id.length) % 3 !== 0);

  const resetPerson = () => { setName(''); setServiceId(null); setExtras([]); setProducts([]); setBarberId(null); setSlot(null); setSlotBarber('any'); };
  const resetAll = () => { resetPerson(); setCart([]); setGroup(false); setDayKey(firstOpen); setStep('who'); setGift(''); setGiftOpen(false); };
  const order: Step[] = guest ? ['service', 'extras', 'products', 'barber', 'slot', 'confirm', 'contact', 'verify'] : STEPS;
  const back = () => {
    if (step === 'name' || (step === 'service' && idx === 0)) { if (idx > 0) { setStep('cart'); resetPerson(); } else setStep('who'); return; }
    if (step === 'service') return setStep('name');
    setStep(order[order.indexOf(step) - 1]);
  };
  const commitPerson = () => {
    if (!serviceId || !barberId || !slot) return;
    setCart((c) => [...c, { name: idx === 0 ? 'Vous' : name || `Personne ${idx + 1}`, serviceId, extras, products, barberId: barberId === 'any' ? slotBarber : barberId, dayKey, slot }]);
    resetPerson(); setStep('cart');
  };
  const nextStep = () => {
    if (step === 'name') return setStep('service');
    if (step === 'slot' && group) return commitPerson();
    if (step === 'verify') return setStep('done');
    if (step === 'confirm' && !guest) return setStep('done');
    setStep(order[order.indexOf(step) + 1]);
  };

  /* Raccourcis « venir ensemble » du web (rdv.html). */
  const together = useMemo(() => {
    if (step !== 'slot' || idx === 0) return { opts: [] as { label: string; sub: string; time: string; barberId: string }[], sameDays: [] as { label: string; key: string }[] };
    const opts: { label: string; sub: string; time: string; barberId: string }[] = [];
    const sameDays: { label: string; key: string }[] = [];
    cart.forEach((p) => {
      if (p.dayKey !== dayKey) { if (!sameDays.find((x) => x.key === p.dayKey)) sameDays.push({ label: `Le même jour que ${p.name === 'Vous' ? 'vous' : p.name}`, key: p.dayKey }); return; }
      const sameBarber = barberId === p.barberId || barberId === 'any';
      if (sameBarber) opts.push({ label: p.name === 'Vous' ? 'Juste après vous' : `À la suite de ${p.name}`, sub: `${endOf(p)} avec ${BARBERS.find((b) => b.id === p.barberId)?.name}`, time: endOf(p), barberId: p.barberId });
      if (barberId !== p.barberId) {
        const other = BARBERS.find((b) => b.id !== 'any' && b.id !== p.barberId && (barberId === 'any' || b.id === barberId));
        if (other) opts.push({ label: `En même temps que ${p.name === 'Vous' ? 'vous' : p.name}`, sub: `${p.slot} avec ${other.name}`, time: p.slot, barberId: other.id });
      }
    });
    return { opts, sameDays };
  }, [step, idx, cart, dayKey, barberId]);

  if (step === 'done') {
    const list = group ? cart : null;
    return (
      <ScrollView contentContainerStyle={[st.page, { alignItems: 'center', paddingTop: 30 }]}>
        <View style={[st.check, { backgroundColor: t.green }]}><Ionicons name="checkmark" size={34} color="#fff" /></View>
        <Text style={[st.doneTitle, { color: t.ink }]}>{list ? `${list.length} rendez-vous confirmés` : 'Rendez-vous confirmé'}</Text>
        {list ? list.map((p, i) => {
          const d = days.find((x) => x.key === p.dayKey) as Day;
          return <Text key={i} style={[st.doneSub, { color: t.grey, marginTop: 4 }]}>{p.name} · {d.dow} {d.num} à {p.slot} · {SERVICES.find((x) => x.id === p.serviceId)?.name ?? 'Suppléments'}</Text>;
        }) : (
          <Text style={[st.doneSub, { color: t.grey }]}>{day.dow} {day.num} {day.month} à {slot} · {extrasOnly ? 'Suppléments' : service?.name} avec {barberId === 'any' ? BARBERS.find((b) => b.id === slotBarber)?.name ?? 'le premier coiffeur disponible' : barber?.name}</Text>
        )}
        {giftCents ? <Text style={[st.doneSub, { color: t.green }]}>🎁 {eur(giftCents)} payés avec la carte cadeau</Text> : null}
        <Text style={[st.doneSub, { color: t.grey, marginTop: 10 }]}>Un email de confirmation (avec le lien pour annuler) et un rappel la veille vous seront envoyés.</Text>
        <View style={{ height: 22, alignSelf: 'stretch' }} />
        <View style={{ alignSelf: 'stretch' }}><Go label={guest ? 'Terminé' : "Retour à l'accueil"} onPress={() => { resetAll(); if (guest) onExitGuest?.(); else onFinished(); }} /></View>
        <Pressable style={{ marginTop: 16 }}><Text style={{ color: t.blue, fontWeight: '600' }}>Retour au site du salon</Text></Pressable>
        <Pressable onPress={() => setStep('cancelLink')} style={{ marginTop: 16 }}><Text style={{ color: t.grey, fontSize: 13 }}>Démo : ouvrir le lien « Annuler mon rendez-vous » de l'email</Text></Pressable>
      </ScrollView>
    );
  }

  if (step === 'cancelLink') return <CancelByLink when={`${day.dow} ${day.num} ${day.month} à ${slot ?? '10:30'}`} what={`${service?.name ?? 'Coupe'} · ${salon.name} ${salon.city}`} onDone={() => { resetAll(); if (guest) onExitGuest?.(); else onFinished(); }} />;

  const showBar = !['who', 'cart', 'verify'].includes(step);
  const disabled = (step === 'service' && !serviceId) || (step === 'extras' && extrasOnly && !extras.length) || (step === 'barber' && !barber) || (step === 'slot' && !slot);
  const services = SERVICES.filter((x) => (cat === 'all' || x.cat === cat) && x.name.toLowerCase().includes(q.trim().toLowerCase()));

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={st.page} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {step !== 'who' && step !== 'cart' ? <BackLink onPress={back} /> : guest ? <BackLink onPress={() => onExitGuest?.()} label="Connexion" /> : null}
        {order.includes(step) ? <Progress index={order.indexOf(step)} n={order.length} /> : null}
        {group && STEPS.includes(step) ? <View style={{ alignItems: 'center', marginBottom: 6 }}><Pill label={idx === 0 ? 'Vous' : who} icon="person" /></View> : null}

        {step === 'who' && (
          <>
            <Text style={[st.question, { color: t.ink }]}>Pour qui est le rendez-vous ?</Text>
            <ChoiceCard icon="person-outline" title="Juste moi" sub="Un rendez-vous pour une personne" onPress={() => { setGroup(false); setStep('service'); }} />
            {!guest ? <ChoiceCard icon="people-outline" title="Plusieurs personnes" sub="Enfants, amis, famille — jusqu'à 6" accent onPress={() => { setGroup(true); setStep('service'); }} /> : null}
            {prefill?.gift ? <View style={{ alignItems: 'center', marginTop: 4 }}><Pill label={`🎁 Carte cadeau ${prefill.gift} appliquée à la fin`} tone="green" /></View> : null}
            <Text style={[st.foot, { color: t.grey }]}>{salon.name} · {salon.city}</Text>
          </>
        )}

        {step === 'name' && (
          <>
            <Text style={[st.question, { color: t.ink }]}>Qui vient avec vous ?</Text>
            <Chips items={[{ key: 'Léo (8 ans)', label: 'Léo (8 ans)' }, { key: 'Sophie', label: 'Sophie' }]} value={[name]} onToggle={setName} />
            <Text style={[st.meta, { color: t.grey, marginTop: 14, marginBottom: 6 }]}>Ou un autre prénom</Text>
            <TextInput value={name} onChangeText={setName} placeholder="Prénom" placeholderTextColor={t.grey} style={[st.input, { backgroundColor: t.card, borderColor: t.sep, color: t.ink }]} />
          </>
        )}

        {step === 'service' && (
          <>
            <Text style={[st.question, { color: t.ink }]}>{idx === 0 ? 'Quelle prestation ?' : `Prestation pour ${who}`}</Text>
            <View style={[st.search, { backgroundColor: t.card }]}>
              <Ionicons name="search" size={17} color={t.grey} />
              <TextInput value={q} onChangeText={setQ} placeholder="Rechercher une prestation" placeholderTextColor={t.grey} style={{ flex: 1, color: t.ink, fontSize: 15, paddingVertical: 10 }} />
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 12 }}>
              {[{ id: 'all', name: 'Tout', color: t.grey }, ...CATEGORIES].map((c) => (
                <Pressable key={c.id} onPress={() => setCat(c.id)} style={[st.catChip, { backgroundColor: cat === c.id ? c.color : t.card, borderColor: c.color }]}>
                  <Text style={{ color: cat === c.id ? '#fff' : t.ink, fontWeight: '600' }}>{c.name}</Text>
                </Pressable>
              ))}
            </ScrollView>
            <View style={st.grid}>
              {services.map((x) => {
                const on = x.id === serviceId;
                const color = CATEGORIES.find((c) => c.id === x.cat)?.color ?? t.blue;
                return (
                  <Pressable key={x.id} onPress={() => setServiceId(x.id)} style={({ pressed }) => [st.svc, { backgroundColor: on ? t.blue : t.fill, transform: [{ scale: pressed ? 0.96 : 1 }] }]}>
                    <View style={[st.catDot, { backgroundColor: color }]} />
                    <Ionicons name={x.icon as IconName} size={30} color={on ? '#fff' : t.ink} />
                    <Text style={[st.svcName, { color: on ? '#fff' : t.ink }]}>{x.name}</Text>
                    <Text style={[st.svcMeta, { color: on ? 'rgba(255,255,255,.85)' : t.grey }]}>{dur(x.minutes)} · {eur(x.priceCents)}</Text>
                  </Pressable>
                );
              })}
              <Pressable onPress={() => setServiceId(EXTRAS_ONLY)} style={[st.svc, { backgroundColor: extrasOnly ? t.blue : 'transparent', borderWidth: 1.5, borderStyle: 'dashed', borderColor: t.sep }]}>
                <Ionicons name="add-circle-outline" size={30} color={extrasOnly ? '#fff' : t.ink} />
                <Text style={[st.svcName, { color: extrasOnly ? '#fff' : t.ink }]}>Suppléments seuls</Text>
                <Text style={[st.svcMeta, { color: extrasOnly ? 'rgba(255,255,255,.85)' : t.grey }]}>Sans prestation</Text>
              </Pressable>
            </View>
            {services.length === 0 ? <Text style={{ color: t.grey, textAlign: 'center', marginTop: 10 }}>Aucune prestation ne correspond.</Text> : null}
          </>
        )}

        {step === 'extras' && (
          <>
            <Text style={[st.question, { color: t.ink }]}>{extrasOnly ? 'Quels suppléments ?' : 'Un supplément ?'}</Text>
            {EXTRAS.map((e) => {
              const on = extras.includes(e.id);
              return (
                <Pressable key={e.id} onPress={() => setExtras((p) => (on ? p.filter((i) => i !== e.id) : [...p, e.id]))} style={[st.barber, { backgroundColor: t.card, borderColor: on ? t.blue : 'transparent' }]}>
                  <Ionicons name={on ? 'checkmark-circle' : 'add-circle-outline'} size={26} color={on ? t.blue : t.grey} />
                  <Text style={[st.strong, { color: t.ink, flex: 1 }]}>{e.name}</Text>
                  <Text style={{ color: t.grey }}>+{eur(e.priceCents)}</Text>
                </Pressable>
              );
            })}
            {!extrasOnly ? <Text style={[st.foot, { color: t.grey }]}>Facultatif : « Suivant » pour passer.</Text> : null}
          </>
        )}

        {step === 'products' && (
          <>
            <Text style={[st.question, { color: t.ink }]}>Un produit à préparer ?</Text>
            <Text style={[st.foot, { color: t.grey, marginTop: -8, marginBottom: 12 }]}>Il vous attendra au salon, vous le réglez sur place.</Text>
            {PRODUCTS.map((p) => {
              const on = products.includes(p.id);
              return (
                <Pressable key={p.id} onPress={() => setProducts((l) => (on ? l.filter((i) => i !== p.id) : [...l, p.id]))} style={[st.barber, { backgroundColor: t.card, borderColor: on ? t.blue : 'transparent' }]}>
                  <Text style={{ fontSize: 28 }}>{p.emoji}</Text>
                  <Text style={[st.strong, { color: t.ink, flex: 1 }]}>{p.name}</Text>
                  <Text style={{ color: t.grey }}>{eur(p.priceCents)}</Text>
                  <Ionicons name={on ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={on ? t.blue : t.sep} />
                </Pressable>
              );
            })}
          </>
        )}

        {step === 'barber' && (
          <>
            <Text style={[st.question, { color: t.ink }]}>Avec quel coiffeur ?</Text>
            {BARBERS.map((b) => {
              const on = b.id === barberId;
              return (
                <Pressable key={b.id} onPress={() => setBarberId(b.id)} style={[st.barber, { backgroundColor: t.card, borderColor: on ? t.blue : 'transparent' }]}>
                  <Avatar initials={b.initials} color={b.color} />
                  <View style={{ flex: 1 }}>
                    <Text style={[st.strong, { color: t.ink }]}>{b.id === 'any' ? 'Premier disponible' : b.name}</Text>
                    {b.id === 'any' ? <Text style={[st.meta, { color: t.grey }]}>Vous choisirez le coiffeur une fois l'heure choisie</Text> : null}
                  </View>
                  <Ionicons name={on ? 'radio-button-on' : 'radio-button-off'} size={22} color={on ? t.blue : t.sep} />
                </Pressable>
              );
            })}
          </>
        )}

        {step === 'slot' && (
          <>
            <Text style={[st.question, { color: t.ink }]}>Quand ?</Text>
            {together.opts.length || together.sameDays.length ? (
              <View style={[st.gtBox, { backgroundColor: t.blueSoft }]}>
                <Text style={{ color: t.blue, fontWeight: '700', fontSize: 13, marginBottom: 8 }}>VENIR ENSEMBLE</Text>
                {together.opts.map((o) => {
                  const on = slot === o.time && barberId === o.barberId;
                  return (
                    <Pressable key={o.label} onPress={() => { setBarberId(o.barberId); setSlot(o.time); }} style={[st.gtOpt, { backgroundColor: on ? t.blue : t.card }]}>
                      <Ionicons name={o.label.startsWith('En même') ? 'people-outline' : 'arrow-forward-circle-outline'} size={20} color={on ? '#fff' : t.blue} />
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: on ? '#fff' : t.ink, fontWeight: '700', fontSize: 15 }}>{o.label}</Text>
                        <Text style={{ color: on ? 'rgba(255,255,255,.85)' : t.grey, fontSize: 13 }}>{o.sub}</Text>
                      </View>
                      {on ? <Ionicons name="checkmark-circle" size={20} color="#fff" /> : null}
                    </Pressable>
                  );
                })}
                {together.sameDays.map((d) => (
                  <Pressable key={d.key} onPress={() => { setDayKey(d.key); setSlot(null); }} style={[st.gtOpt, { backgroundColor: t.card }]}>
                    <Ionicons name="calendar-outline" size={20} color={t.blue} />
                    <Text style={{ color: t.ink, fontWeight: '700', fontSize: 15, flex: 1 }}>{d.label}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 4 }}>
              {days.map((d, i) => {
                const on = d.key === dayKey;
                const off = barberId && barberId !== 'any' ? barberOff(barberId, i) : undefined;
                const dis = d.closed || !!off;
                return (
                  <Pressable key={d.key} disabled={dis} onPress={() => { setDayKey(d.key); setSlot(null); }} style={[st.day, { backgroundColor: on ? t.blue : t.card, opacity: dis ? 0.4 : 1 }]}>
                    <Text style={[st.dayDow, { color: on ? 'rgba(255,255,255,.85)' : t.grey }]}>{d.dow}</Text>
                    <Text style={[st.dayNum, { color: on ? '#fff' : t.ink }]}>{d.num}</Text>
                    <Text style={[st.dayDow, { color: on ? 'rgba(255,255,255,.85)' : t.grey }]}>{d.closed ? 'fermé' : off ? 'congé' : d.month}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            <Segmented style={{ marginTop: 14 }} value={half} onChange={(v) => { setHalf(v); setSlot(null); }} items={[{ key: 'morning', label: 'Matin' }, { key: 'afternoon', label: 'Après-midi' }]} />
            <View style={[st.slots, { marginTop: 12 }]}>
              {slotsFor(day)[half].length === 0 ? <Text style={{ color: t.grey }}>Plus de créneau {half === 'morning' ? 'le matin' : "l'après-midi"} ce jour-là</Text> : slotsFor(day)[half].map((h) => {
                const on = h === slot;
                return (
                  <Pressable key={h} onPress={() => { setSlot(h); setSlotBarber('any'); }} style={[st.slot, { backgroundColor: on ? t.blue : t.fill }]}>
                    <Text style={{ color: on ? '#fff' : t.ink, fontWeight: '600', fontSize: 14.5 }}>{h}</Text>
                  </Pressable>
                );
              })}
            </View>
            {slot && barberId === 'any' ? (
              <View style={{ marginTop: 16 }}>
                <Text style={{ color: t.ink, fontWeight: '700', marginBottom: 8 }}>Avec qui à {slot} ?</Text>
                <Chips items={[{ key: 'any', label: 'Premier disponible' }, ...freeAt.map((b) => ({ key: b.id, label: b.name, color: b.color }))]} value={[slotBarber]} onToggle={setSlotBarber} />
              </View>
            ) : null}
          </>
        )}

        {step === 'confirm' && serviceId && barber && slot && (
          <>
            <Text style={[st.question, { color: t.ink }]}>Votre rendez-vous</Text>
            <Card>
              <Line icon="calendar-outline" label={`${day.dow} ${day.num} ${day.month} à ${slot}`} />
              <Line icon="cut-outline" label={extrasOnly ? 'Suppléments seuls' : `${service?.name} · ${dur(service?.minutes ?? 0)}`} />
              {extras.length ? <Line icon="add-circle-outline" label={EXTRAS.filter((e) => extras.includes(e.id)).map((e) => e.name).join(', ')} /> : null}
              {products.length ? <Line icon="bag-handle-outline" label={PRODUCTS.filter((p) => products.includes(p.id)).map((p) => p.name).join(', ')} /> : null}
              <Line icon="person-outline" label={barber.id === 'any' ? (slotBarber === 'any' ? 'Premier coiffeur disponible' : BARBERS.find((b) => b.id === slotBarber)!.name) : barber.name} />
              <Line icon="location-outline" label={`${salon.name} · ${salon.city}`} last />
            </Card>
            <Pressable onPress={() => setGiftOpen(!giftOpen)} style={[st.row, { marginTop: 14 }]}>
              <Ionicons name="gift-outline" size={18} color={t.blue} /><Text style={{ color: t.blue, fontWeight: '600' }}>J'ai une carte cadeau</Text>
            </Pressable>
            {giftOpen ? (
              <View style={{ marginTop: 8 }}>
                <TextInput value={gift} onChangeText={setGift} autoCapitalize="characters" placeholder="Code (ex : TBO-7F3K)" placeholderTextColor={t.grey} style={[st.input, { backgroundColor: t.card, borderColor: t.sep, color: t.ink }]} />
                {gift.length >= 8 ? <Text style={{ color: giftCard ? t.green : t.red, marginTop: 6 }}>{giftCard ? `✓ Carte de ${giftCard.from} · solde ${eur(giftCard.balanceCents)}` : 'Code inconnu'}</Text> : null}
              </View>
            ) : null}
            {giftCents ? <View style={[st.row, { justifyContent: 'space-between', marginTop: 12, paddingHorizontal: 4 }]}><Text style={{ color: t.green }}>Carte cadeau</Text><Text style={{ color: t.green, fontWeight: '700' }}>−{eur(giftCents)}</Text></View> : null}
            <View style={[st.row, { justifyContent: 'space-between', marginTop: 12, paddingHorizontal: 4 }]}>
              <Text style={[st.meta, { color: t.grey, fontSize: 15 }]}>{giftCents ? 'Reste à régler au salon' : 'Total'}</Text>
              <Text style={[st.big, { color: t.ink, fontSize: 22 }]}>{eur(total - giftCents)}</Text>
            </View>
          </>
        )}

        {step === 'contact' && <Contact />}
        {step === 'verify' && <VerifyCode email="eric@exemple.fr" onOk={() => setStep('done')} onRestart={() => setStep('contact')} />}

        {step === 'cart' && (
          <>
            <Text style={[st.question, { color: t.ink }]}>Votre réservation à plusieurs</Text>
            <Card style={{ paddingVertical: 4 }}>
              {cart.map((p, i) => {
                const d = days.find((x) => x.key === p.dayKey) as Day;
                const b = BARBERS.find((x) => x.id === p.barberId);
                return (
                  <View key={i} style={[st.row, { paddingVertical: 12, borderBottomWidth: i < cart.length - 1 ? StyleSheet.hairlineWidth : 0, borderColor: t.sep }]}>
                    <Avatar initials={p.name[0]} color={b?.color ?? t.blue} size={38} />
                    <View style={{ flex: 1 }}>
                      <Text style={[st.strong, { color: t.ink }]}>{p.name}</Text>
                      <Text style={[st.meta, { color: t.grey }]}>{SERVICES.find((x) => x.id === p.serviceId)?.name ?? 'Suppléments'} · {b?.id === 'any' ? 'Premier disponible' : b?.name}</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}><Text style={[st.strong, { color: t.ink }]}>{p.slot}</Text><Text style={[st.meta, { color: t.grey }]}>{d.dow} {d.num}</Text></View>
                  </View>
                );
              })}
            </Card>
            {cart.length < 6 ? (
              <Pressable onPress={() => { resetPerson(); setStep('name'); }} style={[st.addPerson, { borderColor: t.blue }]}>
                <Ionicons name="person-add-outline" size={20} color={t.blue} /><Text style={{ color: t.blue, fontWeight: '700', fontSize: 15 }}>Ajouter une personne</Text>
              </Pressable>
            ) : null}
            <View style={[st.row, { justifyContent: 'space-between', marginVertical: 16, paddingHorizontal: 4 }]}>
              <Text style={[st.meta, { color: t.grey, fontSize: 15 }]}>Total</Text><Text style={[st.big, { color: t.ink, fontSize: 22 }]}>{eur(cartTotal)}</Text>
            </View>
            <Go label={`Valider ${cart.length > 1 ? `les ${cart.length} rendez-vous` : 'le rendez-vous'}`} onPress={() => setStep('done')} />
          </>
        )}
      </ScrollView>

      {showBar ? (
        <View style={[st.stepBar, { backgroundColor: t.card, borderColor: t.sep }]}>
          <View style={{ flex: 1 }}>
            <Text style={[st.meta, { color: t.grey }]} numberOfLines={1}>
              {step === 'name' ? `Personne ${idx + 1}` : serviceId ? `${extrasOnly ? 'Suppléments' : service?.name}${extras.length ? ` + ${extras.length}` : ''}${products.length ? ` + ${products.length} produit${products.length > 1 ? 's' : ''}` : ''}` : 'Choisissez une prestation'}
              {barber && step !== 'name' ? ` · ${barber.id === 'any' ? 'Premier disponible' : barber.name}` : ''}
            </Text>
            <Text style={[st.strong, { color: t.ink }]}>{step === 'name' ? who : serviceId ? eur(total) : '—'}</Text>
          </View>
          <View style={{ width: 150 }}>
            <Go label={step === 'confirm' ? (guest ? 'Continuer' : 'Confirmer') : step === 'contact' ? 'Recevoir le code' : step === 'slot' && group ? 'Ajouter' : 'Suivant'} disabled={disabled} onPress={nextStep} />
          </View>
        </View>
      ) : null}
    </View>
  );
}

/** Coordonnées d'une réservation sans compte (nom, email, téléphone avec indicatif). */
function Contact() {
  const { t } = useT();
  return (
    <View>
      <Text style={[st.question, { color: t.ink }]}>Vos coordonnées</Text>
      <Field label="Nom" placeholder="Prénom et nom" />
      <Field label="Email" placeholder="vous@exemple.fr" keyboardType="email-address" autoCapitalize="none" />
      <PhoneField />
      <Text style={[st.foot, { color: t.grey, marginTop: 4 }]}>Un code à 6 chiffres va vous être envoyé par email pour confirmer le rendez-vous.</Text>
    </View>
  );
}

/** Téléphone avec indicatif (sélecteur de pays du web). */
export function PhoneField({ value }: { value?: string }) {
  const { t } = useT();
  const [cc, setCc] = useState(PHONE_CC[0]);
  const [open, setOpen] = useState(false);
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={{ color: t.grey, marginBottom: 6, fontWeight: '600' }}>Téléphone</Text>
      <View style={st.row}>
        <Pressable onPress={() => setOpen(true)} style={[st.ccBtn, { backgroundColor: t.fill }]}><Text style={{ fontSize: 18 }}>{cc.flag}</Text><Text style={{ color: t.ink, fontWeight: '600' }}>{cc.cc}</Text><Ionicons name="chevron-down" size={14} color={t.grey} /></Pressable>
        <TextInput defaultValue={value} placeholder="6 12 34 56 78" placeholderTextColor={t.grey} keyboardType="phone-pad" style={[st.input, { flex: 1, backgroundColor: t.fill, borderColor: t.fill, color: t.ink }]} />
      </View>
      <Sheet visible={open} onClose={() => setOpen(false)} title="Indicatif du pays">
        {PHONE_CC.map((c) => (
          <Pressable key={c.cc} onPress={() => { setCc(c); setOpen(false); }} style={[st.row, { paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: t.sep }]}>
            <Text style={{ fontSize: 22 }}>{c.flag}</Text><Text style={{ color: t.ink, flex: 1, fontSize: 16 }}>{c.name}</Text><Text style={{ color: t.grey }}>{c.cc}</Text>
            {c.cc === cc.cc ? <Ionicons name="checkmark" size={20} color={t.blue} /> : null}
          </Pressable>
        ))}
      </Sheet>
    </View>
  );
}

/** Code à 6 chiffres reçu par email (réservation sans compte) : minuteur, renvoi, recommencer. Maquette : 123456. */
function VerifyCode({ email, onOk, onRestart }: { email: string; onOk: () => void; onRestart: () => void }) {
  const { t } = useT();
  const [code, setCode] = useState('');
  const [left, setLeft] = useState(600);
  const [resent, setResent] = useState(false);
  useEffect(() => { const id = setInterval(() => setLeft((l) => Math.max(0, l - 1)), 1000); return () => clearInterval(id); }, []);
  const bad = code.length === 6 && code !== '123456';
  useEffect(() => { if (code === '123456') { const id = setTimeout(onOk, 300); return () => clearTimeout(id); } return undefined; }, [code]);
  return (
    <View style={{ alignItems: 'center' }}>
      <View style={[st.vfIc, { backgroundColor: t.blueSoft }]}><Ionicons name="mail-outline" size={32} color={t.blue} /></View>
      <Text style={{ color: t.ink, fontSize: 24, fontWeight: '800', marginTop: 14 }}>Vérifiez votre email</Text>
      <Text style={{ color: t.grey, fontSize: 15, textAlign: 'center', marginTop: 6 }}>Entrez le code envoyé à <Text style={{ color: t.ink, fontWeight: '700' }}>{email}</Text>{'\n'}(maquette : 123456)</Text>
      <View style={{ marginTop: 22, alignSelf: 'stretch' }}>
        <TextInput value={code} onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))} keyboardType="number-pad" maxLength={6}
          style={{ position: 'absolute', opacity: 0.02, width: '100%', height: 64, zIndex: 2, color: 'transparent' }} />
        <View style={[st.row, { justifyContent: 'center', gap: 8 }]}>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <React.Fragment key={i}>
              {i === 3 ? <View style={{ width: 10, height: 3, borderRadius: 2, backgroundColor: t.sep }} /> : null}
              <View style={[st.vfBox, { borderColor: bad ? t.red : i === code.length ? t.blue : t.sep, backgroundColor: t.card }]}>
                <Text style={{ color: bad ? t.red : t.ink, fontSize: 26, fontWeight: '700' }}>{code[i] ?? ''}</Text>
              </View>
            </React.Fragment>
          ))}
        </View>
      </View>
      {bad ? <Text style={{ color: t.red, fontWeight: '600', marginTop: 12 }}>Code incorrect</Text> : null}
      <View style={[st.row, { marginTop: 16 }]}>
        <Text style={{ color: t.grey }}>Expire dans</Text>
        <View style={[st.vfPill, { backgroundColor: t.blueSoft }]}><Text style={{ color: t.blue, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}</Text></View>
      </View>
      <Text style={{ color: t.grey, marginTop: 18 }}>Pas reçu ? <Text onPress={() => { setResent(true); setLeft(600); }} style={{ color: t.blue, fontWeight: '600' }}>{resent ? 'Code renvoyé ✓' : 'Renvoyer le code'}</Text></Text>
      <Pressable onPress={onRestart} style={{ marginTop: 14 }}><Text style={{ color: t.blue, fontWeight: '600' }}>Modifier mon email</Text></Pressable>
    </View>
  );
}

/** Page ouverte depuis le lien « Annuler mon rendez-vous » de l'email. */
function CancelByLink({ when, what, onDone }: { when: string; what: string; onDone: () => void }) {
  const { t } = useT();
  const [done, setDone] = useState(false);
  return (
    <View style={[st.page, { flex: 1, justifyContent: 'center' }]}>
      <Card style={{ padding: 22, alignItems: 'center' }}>
        <Ionicons name={done ? 'checkmark-circle' : 'calendar-clear-outline'} size={44} color={done ? t.green : t.grey} />
        <Text style={{ color: t.ink, fontSize: 22, fontWeight: '800', marginTop: 10 }}>{done ? 'Rendez-vous annulé' : 'Annuler mon rendez-vous'}</Text>
        <Text style={{ color: t.grey, textAlign: 'center', marginTop: 8 }}>{when}{'\n'}{what}</Text>
        <View style={{ height: 18 }} />
        {done ? <View style={{ alignSelf: 'stretch' }}><Go label="Fermer" onPress={onDone} /></View> : (
          <Pressable onPress={() => setDone(true)} style={[st.dangerBtn, { backgroundColor: t.red, alignSelf: 'stretch' }]}><Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>Annuler le rendez-vous</Text></Pressable>
        )}
      </Card>
    </View>
  );
}

function Progress({ index, n }: { index: number; n: number }) {
  const { t } = useT();
  return <View style={{ flexDirection: 'row', gap: 5, marginBottom: 18 }}>{[...Array(n)].map((_, i) => <View key={i} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: i <= index ? t.blue : t.fill2 }} />)}</View>;
}

function ChoiceCard({ icon, title, sub, accent, onPress }: { icon: IconName; title: string; sub: string; accent?: boolean; onPress: () => void }) {
  const { t } = useT();
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [st.choice, { backgroundColor: t.card, borderColor: accent ? t.blue : t.sep, transform: [{ scale: pressed ? 0.98 : 1 }] }]}>
      <View style={[st.choiceIcon, { backgroundColor: t.fill }]}><Ionicons name={icon} size={28} color={t.ink} /></View>
      <Text style={[st.choiceTitle, { color: t.ink }]}>{title}</Text>
      <Text style={[st.meta, { color: t.grey }]}>{sub}</Text>
    </Pressable>
  );
}

function Line({ icon, label, last }: { icon: IconName; label: string; last?: boolean }) {
  const { t } = useT();
  return (
    <View style={[st.row, { paddingVertical: 11, borderBottomWidth: last ? 0 : StyleSheet.hairlineWidth, borderColor: t.sep }]}>
      <Ionicons name={icon} size={19} color={t.blue} />
      <Text style={{ color: t.ink, fontSize: 15, flex: 1 }}>{label}</Text>
    </View>
  );
}

/* ------------------------------------------------------------------ Compte */

export function AccountTab({ salon, onChangeSalon }: { salon: Salon; onChangeSalon: () => void }) {
  const { t } = useT();
  const [edit, setEdit] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const [relOpen, setRelOpen] = useState(false);
  const [profile, setProfile] = useState({ name: 'Eric Dokatel', email: 'eric@exemple.fr', phone: '6 12 34 56 04' });
  const [relatives, setRelatives] = useState([{ name: 'Léo', age: '8 ans' }]);
  const [rel, setRel] = useState({ name: '', age: '' });
  const [saved, setSaved] = useState<string | null>(null);
  useEffect(() => { if (!saved) return; const id = setTimeout(() => setSaved(null), 2500); return () => clearTimeout(id); }, [saved]);
  return (
    <ScrollView contentContainerStyle={st.page} keyboardShouldPersistTaps="handled">
      <View style={[st.row, { justifyContent: 'space-between' }]}>
        <Eyebrow>Mes informations</Eyebrow>
        <Pressable onPress={() => setEdit(!edit)} style={{ marginTop: 12 }}><Text style={{ color: t.blue, fontWeight: '600' }}>{edit ? 'Annuler' : 'Modifier'}</Text></Pressable>
      </View>
      {edit ? (
        <Card>
          <Field label="Nom" value={profile.name} onChangeText={(v) => setProfile({ ...profile, name: v })} />
          <Field label="Email" value={profile.email} onChangeText={(v) => setProfile({ ...profile, email: v })} autoCapitalize="none" />
          <PhoneField value={profile.phone} />
          <Go label="Enregistrer" onPress={() => { setEdit(false); setSaved('Profil enregistré'); }} />
        </Card>
      ) : (
        <Card style={{ paddingVertical: 4 }}>
          <RowLink label="Nom" value={profile.name} />
          <RowLink label="Email" value={profile.email} />
          <RowLink label="Téléphone" value={`+33 ${profile.phone}`} last />
        </Card>
      )}
      <Card style={{ paddingVertical: 4, marginTop: 10 }}><RowLink label="Changer mon mot de passe" icon="key-outline" onPress={() => setPwOpen(true)} last /></Card>

      <Eyebrow>Mes proches</Eyebrow>
      <Card>
        {relatives.map((r, i) => (
          <View key={i} style={[st.row, { paddingVertical: 6 }]}>
            <Avatar initials={r.name[0] ?? '?'} color={['#ff9f0a', '#30a46c', '#bf5af2'][i % 3]} size={36} />
            <Text style={{ color: t.ink, fontSize: 15, flex: 1 }}>{r.name}{r.age ? ` · ${r.age}` : ''}</Text>
            <Pressable onPress={() => setRelatives((l) => l.filter((_, j) => j !== i))} hitSlop={8}><Ionicons name="trash-outline" size={19} color={t.red} /></Pressable>
          </View>
        ))}
        {relatives.length === 0 ? <Text style={{ color: t.grey }}>Aucun proche enregistré.</Text> : null}
        <Pressable onPress={() => setRelOpen(true)} style={{ marginTop: 12 }}><Text style={{ color: t.blue, fontWeight: '600' }}>+ Ajouter un proche</Text></Pressable>
      </Card>
      <Eyebrow>Mon salon</Eyebrow>
      <Card onPress={onChangeSalon}>
        <View style={st.row}>
          <Ionicons name="storefront-outline" size={22} color={t.blue} />
          <View style={{ flex: 1 }}><Text style={[st.strong, { color: t.ink }]}>{salon.name}</Text><Text style={[st.meta, { color: t.grey }]}>{salon.city}</Text></View>
          <Text style={{ color: t.blue, fontWeight: '600' }}>Changer</Text>
        </View>
      </Card>
      {saved ? <Text style={{ color: t.green, textAlign: 'center', marginTop: 14, fontWeight: '600' }}>✓ {saved}</Text> : null}

      <Sheet visible={pwOpen} onClose={() => setPwOpen(false)} title="Changer mon mot de passe">
        <Field label="Mot de passe actuel" secureTextEntry />
        <Field label="Nouveau mot de passe" secureTextEntry placeholder="8 caractères minimum" />
        <Text style={{ color: t.grey, fontSize: 12.5, marginBottom: 12 }}>Vos autres appareils seront déconnectés.</Text>
        <Go label="Enregistrer" onPress={() => { setPwOpen(false); setSaved('Mot de passe modifié'); }} />
      </Sheet>
      <Sheet visible={relOpen} onClose={() => setRelOpen(false)} title="Ajouter un proche">
        <Field label="Prénom" value={rel.name} onChangeText={(v) => setRel({ ...rel, name: v })} />
        <Field label="Âge (facultatif)" value={rel.age} onChangeText={(v) => setRel({ ...rel, age: v })} placeholder="Ex : 8 ans" />
        <Go label="Ajouter" disabled={!rel.name.trim()} onPress={() => { setRelatives((l) => [...l, rel]); setRel({ name: '', age: '' }); setRelOpen(false); }} />
      </Sheet>
    </ScrollView>
  );
}

/* ---------------------------------------------------- Connexion (compte.html) */

export function ClientLogin({ salon, onLogged, onBack, onGuest }: { salon: Salon; onLogged: () => void; onBack: () => void; onGuest: () => void }) {
  const { t } = useT();
  const [mode, setMode] = useState<'login' | 'signup' | 'verify' | 'forgot' | 'forgotSent' | 'reset'>('login');
  const [email, setEmail] = useState('eric@exemple.fr');
  const [resent, setResent] = useState(false);
  const titles: Record<typeof mode, [string, string]> = {
    login: ['Bon retour', 'Connectez-vous pour gérer votre compte'],
    signup: ['Créer un compte', 'Pour gérer vos rendez-vous, votre fidélité et vos cadeaux'],
    verify: ['Confirmez votre email', `Un lien de confirmation a été envoyé à ${email}. Ouvrez-le pour activer votre compte (vérifiez aussi vos spams).`],
    forgot: ['Mot de passe oublié', 'Entrez votre email : vous recevrez un lien pour choisir un nouveau mot de passe.'],
    forgotSent: ['Email envoyé', `Si un compte existe pour ${email}, un lien vient de lui être envoyé (valable 1 heure).`],
    reset: ['Nouveau mot de passe', 'Choisissez votre nouveau mot de passe.'],
  };
  return (
    <ScrollView contentContainerStyle={[st.page, { paddingTop: 8 }]} keyboardShouldPersistTaps="handled">
      <BackLink onPress={mode === 'login' ? onBack : () => setMode('login')} label={mode === 'login' ? 'Salons' : 'Connexion'} />
      <Card style={{ padding: 22, borderRadius: 24 }}>
        <Text style={{ color: t.grey, fontSize: 13, fontWeight: '600', letterSpacing: 0.6, textAlign: 'center' }}>{(salon.name + ' ' + salon.city).toUpperCase()}</Text>
        <Text style={{ color: t.ink, fontSize: 26, fontWeight: '700', textAlign: 'center', marginTop: 4 }}>{titles[mode][0]}</Text>
        <Text style={[st.meta, { color: t.grey, textAlign: 'center', marginBottom: 20 }]}>{titles[mode][1]}</Text>
        {mode === 'login' || mode === 'signup' || mode === 'forgot' ? (
          <>
            {mode === 'signup' ? <Field label="Nom" placeholder="Prénom et nom" /> : null}
            <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
            {mode === 'signup' ? <PhoneField /> : null}
            {mode !== 'forgot' ? <Field label="Mot de passe" defaultValue={mode === 'login' ? '••••••••' : ''} secureTextEntry placeholder="8 caractères minimum" /> : null}
            <View style={{ height: 6 }} />
            <Go label={mode === 'login' ? 'Se connecter' : mode === 'signup' ? 'Créer mon compte' : 'Envoyer le lien'} onPress={() => (mode === 'login' ? onLogged() : setMode(mode === 'signup' ? 'verify' : 'forgotSent'))} />
            {mode === 'login' ? (
              <View style={[st.row, { justifyContent: 'space-between', marginTop: 16 }]}>
                <Pressable onPress={() => setMode('signup')}><Text style={{ color: t.blue, fontWeight: '600' }}>Créer un compte</Text></Pressable>
                <Pressable onPress={() => setMode('forgot')}><Text style={{ color: t.blue, fontWeight: '500' }}>Mot de passe oublié ?</Text></Pressable>
              </View>
            ) : null}
          </>
        ) : null}
        {mode === 'verify' ? (
          <>
            <View style={{ alignItems: 'center', marginBottom: 16 }}><Ionicons name="mail-unread-outline" size={46} color={t.blue} /></View>
            <SoftButton label={resent ? 'Lien renvoyé ✓' : 'Renvoyer le lien de confirmation'} onPress={() => setResent(true)} />
            <View style={{ height: 10 }} />
            <Go label="Démo : j'ai cliqué sur le lien" onPress={onLogged} />
          </>
        ) : null}
        {mode === 'forgotSent' ? <Go label="Démo : ouvrir le lien reçu" onPress={() => setMode('reset')} /> : null}
        {mode === 'reset' ? (
          <>
            <Field label="Nouveau mot de passe" secureTextEntry placeholder="8 caractères minimum" />
            <Field label="Confirmer" secureTextEntry />
            <Go label="Enregistrer et me connecter" onPress={onLogged} />
          </>
        ) : null}
      </Card>
      {mode === 'login' ? (
        <Pressable onPress={onGuest} style={[st.guest, { borderColor: t.sep }]}>
          <Ionicons name="calendar-outline" size={20} color={t.ink} />
          <View style={{ flex: 1 }}><Text style={{ color: t.ink, fontWeight: '700' }}>Continuer sans compte</Text><Text style={{ color: t.grey, fontSize: 13 }}>Confirmation et lien d'annulation par email</Text></View>
          <Ionicons name="chevron-forward" size={18} color={t.grey} />
        </Pressable>
      ) : null}
      <Text style={[st.foot, { color: t.grey, marginTop: 16 }]}>Maquette : n'importe quel identifiant fonctionne.</Text>
    </ScrollView>
  );
}

const st = StyleSheet.create({
  page: { paddingHorizontal: 18, paddingBottom: 30 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  hello: { fontSize: 20, fontWeight: '700', marginTop: 4 },
  strong: { fontSize: 15.5, fontWeight: '600' },
  meta: { fontSize: 13.5, marginTop: 2 },
  big: { fontSize: 24, fontWeight: '700', letterSpacing: -0.4 },
  dateBadge: { width: 54, height: 58, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  dateBadgeDay: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  dateBadgeNum: { fontSize: 22, fontWeight: '800', marginTop: -2 },
  cardArt: { borderRadius: 18, aspectRatio: 9 / 4, overflow: 'hidden' },
  shine: { position: 'absolute', top: -40, right: -60, width: 220, height: 220, borderRadius: 110, backgroundColor: 'rgba(255,255,255,.14)' },
  cardInfo: { marginTop: 8, padding: 14, borderRadius: 18, borderWidth: StyleSheet.hairlineWidth },
  useGift: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, padding: 11, marginTop: 12, justifyContent: 'center' },
  logo: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  tiers: { flexDirection: 'row', gap: 10, marginTop: 10 },
  tier: { flex: 1, borderRadius: 14, padding: 12 },
  tierLbl: { fontSize: 13, fontWeight: '600', flexShrink: 1 },
  tierHint: { fontSize: 12, marginTop: 6 },
  bar: { height: 6, borderRadius: 99, marginTop: 8, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 99 },
  question: { fontSize: 20, fontWeight: '700', textAlign: 'center', marginBottom: 18, marginTop: 4 },
  choice: { borderWidth: 1.5, borderRadius: 18, paddingVertical: 24, paddingHorizontal: 16, alignItems: 'center', marginBottom: 12, gap: 6 },
  choiceIcon: { width: 62, height: 62, borderRadius: 31, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  choiceTitle: { fontSize: 18, fontWeight: '700' },
  foot: { textAlign: 'center', fontSize: 13, marginTop: 8 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, paddingHorizontal: 12 },
  catChip: { borderRadius: 99, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1.5 },
  catDot: { position: 'absolute', top: 10, right: 10, width: 8, height: 8, borderRadius: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  svc: { width: '48%', flexGrow: 1, borderRadius: 18, paddingVertical: 20, paddingHorizontal: 12, alignItems: 'center', gap: 6, minHeight: 112, justifyContent: 'center' },
  svcName: { fontSize: 14.5, fontWeight: '600', textAlign: 'center' },
  svcMeta: { fontSize: 12.5 },
  barber: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14, borderRadius: 16, borderWidth: 2, marginBottom: 10 },
  day: { width: 62, borderRadius: 14, paddingVertical: 10, alignItems: 'center' },
  dayDow: { fontSize: 11.5, fontWeight: '600' },
  dayNum: { fontSize: 20, fontWeight: '700', marginVertical: 1 },
  slots: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  slot: { width: '23%', flexGrow: 1, maxWidth: '25%', borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  dangerBtn: { borderRadius: 16, paddingVertical: 15, alignItems: 'center' },
  gtBox: { borderRadius: 16, padding: 12, marginBottom: 14, gap: 8 },
  gtOpt: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, padding: 12 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13, fontSize: 16 },
  ccBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 13 },
  addPerson: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1.5, borderStyle: 'dashed', borderRadius: 16, paddingVertical: 14, marginTop: 12 },
  stepBar: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth },
  check: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  doneTitle: { fontSize: 22, fontWeight: '800', textAlign: 'center' },
  doneSub: { fontSize: 15, textAlign: 'center', marginTop: 10, lineHeight: 21 },
  vfIc: { width: 68, height: 68, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  vfBox: { width: 46, height: 60, borderWidth: 1.5, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  vfPill: { borderRadius: 99, paddingHorizontal: 12, paddingVertical: 5 },
  guest: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1.5, borderRadius: 18, padding: 16, marginTop: 14 },
});
