// Espace client — Rendez-vous : liste réelle à venir (session client) +
// assistant de réservation en 4 étapes branché sur les API réelles :
//   1. prestation (+suppléments)  2. coiffeur (« premier disponible » ou choix)
//   3. jour + créneau (hours DU SALON, jamais reconverties)
//   4. récapitulatif + confirmation (X-Client-Token : pas de code email, cf.
//      guestEmailVerified côté serveur).
import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  KeyboardAvoidingView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  bookAppointment,
  cancelAppointment,
  fetchAvailability,
  fetchAvailabilityDays,
  fetchBarbers,
  fetchClientMe,
  fetchExtras,
  fetchServices,
} from '../../api/endpoints';
import { ApiError } from '../../api/transport';
import { useAuth } from '../../auth/AuthContext';
import { Card } from '../../components/Card';
import { FormErrorView, LoadingView } from '../../components/AuthForm';
import { useTheme } from '../../hooks/useTheme';
import { usePolling } from '../../hooks/usePolling';
import { Palette, radius, spacing } from '../../theme/theme';
import { formatPriceCents, formatSalonDate } from '../../utils/format';
import { AvailabilitySlot, BarberPublic, CatalogItem } from '../../types/api';

const DAY_MS = 24 * 60 * 60 * 1000;

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** 14 prochains jours, en heure locale du téléphone (le serveur invalide ce qu'il refuse). */
function nextDays(count: number): string[] {
  const out: string[] = [];
  const now = new Date();
  for (let i = 0; i < count; i++) out.push(isoDate(new Date(now.getTime() + i * DAY_MS)));
  return out;
}

const FRENCH_DAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const FRENCH_MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

function dayLabel(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z');
  return `${FRENCH_DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${FRENCH_MONTHS[d.getUTCMonth()]}`;
}

export function RdvScreen() {
  const auth = useAuth();
  const client = auth.client;
  const t = useTheme();
  const styles = stylesFor(t);

  const [mode, setMode] = useState<'list' | 'book'>('list');

  const loadMe = useCallback(
    () => fetchClientMe(client ? client.salonSlug : '', client ? client.clientToken : ''),
    [client]
  );
  const me = usePolling(loadMe, 6000);

  const cancelRdv = useCallback(
    (token: string) => {
      Alert.alert('Annuler ce rendez-vous ?', 'Le créneau sera rendu aux autres clients. Cette action est définitive.', [
        { text: 'Garder', style: 'cancel' },
        {
          text: 'Annuler le RDV',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              if (!client) return;
              try {
                await cancelAppointment(client.salonSlug, token);
                await me.reload();
              } catch (err) {
                Alert.alert('Annulation impossible', err instanceof ApiError ? err.message : 'Erreur inattendue.');
              }
            })();
          },
        },
      ]);
    },
    [client, me]
  );

  if (!client) return null; // garou : monté seulement avec session

  if (mode === 'book') {
    return (
      <BookingWizard
        t={t}
        onDone={async () => {
          setMode('list');
          await me.reload();
        }}
        onCancel={() => setMode('list')}
      />
    );
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <TouchableOpacity style={styles.cta} accessibilityRole="button" onPress={() => setMode('book')}>
          <Text style={styles.ctaLabel}>Réserver un rendez-vous</Text>
        </TouchableOpacity>

        <Card title="Rendez-vous à venir" t={t}>
          {me.loading && !me.data ? (
            <ActivityIndicator color={t.blue} />
          ) : me.error ? (
            <Text style={styles.text}>
              Impossible de charger vos rendez-vous
              {me.error instanceof ApiError ? ` (${me.error.message})` : ''}.
            </Text>
          ) : me.data && me.data.upcoming_appointments.length > 0 ? (
            me.data.upcoming_appointments.map((rdv) => (
              <View key={rdv.id} style={styles.rdvRow}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={styles.rdvWhen}>{formatSalonDate(rdv.scheduled_at)}</Text>
                  <Text style={styles.text}>
                    {rdv.service_name}
                    {rdv.extras.length > 0 ? ` + ${rdv.extras.join(', ')}` : ''}
                    {rdv.person_name ? ` · pour ${rdv.person_name}` : ''}
                    {rdv.barber_name ? ` · ${rdv.barber_name}` : ' · coiffeur confirmé à l\'heure'}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => cancelRdv(rdv.cancel_token)} accessibilityRole="button">
                  <Text style={styles.cancelLink}>Annuler</Text>
                </TouchableOpacity>
              </View>
            ))
          ) : (
            <Text style={styles.text}>Aucun rendez-vous à venir : réservez votre prochaine coupe ci-dessus.</Text>
          )}
        </Card>

        <Text style={styles.note}>
          L'heure affichée est l'heure du salon. L'annulation obéit aux règles du salon (délai limite,
          RDV déjà honoré — le serveur vous dira si c'est trop tard).
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/* ===================== Assistant de réservation ===================== */

type WizardProps = { t: Palette; onDone: () => void; onCancel: () => void };

function BookingWizard({ t, onDone, onCancel }: WizardProps) {
  const styles = stylesFor(t);
  const { client } = useAuth();
  const [step, setStep] = useState<'service' | 'barber' | 'slot' | 'confirm'>('service');
  const [services, setServices] = useState<CatalogItem[] | null>(null);
  const [extras, setExtras] = useState<CatalogItem[]>([]);
  const [barbers, setBarbers] = useState<BarberPublic[] | null>(null);
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [extraIds, setExtraIds] = useState<string[]>([]);
  const [barberId, setBarberId] = useState<string | null>(null);
  const [date, setDate] = useState<string>(nextDays(1)[0]);
  const [slots, setSlots] = useState<AvailabilitySlot[] | null>(null);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsError, setSlotsError] = useState<unknown>(null);
  const [bookDays, setBookDays] = useState<string[] | null>(null);
  const [time, setTime] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const days = useMemo(() => nextDays(14), []);

  React.useEffect(() => {
    void (async () => {
      if (!client) return;
      try {
        const s = await fetchServices(client.salonSlug);
        setServices(s.items);
        const x = await fetchExtras(client.salonSlug);
        setExtras(x.items);
        const b = await fetchBarbers(client.salonSlug);
        setBarbers(b.items);
      } catch (err) {
        setError(err);
      }
    })();
  }, [client]);

  // Créneaux : dès que prestation + (coiffeur?) + date sont connus.
  const loadSlots = useCallback(async () => {
    if (!client || !serviceId) return;
    setSlotsLoading(true);
    setSlotsError(null);
    setSlots(null);
    try {
      const r = await fetchAvailability(client.salonSlug, {
        date,
        service_id: serviceId,
        extras: extraIds,
        barber_id: barberId,
      });
      setSlots(r.slots);
      setTime(null);
    } catch (err) {
      setSlotsError(err);
    } finally {
      setSlotsLoading(false);
    }
  }, [client, serviceId, extraIds, barberId, date]);

  React.useEffect(() => {
    if (step !== 'slot') return;
    void loadSlots();
    // Jours réservables de la période (griser les jours complets)
    void (async () => {
      if (!client || !serviceId) return;
      try {
        const r = await fetchAvailabilityDays(client.salonSlug, {
          from: days[0],
          to: days[days.length - 1],
          service_id: serviceId,
          extras: extraIds,
          barber_id: barberId,
        });
        setBookDays(r.days);
      } catch (err) {
        setBookDays(null);
      }
    })();
  }, [step, loadSlots, client, serviceId, extraIds, barberId, days]);

  const barbersList = (barbers ?? []).filter(
    (b) => Number(b.accepts_appointments ?? 0) === 1 && !b.on_leave_today
  );
  const barberById = useMemo(() => new Map((barbers ?? []).map((b) => [b.id, b])), [barbers]);

  const confirm = async () => {
    if (!client || !serviceId || !time) return;
    setBusy(true);
    setError(null);
    try {
      const meSafe = await fetchClientMe(client.salonSlug, client.clientToken);
      await bookAppointment(
        client.salonSlug,
        {
          client_name: meSafe.profile.name,
          email: meSafe.profile.email,
          phone: meSafe.profile.phone,
          service_id: serviceId,
          extras: extraIds,
          barber_id: barberId,
          date,
          time,
          client_note: note.trim() || undefined,
        },
        client.clientToken
      );
      onDone();
    } catch (err) {
      setError(err);
      // Créneau devenu indisponible : il faut re-choisir.
      if (err instanceof ApiError && (err.status === 409 || err.status === 403)) {
        setTime(null);
        await loadSlots();
      }
    } finally {
      setBusy(false);
    }
  };

  if (error && !services && step === 'service') {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: t.bg }} contentContainerStyle={styles.content}>
        <FormErrorView error={error} t={t} />
        <TouchableOpacity style={styles.cta} accessibilityRole="button" onPress={onCancel}>
          <Text style={styles.ctaLabel}>Retour</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  if (!services || !barbers) return <LoadingView t={t} label="Préparation de la réservation…" />;

  const steps: { id: typeof step; label: string }[] = [
    { id: 'service', label: 'Prestation' },
    { id: 'barber', label: 'Coiffeur' },
    { id: 'slot', label: 'Créneau' },
    { id: 'confirm', label: 'Récap' },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <View style={styles.stepBar}>
        {steps.map((s, i) => (
          <View key={s.id} style={[styles.stepDot, step === s.id && styles.stepDotActive]}>
            <Text style={[styles.stepText, step === s.id && styles.stepTextActive]}>{i + 1}. {s.label}</Text>
          </View>
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {step === 'service' && (
          <>
            {services.map((s) => (
              <Choice
                key={s.id}
                t={t}
                selected={serviceId === s.id}
                onPress={() => { setServiceId(s.id); setExtraIds([]); }}
                title={s.name}
                sub={`${s.duration_min} min · ${formatPriceCents(s.price_cents)}`}
              />
            ))}
            {extras.length > 0 && (
              <View style={styles.extraBlock}>
                <Text style={styles.extrasTitle}>Suppléments (optionnel)</Text>
                <View style={styles.chips}>
                  {extras.map((x) => {
                    const on = extraIds.includes(x.id);
                    return (
                      <TouchableOpacity
                        key={x.id}
                        style={[styles.chip, on && styles.chipOn]}
                        onPress={() =>
                          setExtraIds((prev) => (on ? prev.filter((id) => id !== x.id) : [...prev, x.id]))
                        }
                      >
                        <Text style={[styles.chipText, on && styles.chipTextOn]}>{x.name}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}
            <SubmitRow t={t} disabled={!serviceId} onPress={() => setStep('barber')} label="Choisir le coiffeur" />
          </>
        )}

        {step === 'barber' && (
          <>
            <Choice
              t={t}
              selected={barberId === null}
              onPress={() => setBarberId(null)}
              title="Premier disponible"
              sub="Le serveur choisit le coiffeur le plus libre à l'heure retenue"
            />
            {barbersList.map((b) => (
              <Choice
                key={b.id}
                t={t}
                selected={barberId === b.id}
                onPress={() => setBarberId(b.id)}
                title={b.name}
                sub={
                  b.on_break_now || b.outside_hours_now
                    ? 'Hors ligne maintenant — créneaux selon ses horaires'
                    : b.walkin_today
                    ? 'Journée « sans RDV » aujourd\'hui'
                    : 'Accepte les rendez-vous'
                }
              />
            ))}
            <SubmitRow t={t} onPress={() => setStep('slot')} label="Voir les créneaux" />
          </>
        )}

        {step === 'slot' && (
          <>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.dayRow}>
              {days.map((d) => {
                const closed = bookDays ? !bookDays.includes(d) : false;
                return (
                  <TouchableOpacity
                    key={d}
                    disabled={closed}
                    style={[styles.dayChip, date === d && styles.dayChipOn, closed && styles.dayChipOff]}
                    onPress={() => setDate(d)}
                  >
                    <Text style={[styles.dayChipText, (date === d || closed) && styles.dayChipTextOn]}>
                      {dayLabel(d)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            {slotsLoading ? (
              <ActivityIndicator color={t.blue} style={{ marginTop: spacing.md }} />
            ) : slotsError ? (
              <FormErrorView error={slotsError} t={t} />
            ) : slots && slots.length > 0 ? (
              <View style={styles.slotGrid}>
                {slots.map((sl) => (
                  <TouchableOpacity
                    key={`${sl.time}-${sl.barber_id}`}
                    style={[styles.slotChip, time === sl.time && styles.slotChipOn]}
                    onPress={() => setTime(sl.time)}
                  >
                    <Text style={[styles.slotTime, time === sl.time && styles.slotTextOn]}>{sl.time}</Text>
                    <Text style={styles.slotSub}>
                      {barberById.get(sl.barber_id)?.name ?? 'Premier disponible'} · {formatPriceCents(sl.price_cents)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            ) : (
              <Text style={styles.text}>Aucun créneau ce jour-là — essayez une autre date.</Text>
            )}
            <SubmitRow t={t} disabled={!time} onPress={() => setStep('confirm')} label="Récapitulatif" />
          </>
        )}

        {step === 'confirm' && (
          <ConfirmStep
            t={t}
            error={error}
            slot={time}
            date={date}
            service={services.find((s) => s.id === serviceId) ?? null}
            extraNames={extras.filter((x) => extraIds.includes(x.id)).map((x) => x.name)}
            barberName={barberId ? (barberById.get(barberId)?.name ?? null) : null}
            note={note}
            onChangeNote={setNote}
            onBackDate={() => setStep('slot')}
            onConfirm={() => void confirm()}
            busy={busy}
          />
        )}
      </ScrollView>
    </View>
  );
}

/* ---------- Petits blocs UI de l'assistant ---------- */

function Choice({ t, selected, onPress, title, sub }: {
  t: Palette; selected: boolean; onPress: () => void; title: string; sub?: string;
}) {
  const styles = stylesFor(t);
  return (
    <TouchableOpacity style={[styles.choice, selected && styles.choiceOn]} onPress={onPress} accessibilityRole="button">
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.choiceTitle}>{title}</Text>
        {sub ? <Text style={styles.choiceSub}>{sub}</Text> : null}
      </View>
      <View style={[styles.radio, selected && styles.radioOn]} />
    </TouchableOpacity>
  );
}

function SubmitRow({ t, disabled, onPress, label }: { t: Palette; disabled?: boolean; onPress: () => void; label: string }) {
  const styles = stylesFor(t);
  return (
    <TouchableOpacity style={[styles.cta, disabled && { opacity: 0.5 }]} disabled={disabled} onPress={onPress} accessibilityRole="button">
      <Text style={styles.ctaLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

function ConfirmStep({ t, error, date, slot, service, extraNames, barberName, note, onChangeNote, onBackDate, onConfirm, busy }: {
  t: Palette; error: unknown; date: string; slot: string | null; service: CatalogItem | null; extraNames: string[];
  barberName: string | null; note: string; onChangeNote: (v: string) => void;
  onBackDate: () => void; onConfirm: () => void; busy: boolean;
}) {
  const styles = stylesFor(t);
  const duration = (service?.duration_min ?? 30);
  return (
    <View style={{ gap: spacing.md }}>
      <Card title="Votre réservation" t={t}>
        <Text style={styles.big}>{slot ? `${dayLabel(date)} · ${slot}` : dayLabel(date)}</Text>
        <Text style={styles.text}>{service?.name ?? 'Prestation'}{extraNames.length ? ` + ${extraNames.join(', ')}` : ''}</Text>
        <Text style={styles.text}>
          {barberName ? `avec ${barberName}` : 'premier disponible'} · {duration} min ·{' '}
          {formatPriceCents(service?.price_cents ?? 0)} (à régler au salon)
        </Text>
      </Card>
      <Text style={styles.extrasTitle}>Note pour le coiffeur (optionnel)</Text>
      <TextInput
        style={styles.noteInput}
        value={note}
        onChangeText={(v) => onChangeNote(v.slice(0, 500))}
        placeholder="Allergies, coupe déjà vue, accompagnant…"
        placeholderTextColor={t.grey}
        multiline
      />
      <TouchableOpacity style={styles.ghost} onPress={onBackDate} accessibilityRole="button">
        <Text style={styles.ghostLabel}>Changer de créneau</Text>
      </TouchableOpacity>
      <FormErrorView error={error} t={t} />
      <TouchableOpacity style={[styles.cta, busy && { opacity: 0.5 }]} disabled={busy} onPress={onConfirm} accessibilityRole="button">
        {busy ? <ActivityIndicator color={'#fff'} /> : <Text style={styles.ctaLabel}>Confirmer le rendez-vous</Text>}
      </TouchableOpacity>
    </View>
  );
}

/* ===================== Styles ===================== */

const stylesFor = (t: Palette) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: t.bg },
    content: { padding: spacing.lg, paddingBottom: spacing.xl + spacing.md, gap: spacing.md },
    text: { color: t.grey, fontSize: 15, lineHeight: 21 },
    big: { color: t.ink, fontSize: 22, fontWeight: '700' },
    note: { color: t.grey, fontSize: 13, fontStyle: 'italic', lineHeight: 19 },
    cta: { backgroundColor: t.blue, borderRadius: radius.button, paddingVertical: 15, alignItems: 'center' },
    ctaLabel: { color: '#fff', fontWeight: '700', fontSize: 16 },
    rdvRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, paddingVertical: 4 },
    rdvWhen: { color: t.ink, fontWeight: '700', fontSize: 15 },
    cancelLink: { color: t.red, fontWeight: '600', fontSize: 13 },
    stepBar: {
      flexDirection: 'row', gap: spacing.xs, paddingHorizontal: spacing.lg,
      paddingTop: spacing.md, paddingBottom: spacing.sm, flexWrap: 'wrap',
    },
    stepDot: {
      borderColor: t.sep, borderWidth: StyleSheet.hairlineWidth, backgroundColor: t.card,
      borderRadius: 100, paddingHorizontal: 10, paddingVertical: 4,
    },
    stepDotActive: { backgroundColor: t.blue, borderColor: t.blue },
    stepText: { color: t.grey, fontSize: 11, fontWeight: '700' },
    stepTextActive: { color: '#fff' },
    choice: {
      backgroundColor: t.card, borderColor: t.sep, borderWidth: StyleSheet.hairlineWidth,
      borderRadius: radius.card, padding: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    },
    choiceOn: { borderColor: t.blue, borderWidth: 1.5 },
    choiceTitle: { color: t.ink, fontSize: 16, fontWeight: '700' },
    choiceSub: { color: t.grey, fontSize: 13 },
    radio: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: t.grey },
    radioOn: { backgroundColor: t.blue, borderColor: t.blue },
    extraBlock: { gap: spacing.sm, marginTop: spacing.sm },
    extrasTitle: { color: t.grey, fontSize: 13, fontWeight: '700' },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    chip: {
      borderColor: t.sep, borderWidth: StyleSheet.hairlineWidth, backgroundColor: t.card,
      borderRadius: 100, paddingHorizontal: 12, paddingVertical: 7,
    },
    chipOn: { backgroundColor: t.blue, borderColor: t.blue },
    chipText: { color: t.grey, fontSize: 13, fontWeight: '600' },
    chipTextOn: { color: '#fff' },
    dayRow: { marginBottom: spacing.sm },
    dayChip: {
      borderColor: t.sep, borderWidth: StyleSheet.hairlineWidth, backgroundColor: t.card,
      borderRadius: radius.button, paddingHorizontal: 12, paddingVertical: 8, marginRight: spacing.sm,
    },
    dayChipOn: { backgroundColor: t.blue, borderColor: t.blue },
    dayChipOff: { opacity: 0.35 },
    dayChipText: { color: t.grey, fontSize: 13, fontWeight: '600' },
    dayChipTextOn: { color: '#fff' },
    slotGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    slotChip: {
      backgroundColor: t.card, borderColor: t.sep, borderWidth: StyleSheet.hairlineWidth,
      borderRadius: radius.button, paddingHorizontal: 12, paddingVertical: 8, flexGrow: 1, minWidth: 130,
    },
    slotChipOn: { borderWidth: 1.5, borderColor: t.blue, backgroundColor: t.blue },
    slotTime: { color: t.ink, fontSize: 16, fontWeight: '700' },
    slotTextOn: { color: '#fff' },
    slotSub: { color: t.grey, fontSize: 12, marginTop: 2 },
    noteInput: {
      backgroundColor: t.card, borderColor: t.sep, borderWidth: StyleSheet.hairlineWidth,
      borderRadius: radius.button, color: t.ink, padding: spacing.md, minHeight: 80, textAlignVertical: 'top',
    },
    ghost: { alignItems: 'center', paddingVertical: 6 },
    ghostLabel: { color: t.grey, fontSize: 14, fontWeight: '600' },
  });
