// MAQUETTE — espace client (compte.html) et prise de RDV (rdv.html), version téléphone.
// Mêmes intitulés, même ordre, mêmes cartes que le web ; données fictives (data.ts).
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradientFallback } from './gradient';
import { Avatar, BackLink, Card, Eyebrow, Go, SoftButton, useT } from './ui';
import { BARBERS, CLIENT, Day, EXTRAS, SERVICES, Salon, dur, eur, nextDays, slotsFor } from './data';

/* ------------------------------------------------------------------ Accueil */

export function HomeTab({ onBook }: { onBook: () => void }) {
  const { t } = useT();
  const next = CLIENT.nextAppointment;
  return (
    <ScrollView contentContainerStyle={st.page} showsVerticalScrollIndicator={false}>
      <Text style={[st.hello, { color: t.ink }]}>Bonjour {CLIENT.name}</Text>

      <Eyebrow>Prochain rendez-vous</Eyebrow>
      <Card>
        <View style={st.row}>
          <View style={[st.dateBadge, { backgroundColor: t.blueSoft }]}>
            <Text style={[st.dateBadgeDay, { color: t.blue }]}>SAM</Text>
            <Text style={[st.dateBadgeNum, { color: t.blue }]}>14</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[st.strong, { color: t.ink }]}>{next.day} · {next.time}</Text>
            <Text style={[st.meta, { color: t.grey }]}>{next.service} avec {next.barber} · {eur(next.priceCents)}</Text>
          </View>
        </View>
        <View style={[st.row, { marginTop: 14, gap: 10 }]}>
          <View style={{ flex: 1 }}><SoftButton label="Ajouter une note" onPress={() => {}} /></View>
          <View style={{ flex: 1 }}><SoftButton label="Annuler" danger onPress={() => {}} /></View>
        </View>
      </Card>

      <Eyebrow>Fidélité</Eyebrow>
      <LinearGradientFallback colors={['#0a84ff', '#5e5ce6']} style={st.cardArt}>
        <View style={st.shine} />
      </LinearGradientFallback>
      <View style={[st.cardInfo, { backgroundColor: t.card, borderColor: t.sep }]}>
        <View style={[st.row, { justifyContent: 'space-between' }]}>
          <View style={[st.logo, { backgroundColor: t.fill }]}>
            <Ionicons name="cut" size={22} color={t.ink} />
          </View>
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
              <View style={[st.bar, { backgroundColor: t.fill }]}>
                <View style={[st.barFill, { width: `${pct * 100}%`, backgroundColor: pct >= 1 ? t.green : t.blue }]} />
              </View>
              <Text style={[st.tierHint, { color: pct >= 1 ? t.green : t.grey }]}>
                {pct >= 1 ? 'Disponible' : `Encore ${tier.need - CLIENT.points} pts`}
              </Text>
            </View>
          );
        })}
      </View>

      <Eyebrow>Carte cadeau</Eyebrow>
      <LinearGradientFallback colors={['#7c3aed', '#db2777']} style={[st.cardArt, { aspectRatio: 9 / 3 }]}>
        <View style={st.shine} />
      </LinearGradientFallback>
      <View style={[st.cardInfo, { backgroundColor: t.card, borderColor: t.sep }]}>
        <View style={[st.row, { justifyContent: 'space-between' }]}>
          <View>
            <Text style={[st.strong, { color: t.ink }]}>Offerte par {CLIENT.giftCard.from}</Text>
            <Text style={[st.meta, { color: t.grey }]}>Code {CLIENT.giftCard.code}</Text>
          </View>
          <Text style={[st.big, { color: t.ink }]}>{eur(CLIENT.giftCard.amountCents)}</Text>
        </View>
      </View>

      <Eyebrow>Dernier passage</Eyebrow>
      <Card style={{ backgroundColor: t.fill }}>
        <Text style={[st.strong, { color: t.ink }]}>{CLIENT.lastVisit.day}</Text>
        <Text style={[st.meta, { color: t.grey }]}>{CLIENT.lastVisit.service} avec {CLIENT.lastVisit.barber} · {eur(CLIENT.lastVisit.priceCents)}</Text>
      </Card>

      <View style={{ height: 18 }} />
      <Go label="Prendre rendez-vous" icon="calendar-outline" onPress={onBook} />
      <View style={{ height: 24 }} />
    </ScrollView>
  );
}

/* --------------------------------------------------------- Prise de RDV */

type Step = 'who' | 'service' | 'barber' | 'slot' | 'confirm' | 'done';
const STEPS: Step[] = ['service', 'barber', 'slot', 'confirm'];

export function BookTab({ salon, onFinished }: { salon: Salon; onFinished: () => void }) {
  const { t } = useT();
  const [step, setStep] = useState<Step>('who');
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [extras, setExtras] = useState<string[]>([]);
  const [barberId, setBarberId] = useState<string | null>(null);
  const days = useMemo(() => nextDays(10), []);
  const [dayKey, setDayKey] = useState(days.find((d) => !d.closed)?.key ?? days[0].key);
  const [slot, setSlot] = useState<string | null>(null);

  const service = SERVICES.find((x) => x.id === serviceId) ?? null;
  const barber = BARBERS.find((x) => x.id === barberId) ?? null;
  const day = days.find((d) => d.key === dayKey) as Day;
  const extrasCents = EXTRAS.filter((e) => extras.includes(e.id)).reduce((a, e) => a + e.priceCents, 0);
  const total = (service?.priceCents ?? 0) + extrasCents;
  const back = () => setStep(step === 'service' ? 'who' : STEPS[STEPS.indexOf(step) - 1]);

  if (step === 'done') {
    return (
      <View style={[st.page, { flex: 1, alignItems: 'center', justifyContent: 'center' }]}>
        <View style={[st.check, { backgroundColor: t.green }]}><Ionicons name="checkmark" size={34} color="#fff" /></View>
        <Text style={[st.doneTitle, { color: t.ink }]}>Rendez-vous confirmé</Text>
        <Text style={[st.doneSub, { color: t.grey }]}>
          {day.dow} {day.num} {day.month} à {slot} · {service?.name} avec {barber?.id === 'any' ? 'le premier coiffeur disponible' : barber?.name}
        </Text>
        <Text style={[st.doneSub, { color: t.grey, marginTop: 6 }]}>Un email de confirmation et un rappel la veille vous seront envoyés.</Text>
        <View style={{ height: 22, alignSelf: 'stretch' }} />
        <View style={{ alignSelf: 'stretch' }}><Go label="Retour à l'accueil" onPress={() => { setStep('who'); setServiceId(null); setBarberId(null); setSlot(null); setExtras([]); onFinished(); }} /></View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={st.page} showsVerticalScrollIndicator={false}>
        {step !== 'who' ? <BackLink onPress={back} /> : null}
        {step !== 'who' ? <Progress index={STEPS.indexOf(step)} /> : null}

        {step === 'who' && (
          <>
            <Text style={[st.question, { color: t.ink }]}>Pour qui est le rendez-vous ?</Text>
            <ChoiceCard icon="person-outline" title="Juste moi" sub="Un rendez-vous pour une personne" onPress={() => setStep('service')} />
            <ChoiceCard icon="people-outline" title="Plusieurs personnes" sub="Enfants, amis, famille — jusqu'à 6" accent onPress={() => setStep('service')} />
            <Text style={[st.foot, { color: t.grey }]}>{salon.name} · {salon.city}</Text>
          </>
        )}

        {step === 'service' && (
          <>
            <Text style={[st.question, { color: t.ink }]}>Quelle prestation ?</Text>
            <View style={st.grid}>
              {SERVICES.map((x) => {
                const on = x.id === serviceId;
                return (
                  <Pressable key={x.id} onPress={() => setServiceId(x.id)}
                    style={({ pressed }) => [st.svc, { backgroundColor: on ? t.blue : t.fill, transform: [{ scale: pressed ? 0.96 : 1 }] }]}>
                    <Ionicons name={x.icon as React.ComponentProps<typeof Ionicons>['name']} size={30} color={on ? '#fff' : t.ink} />
                    <Text style={[st.svcName, { color: on ? '#fff' : t.ink }]}>{x.name}</Text>
                    <Text style={[st.svcMeta, { color: on ? 'rgba(255,255,255,.85)' : t.grey }]}>{dur(x.minutes)} · {eur(x.priceCents)}</Text>
                  </Pressable>
                );
              })}
            </View>
            {service ? (
              <>
                <Eyebrow>Suppléments (optionnel)</Eyebrow>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {EXTRAS.map((e) => {
                    const on = extras.includes(e.id);
                    return (
                      <Pressable key={e.id} onPress={() => setExtras((p) => (on ? p.filter((i) => i !== e.id) : [...p, e.id]))}
                        style={[st.chip, { backgroundColor: on ? t.blueSoft : t.card, borderColor: on ? t.blue : t.sep }]}>
                        <Ionicons name={on ? 'checkmark-circle' : 'add-circle-outline'} size={17} color={on ? t.blue : t.grey} />
                        <Text style={{ color: t.ink, fontWeight: '500' }}>{e.name} +{eur(e.priceCents)}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </>
            ) : null}
          </>
        )}

        {step === 'barber' && (
          <>
            <Text style={[st.question, { color: t.ink }]}>Avec quel coiffeur ?</Text>
            {BARBERS.map((b) => {
              const on = b.id === barberId;
              return (
                <Pressable key={b.id} onPress={() => setBarberId(b.id)}
                  style={[st.barber, { backgroundColor: t.card, borderColor: on ? t.blue : 'transparent' }]}>
                  <Avatar initials={b.initials} color={b.color} />
                  <Text style={[st.strong, { color: t.ink, flex: 1 }]}>{b.name}</Text>
                  <Ionicons name={on ? 'radio-button-on' : 'radio-button-off'} size={22} color={on ? t.blue : t.sep} />
                </Pressable>
              );
            })}
          </>
        )}

        {step === 'slot' && (
          <>
            <Text style={[st.question, { color: t.ink }]}>Quand ?</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 4 }}>
              {days.map((d) => {
                const on = d.key === dayKey;
                return (
                  <Pressable key={d.key} disabled={d.closed} onPress={() => { setDayKey(d.key); setSlot(null); }}
                    style={[st.day, { backgroundColor: on ? t.blue : t.card, opacity: d.closed ? 0.4 : 1 }]}>
                    <Text style={[st.dayDow, { color: on ? 'rgba(255,255,255,.85)' : t.grey }]}>{d.dow}</Text>
                    <Text style={[st.dayNum, { color: on ? '#fff' : t.ink }]}>{d.num}</Text>
                    <Text style={[st.dayDow, { color: on ? 'rgba(255,255,255,.85)' : t.grey }]}>{d.closed ? 'fermé' : d.month}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            {(['morning', 'afternoon'] as const).map((part) => {
              const list = slotsFor(day)[part];
              if (!list.length) return null;
              return (
                <View key={part}>
                  <Eyebrow>{part === 'morning' ? 'Matin' : 'Après-midi'}</Eyebrow>
                  <View style={st.slots}>
                    {list.map((h) => {
                      const on = h === slot;
                      return (
                        <Pressable key={h} onPress={() => setSlot(h)} style={[st.slot, { backgroundColor: on ? t.blue : t.fill }]}>
                          <Text style={{ color: on ? '#fff' : t.ink, fontWeight: '600', fontSize: 14.5 }}>{h}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              );
            })}
          </>
        )}

        {step === 'confirm' && service && barber && slot && (
          <>
            <Text style={[st.question, { color: t.ink }]}>Votre rendez-vous</Text>
            <Card>
              <Line icon="calendar-outline" label={`${day.dow} ${day.num} ${day.month} à ${slot}`} />
              <Line icon="cut-outline" label={`${service.name} · ${dur(service.minutes)}`} />
              {extras.length ? <Line icon="add-circle-outline" label={EXTRAS.filter((e) => extras.includes(e.id)).map((e) => e.name).join(', ')} /> : null}
              <Line icon="person-outline" label={barber.id === 'any' ? 'Premier coiffeur disponible' : barber.name} />
              <Line icon="location-outline" label={`${salon.name} · ${salon.city}`} last />
            </Card>
            <View style={[st.row, { justifyContent: 'space-between', marginTop: 16, paddingHorizontal: 4 }]}>
              <Text style={[st.meta, { color: t.grey, fontSize: 15 }]}>Total</Text>
              <Text style={[st.big, { color: t.ink, fontSize: 22 }]}>{eur(total)}</Text>
            </View>
          </>
        )}
      </ScrollView>

      {step !== 'who' ? (
        <View style={[st.stepBar, { backgroundColor: t.card, borderColor: t.sep }]}>
          <View style={{ flex: 1 }}>
            <Text style={[st.meta, { color: t.grey }]} numberOfLines={1}>
              {service ? `${service.name}${extras.length ? ` + ${extras.length}` : ''}` : 'Choisissez une prestation'}
              {barber ? ` · ${barber.id === 'any' ? 'Sans préférence' : barber.name}` : ''}
            </Text>
            <Text style={[st.strong, { color: t.ink }]}>{service ? eur(total) : '—'}</Text>
          </View>
          <View style={{ width: 150 }}>
            <Go
              label={step === 'confirm' ? 'Confirmer' : 'Suivant'}
              disabled={(step === 'service' && !service) || (step === 'barber' && !barber) || (step === 'slot' && !slot)}
              onPress={() => setStep(step === 'confirm' ? 'done' : STEPS[STEPS.indexOf(step) + 1])}
            />
          </View>
        </View>
      ) : null}
    </View>
  );
}

function Progress({ index }: { index: number }) {
  const { t } = useT();
  return (
    <View style={{ flexDirection: 'row', gap: 6, marginBottom: 18 }}>
      {STEPS.map((x, i) => (
        <View key={x} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: i <= index ? t.blue : t.fill2 }} />
      ))}
    </View>
  );
}

function ChoiceCard({ icon, title, sub, accent, onPress }: { icon: React.ComponentProps<typeof Ionicons>['name']; title: string; sub: string; accent?: boolean; onPress: () => void }) {
  const { t } = useT();
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [st.choice, { backgroundColor: t.card, borderColor: accent ? t.blue : t.sep, transform: [{ scale: pressed ? 0.98 : 1 }] }]}>
      <View style={[st.choiceIcon, { backgroundColor: t.fill }]}><Ionicons name={icon} size={28} color={t.ink} /></View>
      <Text style={[st.choiceTitle, { color: t.ink }]}>{title}</Text>
      <Text style={[st.meta, { color: t.grey }]}>{sub}</Text>
    </Pressable>
  );
}

function Line({ icon, label, last }: { icon: React.ComponentProps<typeof Ionicons>['name']; label: string; last?: boolean }) {
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
  const rows: [string, string][] = [['Nom', 'Eric Dokatel'], ['Email', 'eric@exemple.fr'], ['Téléphone', '06 •• •• •• 04']];
  return (
    <ScrollView contentContainerStyle={st.page}>
      <Eyebrow>Mes informations</Eyebrow>
      <Card style={{ paddingVertical: 4 }}>
        {rows.map(([k, v], i) => (
          <View key={k} style={[st.row, { justifyContent: 'space-between', paddingVertical: 13, borderBottomWidth: i < rows.length - 1 ? StyleSheet.hairlineWidth : 0, borderColor: t.sep }]}>
            <Text style={{ color: t.grey, fontSize: 15 }}>{k}</Text>
            <Text style={{ color: t.ink, fontSize: 15, fontWeight: '500' }}>{v}</Text>
          </View>
        ))}
      </Card>
      <Eyebrow>Mes proches</Eyebrow>
      <Card>
        <View style={st.row}><Avatar initials="L" color="#ff9f0a" size={36} /><Text style={{ color: t.ink, fontSize: 15, flex: 1 }}>Léo · 8 ans</Text></View>
        <Pressable style={{ marginTop: 12 }}><Text style={{ color: t.blue, fontWeight: '600' }}>+ Ajouter un proche</Text></Pressable>
      </Card>
      <Eyebrow>Mon salon</Eyebrow>
      <Card onPress={onChangeSalon}>
        <View style={st.row}>
          <Ionicons name="storefront-outline" size={22} color={t.blue} />
          <View style={{ flex: 1 }}>
            <Text style={[st.strong, { color: t.ink }]}>{salon.name}</Text>
            <Text style={[st.meta, { color: t.grey }]}>{salon.city}</Text>
          </View>
          <Text style={{ color: t.blue, fontWeight: '600' }}>Changer</Text>
        </View>
      </Card>
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
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  svc: { width: '48%', flexGrow: 1, borderRadius: 18, paddingVertical: 20, paddingHorizontal: 12, alignItems: 'center', gap: 6, minHeight: 112, justifyContent: 'center' },
  svcName: { fontSize: 14.5, fontWeight: '600' },
  svcMeta: { fontSize: 12.5 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 99, paddingVertical: 8, paddingHorizontal: 13 },
  barber: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14, borderRadius: 16, borderWidth: 2, marginBottom: 10 },
  day: { width: 62, borderRadius: 14, paddingVertical: 10, alignItems: 'center' },
  dayDow: { fontSize: 11.5, fontWeight: '600' },
  dayNum: { fontSize: 20, fontWeight: '700', marginVertical: 1 },
  slots: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  slot: { width: '23%', flexGrow: 1, maxWidth: '25%', borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  stepBar: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth },
  check: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  doneTitle: { fontSize: 22, fontWeight: '800' },
  doneSub: { fontSize: 15, textAlign: 'center', marginTop: 10, lineHeight: 21 },
});
