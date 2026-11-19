// « Ajouter un RDV » (équipe) — mêmes étapes que le web (dashboard.html,
// openAddAppointment) : 1. prestation + suppléments, 2. coiffeur (ou
// « Premier disponible »), date et créneau, 3. client (nom requis, email et
// téléphone facultatifs). Créneaux et choix du coiffeur : serveur.
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ApiAuth, ApiError } from '../api/transport';
import { adminCreateAppointment, fetchExtras, fetchServices, fetchStaffAvailability } from '../api/endpoints';
import { AvailabilitySlot, BarberPublic, CatalogItem } from '../types/api';
import { Palette, cardShadow, radius, spacing } from '../theme/theme';
import { formatPriceCents } from '../utils/format';
import { barberColorFor } from '../utils/barberColor';
import { contactProblem } from '../utils/phone';
import { Card } from './Card';
import { Avatar, EmptyText, ErrorText, InlineLoading, ListRow, RowText } from './ui';
import { LabeledField } from './AuthForm';

type Step = 1 | 2 | 3;

const errText = (e: unknown) => (e instanceof ApiError ? e.message : 'Une erreur est survenue.');
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const dayLong = (s: string) => {
  const v = new Date(`${s}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  return v.charAt(0).toUpperCase() + v.slice(1);
};

export function AddAppointmentSheet({ t, visible, initialDate, todayYmd, barbers, salonSlug, auth, onClose, onCreated }: {
  t: Palette;
  visible: boolean;
  initialDate: string;
  todayYmd: string;
  barbers: BarberPublic[];
  salonSlug: string;
  auth: ApiAuth;
  onClose: () => void;
  onCreated: (message: string) => void;
}) {
  const styles = stylesFor(t);
  const [step, setStep] = useState<Step>(1);
  const [services, setServices] = useState<CatalogItem[] | null>(null);
  const [extras, setExtras] = useState<CatalogItem[]>([]);
  const [catErr, setCatErr] = useState('');
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [extraIds, setExtraIds] = useState<string[]>([]);
  const [barberId, setBarberId] = useState<string>(''); // '' = Premier disponible
  const [date, setDate] = useState(initialDate);
  const [slots, setSlots] = useState<AvailabilitySlot[] | null>(null);
  const [slotErr, setSlotErr] = useState('');
  const [time, setTime] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState('');

  // Remise à zéro à chaque ouverture.
  useEffect(() => {
    if (!visible) return;
    setStep(1);
    setServiceId(null);
    setExtraIds([]);
    setBarberId('');
    setDate(initialDate < todayYmd ? todayYmd : initialDate);
    setTime(null);
    setName('');
    setEmail('');
    setPhone('');
    setSaveErr('');
    if (!services) {
      Promise.all([fetchServices(salonSlug), fetchExtras(salonSlug)])
        .then(([s, x]) => {
          setServices(s.items.filter((i) => i.active !== 0));
          setExtras(x.items.filter((i) => i.active !== 0));
        })
        .catch((e) => setCatErr(errText(e)));
    }
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  // Créneaux (étape 2).
  useEffect(() => {
    if (!visible || step !== 2 || !serviceId) return;
    let alive = true;
    setSlots(null);
    setSlotErr('');
    setTime(null);
    fetchStaffAvailability(salonSlug, auth, { date, service_id: serviceId, extras: extraIds, barber_id: barberId || null })
      .then((r) => alive && setSlots(r.slots))
      .catch((e) => alive && setSlotErr(errText(e)));
    return () => { alive = false; };
  }, [visible, step, serviceId, extraIds, barberId, date, salonSlug, auth]);

  const days = useMemo(() => {
    const base = new Date(`${todayYmd}T12:00:00`);
    return Array.from({ length: 42 }, (_, i) => ymd(new Date(base.getTime() + i * 86400000)));
  }, [todayYmd]);

  const service = services?.find((s) => s.id === serviceId) ?? null;
  const chosenExtras = extras.filter((x) => extraIds.includes(x.id));
  const total = (service?.price_cents ?? 0) + chosenExtras.reduce((a, x) => a + x.price_cents, 0);
  const duration = (service?.duration_min ?? 0) + chosenExtras.reduce((a, x) => a + x.duration_min, 0);
  const slot = slots?.find((s) => s.time === time) ?? null;
  const slotBarber = barberId || slot?.barber_id || '';
  const bookable = barbers.filter((b) => b.active && b.accepts_appointments !== 0);

  const save = async () => {
    if (saving || !serviceId || !time) return;
    const problem = contactProblem({ name, email, phone }, { nameRequired: true });
    if (!name.trim()) return setSaveErr('Le nom est requis');
    if (problem) return setSaveErr(problem);
    setSaving(true);
    setSaveErr('');
    try {
      const r = await adminCreateAppointment(salonSlug, auth, {
        client_name: name.trim(),
        email: email.trim(),
        phone: phone.trim(),
        service_id: serviceId,
        barber_id: barberId || null,
        extras: extraIds,
        date,
        time,
      });
      onCreated(`RDV ajouté${!barberId && r.barber_name ? ` avec ${r.barber_name}` : ''}`);
      onClose();
    } catch (e) {
      setSaveErr(errText(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.sheet} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.head}>
          <TouchableOpacity onPress={() => (step === 1 ? onClose() : setStep((step - 1) as Step))} hitSlop={8} style={{ width: 80 }} accessibilityRole="button">
            <Text style={styles.headAct}>{step === 1 ? 'Annuler' : '‹ Retour'}</Text>
          </TouchableOpacity>
          <Text style={styles.headTitle}>Ajouter un RDV</Text>
          <Text style={[styles.stepTxt, { width: 80, textAlign: 'right' }]}>{step} / 3</Text>
        </View>
        <View style={styles.progress}>
          {[1, 2, 3].map((i) => <View key={i} style={[styles.bar, { backgroundColor: i <= step ? t.blue : t.fill }]} />)}
        </View>

        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          {step === 1 ? (
            <>
              <Text style={styles.title}>Prestation</Text>
              {catErr ? <ErrorText t={t} text={catErr} /> : !services ? <InlineLoading t={t} /> : (
                <Card t={t} flush style={styles.block}>
                  {services.map((s, i) => (
                    <ListRow key={s.id} t={t} first={i === 0} inset={50} onPress={() => setServiceId(s.id)}
                      left={<Ionicons name={serviceId === s.id ? 'checkmark-circle' : 'ellipse-outline'} size={24} color={serviceId === s.id ? t.blue : t.sep} />}
                      right={<Text style={styles.amt}>{formatPriceCents(s.price_cents)}</Text>}>
                      <RowText t={t} title={s.name} meta={`${s.duration_min} min`} />
                    </ListRow>
                  ))}
                </Card>
              )}
              {extras.length ? (
                <>
                  <Text style={styles.sub}>Suppléments (optionnels)</Text>
                  <Card t={t} flush style={styles.block}>
                    {extras.map((x, i) => {
                      const on = extraIds.includes(x.id);
                      return (
                        <ListRow key={x.id} t={t} first={i === 0} inset={50}
                          onPress={() => setExtraIds(on ? extraIds.filter((id) => id !== x.id) : [...extraIds, x.id])}
                          left={<Ionicons name={on ? 'checkbox' : 'square-outline'} size={22} color={on ? t.blue : t.sep} />}
                          right={<Text style={styles.amt}>+ {formatPriceCents(x.price_cents)}</Text>}>
                          <RowText t={t} title={x.name} meta={x.duration_min ? `+ ${x.duration_min} min` : undefined} />
                        </ListRow>
                      );
                    })}
                  </Card>
                </>
              ) : null}
            </>
          ) : step === 2 ? (
            <>
              <Text style={styles.title}>Créneau</Text>
              <Text style={styles.recap}>{service?.name}{chosenExtras.length ? ` + ${chosenExtras.map((x) => x.name).join(', ')}` : ''} · {duration} min</Text>

              <Text style={styles.label}>Coiffeur</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hList}>
                <Pressable onPress={() => setBarberId('')} style={[styles.pick, !barberId && styles.pickOn]} accessibilityRole="button">
                  <Ionicons name="shuffle" size={18} color={!barberId ? '#fff' : t.blue} />
                  <Text style={[styles.pickText, !barberId && { color: '#fff' }]}>Premier disponible</Text>
                </Pressable>
                {bookable.map((b) => {
                  const on = barberId === String(b.id);
                  return (
                    <Pressable key={b.id} onPress={() => setBarberId(String(b.id))} style={[styles.pick, on && styles.pickOn]} accessibilityRole="button">
                      <Avatar t={t} name={b.name} color={barberColorFor(barbers, b.id)} size={26} />
                      <Text style={[styles.pickText, on && { color: '#fff' }]}>{b.name}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>

              <Text style={styles.label}>Date</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hList}>
                {days.map((d) => {
                  const on = d === date;
                  const dt = new Date(`${d}T12:00:00`);
                  return (
                    <Pressable key={d} onPress={() => setDate(d)} style={[styles.day, on && styles.pickOn]} accessibilityRole="button">
                      <Text style={[styles.dayW, on && { color: 'rgba(255,255,255,0.85)' }]}>{dt.toLocaleDateString('fr-FR', { weekday: 'short' })}</Text>
                      <Text style={[styles.dayN, on && { color: '#fff' }]}>{dt.getDate()}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>

              <Text style={styles.label}>{dayLong(date)}</Text>
              {slotErr ? <ErrorText t={t} text={slotErr} /> : slots === null ? <InlineLoading t={t} /> : slots.length === 0 ? (
                <EmptyText t={t} text="Aucun créneau disponible ce jour-là." />
              ) : (
                <View style={styles.slots}>
                  {slots.map((s) => {
                    const on = s.time === time;
                    return (
                      <Pressable key={s.time} onPress={() => setTime(s.time)} style={[styles.slot, on && styles.pickOn]} accessibilityRole="button">
                        <Text style={[styles.slotText, on && { color: '#fff' }]}>{s.time}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              )}
            </>
          ) : (
            <>
              <Text style={styles.title}>Client</Text>
              <Card t={t} flush style={styles.block}>
                <ListRow t={t} first
                  left={<Avatar t={t} name={slotBarber ? barbers.find((b) => String(b.id) === String(slotBarber))?.name : '?'} color={slotBarber ? barberColorFor(barbers, slotBarber) : t.grey} />}
                  right={<Text style={styles.amt}>{formatPriceCents(total)}</Text>}>
                  <RowText t={t} title={`${dayLong(date)} · ${time}`}
                    meta={`${service?.name ?? ''}${chosenExtras.length ? ' + ' + chosenExtras.map((x) => x.name).join(', ') : ''} · ${barbers.find((b) => String(b.id) === String(slotBarber))?.name ?? 'Premier disponible'}`} />
                </ListRow>
              </Card>
              <View style={{ gap: 12 }}>
                <LabeledField label="Nom du client" t={t} value={name} onChangeText={setName} autoCapitalize="words" placeholder="Nom et prénom" />
                <LabeledField label="Email (facultatif)" t={t} value={email} onChangeText={setEmail} keyboardType="email-address" placeholder="client@exemple.fr" />
                <LabeledField label="Téléphone (facultatif)" t={t} value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="06 12 34 56 78" />
              </View>
              <Text style={styles.hint}>Avec un email, le client reçoit la confirmation et son lien d'annulation.</Text>
              {saveErr ? <ErrorText t={t} text={saveErr} /> : null}
            </>
          )}
        </ScrollView>

        <View style={styles.footer}>
          {step === 1 ? (
            <TouchableOpacity style={[styles.btn, !serviceId && { opacity: 0.45 }]} disabled={!serviceId} onPress={() => setStep(2)} accessibilityRole="button">
              <Text style={styles.btnLabel}>{serviceId ? `Continuer · ${formatPriceCents(total)} · ${duration} min` : 'Choisissez une prestation'}</Text>
            </TouchableOpacity>
          ) : step === 2 ? (
            <TouchableOpacity style={[styles.btn, !time && { opacity: 0.45 }]} disabled={!time} onPress={() => setStep(3)} accessibilityRole="button">
              <Text style={styles.btnLabel}>{time ? `Continuer à ${time}` : 'Choisissez un créneau'}</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={[styles.btn, !name.trim() && { opacity: 0.45 }]} disabled={!name.trim() || saving} onPress={() => void save()} accessibilityRole="button">
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnLabel}>Ajouter le RDV</Text>}
            </TouchableOpacity>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const stylesFor = (t: Palette) =>
  StyleSheet.create({
    sheet: { flex: 1, backgroundColor: t.bg },
    head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.page, paddingTop: 18, paddingBottom: 10 },
    headTitle: { color: t.ink, fontSize: 17, fontWeight: '700' },
    headAct: { color: t.blue, fontSize: 16 },
    stepTxt: { color: t.grey, fontSize: 14, fontWeight: '600' },
    progress: { flexDirection: 'row', gap: 6, paddingHorizontal: spacing.page, marginBottom: 6 },
    bar: { flex: 1, height: 4, borderRadius: 2 },
    body: { paddingHorizontal: spacing.page, paddingTop: 12, paddingBottom: 40 },
    title: { color: t.ink, fontSize: 28, fontWeight: '700', letterSpacing: -0.6, marginBottom: 12 },
    recap: { color: t.grey, fontSize: 15, marginTop: -6, marginBottom: 14 },
    sub: { color: t.ink, fontSize: 17, fontWeight: '700', marginHorizontal: 4, marginBottom: 8 },
    block: { marginBottom: spacing.block },
    amt: { color: t.ink, fontSize: 15.5, fontWeight: '600', fontVariant: ['tabular-nums'] },
    label: { color: t.grey, fontSize: 13, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.6, margin: 4, marginBottom: 8 },
    hList: { gap: 8, paddingBottom: 14, paddingHorizontal: 2 },
    pick: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: t.card, borderRadius: 99, paddingVertical: 6, paddingLeft: 8, paddingRight: 14, ...cardShadow(t) },
    pickOn: { backgroundColor: t.blue },
    pickText: { color: t.ink, fontSize: 15, fontWeight: '600' },
    day: { width: 52, alignItems: 'center', paddingVertical: 8, borderRadius: 12, backgroundColor: t.card, ...cardShadow(t) },
    dayW: { color: t.grey, fontSize: 12, fontWeight: '600', textTransform: 'capitalize' },
    dayN: { color: t.ink, fontSize: 18, fontWeight: '700', marginTop: 2 },
    slots: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    slot: { width: '23%', alignItems: 'center', paddingVertical: 11, borderRadius: radius.button, backgroundColor: t.card, ...cardShadow(t) },
    slotText: { color: t.ink, fontSize: 15, fontWeight: '600', fontVariant: ['tabular-nums'] },
    hint: { color: t.grey, fontSize: 13, marginTop: 12, marginHorizontal: 4 },
    footer: { paddingHorizontal: spacing.page, paddingTop: 10, paddingBottom: 30, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.sep, backgroundColor: t.bg },
    btn: { height: 52, borderRadius: 14, backgroundColor: t.blue, alignItems: 'center', justifyContent: 'center' },
    btnLabel: { color: '#fff', fontSize: 17, fontWeight: '600' },
  });
