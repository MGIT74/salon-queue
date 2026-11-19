// Fiche d'un RDV (feuille) — même fiche qu'au web (dashboard.html : tiroir
// RDV) : prestation et prix, Déplacer, Annuler le RDV, coordonnées, note
// interne. Toutes les règles restent côté serveur (RDV confirmé seulement,
// encaissé = pas d'annulation, créneaux recalculés, emails au client).
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ApiAuth, ApiError } from '../api/transport';
import { adminCancelAppointment, fetchRescheduleSlots, rescheduleAppointment, saveAppointmentContact, saveAppointmentNote } from '../api/endpoints';
import { AdminAppointment, AvailabilitySlot, BarberPublic } from '../types/api';
import { Palette, cardShadow, radius, spacing } from '../theme/theme';
import { formatPriceCents } from '../utils/format';
import { barberColorFor } from '../utils/barberColor';
import { Card } from './Card';
import { Avatar, Chip, EmptyText, ErrorText, InlineLoading, ListRow, RowText } from './ui';
import { LabeledField } from './AuthForm';

type Mode = 'view' | 'move' | 'cancel';

const STATUS: Record<string, { label: string; tone: 'green' | 'grey' | 'red' | 'blue' }> = {
  confirmed: { label: 'Confirmé', tone: 'blue' },
  completed: { label: 'Terminé', tone: 'grey' },
  no_show: { label: 'Absent', tone: 'red' },
  cancelled: { label: 'Annulé', tone: 'red' },
};

function addMinutes(hm: string, min: number): string {
  const [h, m] = hm.split(':').map(Number);
  const tot = h * 60 + m + min;
  return `${String(Math.floor(tot / 60) % 24).padStart(2, '0')}:${String(tot % 60).padStart(2, '0')}`;
}

function dayLabel(ymd: string): string {
  const d = new Date(`${ymd}T12:00:00`);
  const s = d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function errText(e: unknown) {
  return e instanceof ApiError ? e.message : 'Une erreur est survenue.';
}

export function AppointmentSheet({ t, visible, appt, barbers, salonSlug, auth, todayYmd, onClose, onChanged }: {
  t: Palette;
  visible: boolean;
  appt: AdminAppointment | null;
  barbers: BarberPublic[];
  salonSlug: string;
  auth: ApiAuth;
  /** Date du jour DU SALON (YYYY-MM-DD). */
  todayYmd: string;
  onClose: () => void;
  /** Après une action réussie : recharger l'agenda. */
  onChanged: () => void;
}) {
  const styles = stylesFor(t);
  const [mode, setMode] = useState<Mode>('view');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [noteSaved, setNoteSaved] = useState(false);
  const [editContact, setEditContact] = useState(false);
  const [contact, setContact] = useState({ client_name: '', email: '', phone: '' });

  useEffect(() => {
    if (!visible || !appt) return;
    setMode('view');
    setError('');
    setNote(String(appt.note ?? ''));
    setNoteSaved(false);
    setEditContact(false);
    setContact({ client_name: appt.client_name ?? '', email: String(appt.email ?? ''), phone: String(appt.phone ?? '') });
  }, [visible, appt]);

  if (!appt) return null;

  const day = String(appt.scheduled_at).slice(0, 10);
  const start = String(appt.scheduled_at).slice(11, 16);
  const dur = Number(appt.pricing?.total_duration_min ?? appt.duration_min ?? 0);
  const status = appt.display_status ?? 'confirmed';
  const st = STATUS[status] ?? STATUS.confirmed;
  const editable = status === 'confirmed' && day >= todayYmd;
  const contactEditable = editable && !appt.promoted_queue_id;
  const color = barberColorFor(barbers, appt.barber_id);

  const run = async (fn: () => Promise<unknown>, after?: () => void) => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await fn();
      after?.();
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.sheet} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.head}>
          {mode === 'view' ? <View style={{ width: 70 }} /> : (
            <TouchableOpacity onPress={() => { setMode('view'); setError(''); }} hitSlop={8} accessibilityRole="button" style={{ width: 70 }}>
              <Text style={styles.headAct}>‹ Retour</Text>
            </TouchableOpacity>
          )}
          <Text style={styles.headTitle}>{mode === 'move' ? 'Déplacer le RDV' : mode === 'cancel' ? 'Annuler le RDV' : 'Rendez-vous'}</Text>
          <TouchableOpacity onPress={onClose} hitSlop={8} accessibilityRole="button" style={{ width: 70, alignItems: 'flex-end' }}>
            <Text style={[styles.headAct, { fontWeight: '700' }]}>OK</Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <View style={styles.hero}>
            <Avatar t={t} name={appt.client_name} color={color} size={56} />
            <View style={{ flex: 1 }}>
              <Text style={styles.name} numberOfLines={2}>{appt.client_name || 'Client'}</Text>
              <Text style={styles.when}>{dayLabel(day)} · {start}{dur ? ` – ${addMinutes(start, dur)}` : ''}</Text>
            </View>
            <Chip t={t} label={st.label} />
          </View>

          {mode === 'move' ? (
            <MovePanel t={t} appt={appt} barbers={barbers} salonSlug={salonSlug} auth={auth} todayYmd={todayYmd}
              onDone={() => { onChanged(); onClose(); }} />
          ) : mode === 'cancel' ? (
            <CancelPanel t={t} busy={busy} error={error}
              hasEmail={!!appt.email}
              onConfirm={(msg) => run(() => adminCancelAppointment(salonSlug, auth, appt.id, msg), () => { onChanged(); onClose(); })} />
          ) : (
            <>
              <Card t={t} flush style={styles.block}>
                <ListRow t={t} first
                  left={<View style={[styles.ric, { backgroundColor: color }]}><Ionicons name="cut-outline" size={17} color="#fff" /></View>}
                  right={appt.pricing ? <Text style={styles.amt}>{formatPriceCents(appt.pricing.total_cents)}</Text> : undefined}
                >
                  <RowText t={t} title={appt.service_name || 'Prestation'} meta={`${appt.barber_name ?? 'Coiffeur'}${dur ? ` · ${dur} min` : ''}`} />
                </ListRow>
                {(appt.pricing?.extras ?? []).map((x) => (
                  <ListRow key={x.id} t={t} inset={58} left={<View style={{ width: 30 }} />} right={<Text style={styles.sub}>{formatPriceCents(x.price_cents)}</Text>}>
                    <RowText t={t} title={`+ ${x.name}`} meta={x.duration_min ? `${x.duration_min} min` : undefined} />
                  </ListRow>
                ))}
                {(appt.pricing?.products ?? []).map((x) => (
                  <ListRow key={x.id} t={t} inset={58} left={<View style={{ width: 30 }} />} right={<Text style={styles.sub}>{formatPriceCents(x.unit_price_cents * x.quantity)}</Text>}>
                    <RowText t={t} title={`${x.quantity} × ${x.name}`} />
                  </ListRow>
                ))}
              </Card>

              {appt.client_note ? (
                <Card t={t} title="Note du client" style={styles.block}>
                  <Text style={styles.text}>{String(appt.client_note)}</Text>
                </Card>
              ) : null}

              {editable ? (
                <>
                  <View style={styles.btnRow}>
                    <TouchableOpacity style={[styles.btn, styles.btnSoft]} onPress={() => setMode('move')} accessibilityRole="button">
                      <Ionicons name="swap-horizontal" size={18} color={t.blue} />
                      <Text style={[styles.btnLabel, { color: t.blue }]}>Déplacer</Text>
                    </TouchableOpacity>
                  </View>
                  <TouchableOpacity style={[styles.btn, { backgroundColor: t.redSoft, marginBottom: spacing.block }]} onPress={() => setMode('cancel')} accessibilityRole="button">
                    <Ionicons name="close" size={18} color={t.red} />
                    <Text style={[styles.btnLabel, { color: t.red }]}>Annuler le RDV</Text>
                  </TouchableOpacity>
                </>
              ) : null}

              <Card t={t} flush title="Coordonnées" style={styles.block}>
                {editContact ? (
                  <View style={{ padding: spacing.md, gap: 10 }}>
                    <LabeledField label="Nom" t={t} value={contact.client_name} onChangeText={(v) => setContact({ ...contact, client_name: v })} autoCapitalize="words" />
                    <LabeledField label="Email" t={t} value={contact.email} onChangeText={(v) => setContact({ ...contact, email: v })} keyboardType="email-address" />
                    <LabeledField label="Téléphone" t={t} value={contact.phone} onChangeText={(v) => setContact({ ...contact, phone: v })} keyboardType="phone-pad" />
                    <View style={styles.btnRow}>
                      <TouchableOpacity style={[styles.btn, styles.btnGrey]} onPress={() => setEditContact(false)} accessibilityRole="button">
                        <Text style={[styles.btnLabel, { color: t.ink }]}>Annuler</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.btn, { backgroundColor: t.blue }]} accessibilityRole="button"
                        onPress={() => run(() => saveAppointmentContact(salonSlug, auth, appt.id, contact), () => { setEditContact(false); onChanged(); })}>
                        {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnLabel}>Enregistrer</Text>}
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  <>
                    <ListRow t={t} first><RowText t={t} title="Nom" meta={appt.client_name || '—'} /></ListRow>
                    <ListRow t={t}><RowText t={t} title="Email" meta={String(appt.email || '—')} /></ListRow>
                    <ListRow t={t}><RowText t={t} title="Téléphone" meta={String(appt.phone || '—')} /></ListRow>
                    {contactEditable ? (
                      <ListRow t={t} onPress={() => setEditContact(true)}>
                        <Text style={{ color: t.blue, fontSize: 16, fontWeight: '600' }}>Modifier les coordonnées</Text>
                      </ListRow>
                    ) : null}
                  </>
                )}
              </Card>

              <Card t={t} title="Note interne" style={styles.block}>
                <TextInput
                  style={styles.note}
                  value={note}
                  onChangeText={(v) => { setNote(v); setNoteSaved(false); }}
                  placeholder="Visible par l'équipe seulement (rattachée au client)"
                  placeholderTextColor={t.grey}
                  multiline
                  maxLength={2000}
                />
                {note !== String(appt.note ?? '') || noteSaved ? (
                  <TouchableOpacity
                    style={[styles.btn, { backgroundColor: noteSaved ? t.greenSoft : t.blue, marginTop: 4 }]}
                    disabled={noteSaved}
                    accessibilityRole="button"
                    onPress={() => run(() => saveAppointmentNote(salonSlug, auth, appt.id, note), () => { setNoteSaved(true); onChanged(); })}
                  >
                    <Text style={[styles.btnLabel, noteSaved && { color: t.green }]}>{noteSaved ? 'Note enregistrée' : 'Enregistrer la note'}</Text>
                  </TouchableOpacity>
                ) : null}
              </Card>

              {error ? <ErrorText t={t} text={error} /> : null}
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/* ---------- Déplacer : coiffeur, date, créneau (web : openRescheduleAppointment) ---------- */

function MovePanel({ t, appt, barbers, salonSlug, auth, todayYmd, onDone }: {
  t: Palette; appt: AdminAppointment; barbers: BarberPublic[]; salonSlug: string; auth: ApiAuth; todayYmd: string; onDone: () => void;
}) {
  const styles = stylesFor(t);
  const bookable = barbers.filter((b) => b.active && b.accepts_appointments !== 0);
  const [barberId, setBarberId] = useState(String(appt.barber_id ?? bookable[0]?.id ?? ''));
  const [date, setDate] = useState(String(appt.scheduled_at).slice(0, 10) < todayYmd ? todayYmd : String(appt.scheduled_at).slice(0, 10));
  const [slots, setSlots] = useState<AvailabilitySlot[] | null>(null);
  const [loadErr, setLoadErr] = useState('');
  const [time, setTime] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState('');

  const days = useMemo(() => {
    const out: string[] = [];
    const base = new Date(`${todayYmd}T12:00:00`);
    for (let i = 0; i < 28; i++) {
      const d = new Date(base.getTime() + i * 86400000);
      out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
    }
    return out;
  }, [todayYmd]);

  useEffect(() => {
    let alive = true;
    setSlots(null);
    setTime(null);
    setLoadErr('');
    if (!appt.service_id || !barberId) {
      setLoadErr('Prestation ou coiffeur inconnu : déplacez ce RDV depuis l\'ordinateur.');
      return;
    }
    fetchRescheduleSlots(salonSlug, auth, { date, service_id: String(appt.service_id), barber_id: barberId, appointment_id: appt.id })
      .then((r) => alive && setSlots(r.slots))
      .catch((e) => alive && setLoadErr(errText(e)));
    return () => { alive = false; };
  }, [barberId, date, appt, salonSlug, auth]);

  const save = async () => {
    if (!time || saving) return;
    setSaving(true);
    setSaveErr('');
    try {
      await rescheduleAppointment(salonSlug, auth, appt.id, { date, time, barber_id: barberId });
      onDone();
    } catch (e) {
      setSaveErr(errText(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <View>
      <Text style={styles.label}>Coiffeur</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hList}>
        {bookable.map((b) => {
          const on = String(b.id) === barberId;
          return (
            <Pressable key={b.id} onPress={() => setBarberId(String(b.id))} style={[styles.pick, on && styles.pickOn]} accessibilityRole="button">
              <Avatar t={t} name={b.name} color={barberColorFor(barbers, b.id)} size={26} />
              <Text style={[styles.pickText, on && { color: '#fff' }]}>{b.name}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <Text style={styles.label}>Nouvelle date</Text>
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

      <Text style={styles.label}>Créneau</Text>
      {loadErr ? (
        <ErrorText t={t} text={loadErr} />
      ) : slots === null ? (
        <InlineLoading t={t} />
      ) : slots.length === 0 ? (
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

      {saveErr ? <ErrorText t={t} text={saveErr} /> : null}
      <TouchableOpacity style={[styles.btn, { backgroundColor: t.blue, marginTop: spacing.md }, !time && { opacity: 0.45 }]} disabled={!time || saving} onPress={() => void save()} accessibilityRole="button">
        {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnLabel}>{time ? `Déplacer au ${dayLabel(date).toLowerCase()} à ${time}` : 'Choisissez un créneau'}</Text>}
      </TouchableOpacity>
      <Text style={styles.hint}>Le client reçoit un email avec le nouvel horaire.</Text>
    </View>
  );
}

/* ---------- Annuler : message par défaut ou personnalisé (web : admin-cancel) ---------- */

function CancelPanel({ t, busy, error, hasEmail, onConfirm }: {
  t: Palette; busy: boolean; error: string; hasEmail: boolean; onConfirm: (msg: string) => void;
}) {
  const styles = stylesFor(t);
  const [custom, setCustom] = useState(false);
  const [msg, setMsg] = useState('');
  return (
    <View>
      <Text style={[styles.text, { marginBottom: spacing.md }]}>
        {hasEmail ? 'Le client recevra un email d\'annulation.' : 'Ce client n\'a pas d\'email : il ne sera pas prévenu automatiquement.'}
      </Text>
      {hasEmail ? (
        <Card t={t} flush style={styles.block}>
          {[false, true].map((c, i) => (
            <ListRow key={String(c)} t={t} first={i === 0} onPress={() => setCustom(c)}
              left={<Ionicons name={custom === c ? 'radio-button-on' : 'radio-button-off'} size={22} color={custom === c ? t.blue : t.sep} />}>
              <Text style={{ color: t.ink, fontSize: 16 }}>{c ? 'Message personnalisé' : 'Message par défaut'}</Text>
            </ListRow>
          ))}
        </Card>
      ) : null}
      {custom ? (
        <TextInput
          style={[styles.note, { marginBottom: spacing.md, ...cardShadow(t), backgroundColor: t.card }]}
          value={msg}
          onChangeText={setMsg}
          placeholder="Ex : en raison d'un imprévu, le salon est exceptionnellement fermé…"
          placeholderTextColor={t.grey}
          multiline
        />
      ) : null}
      {error ? <ErrorText t={t} text={error} /> : null}
      <TouchableOpacity style={[styles.btn, { backgroundColor: t.red }]} disabled={busy} onPress={() => onConfirm(custom ? msg.trim() : '')} accessibilityRole="button">
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnLabel}>Confirmer l'annulation</Text>}
      </TouchableOpacity>
    </View>
  );
}

const stylesFor = (t: Palette) =>
  StyleSheet.create({
    sheet: { flex: 1, backgroundColor: t.bg },
    head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.page, paddingTop: 18, paddingBottom: 8 },
    headTitle: { color: t.ink, fontSize: 17, fontWeight: '700' },
    headAct: { color: t.blue, fontSize: 16 },
    body: { paddingHorizontal: spacing.page, paddingBottom: 60 },
    hero: { flexDirection: 'row', alignItems: 'center', gap: 14, marginVertical: 14 },
    name: { color: t.ink, fontSize: 24, fontWeight: '700', letterSpacing: -0.5 },
    when: { color: t.grey, fontSize: 15, marginTop: 2 },
    block: { marginBottom: spacing.block },
    ric: { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
    amt: { color: t.ink, fontSize: 16, fontWeight: '600', fontVariant: ['tabular-nums'] },
    sub: { color: t.grey, fontSize: 15, fontVariant: ['tabular-nums'] },
    text: { color: t.grey, fontSize: 15, lineHeight: 21 },
    btnRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
    btn: { flex: 1, height: 50, borderRadius: 14, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center' },
    btnSoft: { backgroundColor: t.blueSoft },
    btnGrey: { backgroundColor: t.fill },
    btnLabel: { color: '#fff', fontSize: 16.5, fontWeight: '600' },
    note: { minHeight: 80, backgroundColor: t.fill, borderRadius: 12, padding: 12, color: t.ink, fontSize: 15.5, textAlignVertical: 'top' },
    label: { color: t.grey, fontSize: 13, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.6, margin: 4, marginTop: 6, marginBottom: 8 },
    hList: { gap: 8, paddingBottom: 14 },
    pick: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: t.card, borderRadius: 99, paddingVertical: 6, paddingLeft: 6, paddingRight: 14, ...cardShadow(t) },
    pickOn: { backgroundColor: t.blue },
    pickText: { color: t.ink, fontSize: 15, fontWeight: '600' },
    day: { width: 52, alignItems: 'center', paddingVertical: 8, borderRadius: 12, backgroundColor: t.card, ...cardShadow(t) },
    dayW: { color: t.grey, fontSize: 12, fontWeight: '600', textTransform: 'capitalize' },
    dayN: { color: t.ink, fontSize: 18, fontWeight: '700', marginTop: 2 },
    slots: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    slot: { width: '23%', alignItems: 'center', paddingVertical: 11, borderRadius: radius.button, backgroundColor: t.card, ...cardShadow(t) },
    slotText: { color: t.ink, fontSize: 15, fontWeight: '600', fontVariant: ['tabular-nums'] },
    hint: { color: t.grey, fontSize: 13, textAlign: 'center', marginTop: 10 },
  });
