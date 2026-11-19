// Fiche d'un RDV (feuille) — même fiche qu'au web (dashboard.html : tiroir
// RDV) : prestation et prix, Déplacer, Annuler le RDV, coordonnées, note
// interne. Toutes les règles restent côté serveur (RDV confirmé seulement,
// encaissé = pas d'annulation, créneaux recalculés, emails au client).
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ApiAuth, ApiError } from '../api/transport';
import {
  ClientMarketing,
  ClientVisit,
  adminCancelAppointment,
  deleteAppointment,
  fetchClientHistory,
  fetchClientMarketing,
  fetchExtras,
  fetchRescheduleSlots,
  fetchServices,
  nudgeAppointment,
  rescheduleAppointment,
  saveAppointmentContact,
  saveAppointmentNote,
  updateAppointmentServices,
} from '../api/endpoints';
import { AdminAppointment, AvailabilitySlot, BarberPublic, CatalogItem } from '../types/api';
import { movedBy, nudgeRoom } from '../utils/agendaRules';
import { Palette, cardShadow, radius, spacing, sheetTheme } from '../theme/theme';
import { formatPriceCents } from '../utils/format';
import { barberColorFor } from '../utils/barberColor';
import { Card } from './Card';
import { Avatar, Chip, EmptyText, ErrorText, InlineLoading, ListRow, RowText } from './ui';
import { LabeledField } from './AuthForm';

type Mode = 'view' | 'move' | 'cancel' | 'services';

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

export function AppointmentSheet({ t: tIn, visible, appt, barbers, salonSlug, auth, todayYmd, nowMin, onClose, onChanged, asPanel }: {
  t: Palette;
  /** Tablette : panneau à droite (l'agenda reste visible) au lieu d'une feuille plein écran. */
  asPanel?: boolean;
  visible: boolean;
  appt: AdminAppointment | null;
  barbers: BarberPublic[];
  salonSlug: string;
  auth: ApiAuth;
  /** Date du jour DU SALON (YYYY-MM-DD). */
  todayYmd: string;
  /** Heure actuelle du salon (minutes) : pour savoir si le RDV peut encore être décalé. */
  nowMin?: number;
  onClose: () => void;
  /** Après une action réussie : recharger l'agenda. */
  onChanged: () => void;
}) {
  const t = sheetTheme(tIn);
  const styles = stylesFor(t);
  const [mode, setMode] = useState<Mode>('view');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [noteSaved, setNoteSaved] = useState(false);
  const [editContact, setEditContact] = useState(false);
  const [contact, setContact] = useState({ client_name: '', email: '', phone: '' });
  const [history, setHistory] = useState<ClientVisit[] | null>(null);
  const [marketing, setMarketing] = useState<ClientMarketing | null>(null);
  const [nudging, setNudging] = useState(false);
  const [info, setInfo] = useState('');

  useEffect(() => {
    if (!visible || !appt) return;
    setMode('view');
    setError('');
    setNote(String(appt.note ?? ''));
    setNoteSaved(false);
    setEditContact(false);
    setContact({ client_name: appt.client_name ?? '', email: String(appt.email ?? ''), phone: String(appt.phone ?? '') });
    setInfo('');
    setHistory(null);
    setMarketing(null);
    fetchClientHistory(salonSlug, auth, appt).then((r) => setHistory(r.items)).catch(() => setHistory([]));
    fetchClientMarketing(salonSlug, auth, appt).then(setMarketing).catch(() => setMarketing(null));
  }, [visible, appt, salonSlug, auth]);

  if (!appt) return null;

  const day = String(appt.scheduled_at).slice(0, 10);
  const start = String(appt.scheduled_at).slice(11, 16);
  const dur = Number(appt.pricing?.total_duration_min ?? appt.duration_min ?? 0);
  const status = appt.display_status ?? 'confirmed';
  const st = STATUS[status] ?? STATUS.confirmed;
  const editable = status === 'confirmed' && day >= todayYmd;
  const contactEditable = editable && !appt.promoted_queue_id;
  const color = barberColorFor(barbers, appt.barber_id);
  const startMin = Number(start.slice(0, 2)) * 60 + Number(start.slice(3, 5));
  const isFuture = day > todayYmd || (day === todayYmd && startMin > (nowMin ?? 0));
  const room = nudgeRoom(appt, isFuture);
  const moved = movedBy(appt);
  const clientHm = appt.client_time ? String(appt.client_time).slice(11, 16) : start;

  const nudge = async (minutes: number) => {
    if (nudging) return;
    setNudging(true);
    setError('');
    try {
      const r = await nudgeAppointment(salonSlug, auth, appt.id, minutes);
      setInfo(`${appt.client_name ?? 'Client'} : ${r.from} → ${r.to}${r.client_time ? ' (client non prévenu)' : ' — remis à son heure'}`);
      onChanged();
      onClose();
    } catch (e) {
      setError(errText(e));
    } finally {
      setNudging(false);
    }
  };

  const remove = () => {
    Alert.alert(
      'Supprimer définitivement ?',
      'Le rendez-vous sera effacé de l\'agenda et de l\'historique. Le client n\'est pas prévenu (utilisez « Annuler » pour le prévenir).',
      [
        { text: 'Garder', style: 'cancel' },
        { text: 'Supprimer', style: 'destructive', onPress: () => void run(() => deleteAppointment(salonSlug, auth, appt.id), () => { onChanged(); onClose(); }) },
      ]
    );
  };

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

  const body = (
      <KeyboardAvoidingView style={styles.sheet} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.head}>
          {mode === 'view' ? <View style={{ width: 70 }} /> : (
            <TouchableOpacity onPress={() => { setMode('view'); setError(''); }} hitSlop={8} accessibilityRole="button" style={{ width: 70 }}>
              <Text style={styles.headAct}>‹ Retour</Text>
            </TouchableOpacity>
          )}
          <Text style={styles.headTitle}>{mode === 'move' ? 'Déplacer le RDV' : mode === 'cancel' ? 'Annuler le RDV' : mode === 'services' ? 'Modifier la prestation' : 'Rendez-vous'}</Text>
          <TouchableOpacity onPress={onClose} hitSlop={8} accessibilityRole="button" style={{ width: 70, alignItems: 'flex-end' }}>
            <Text style={[styles.headAct, { fontWeight: '700' }]}>OK</Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <View style={styles.hero}>
            <Avatar t={t} name={appt.client_name} color={color} size={56} />
            <View style={{ flex: 1 }}>
              <Text style={styles.name} numberOfLines={2}>{appt.client_name || 'Client'}</Text>
              <Text style={styles.when}>
                {dayLabel(day)} · {start}{dur ? ` – ${addMinutes(start, dur)}` : ''}
                {moved ? <Text style={{ color: t.orange, fontWeight: '700' }}>{`  ⇅ ${moved > 0 ? '+' : ''}${moved}`}</Text> : null}
              </Text>
            </View>
            <Chip t={t} label={st.label} />
          </View>

          {mode === 'move' ? (
            <MovePanel t={t} appt={appt} barbers={barbers} salonSlug={salonSlug} auth={auth} todayYmd={todayYmd}
              onDone={() => { onChanged(); onClose(); }} />
          ) : mode === 'services' ? (
            <ServicesPanel t={t} appt={appt} salonSlug={salonSlug} auth={auth} onDone={() => { onChanged(); onClose(); }} />
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

              {info ? <Text style={styles.info}>{info}</Text> : null}

              {room.up || room.down || moved ? (
                <Card t={t} title="Décaler de 5 min (client non prévenu)" style={styles.block}>
                  <View style={styles.btnRow}>
                    <TouchableOpacity style={[styles.btn, styles.btnGrey, { height: 42 }, !room.up && { opacity: 0.35 }]} disabled={!room.up || nudging} onPress={() => void nudge(-5)} accessibilityRole="button">
                      <Ionicons name="caret-up" size={15} color={t.ink} />
                      <Text style={[styles.btnLabel, { color: t.ink, fontSize: 15.5 }]}>{addMinutes(start, -5)}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.btn, styles.btnGrey, { height: 42 }, !room.down && { opacity: 0.35 }]} disabled={!room.down || nudging} onPress={() => void nudge(5)} accessibilityRole="button">
                      <Ionicons name="caret-down" size={15} color={t.ink} />
                      <Text style={[styles.btnLabel, { color: t.ink, fontSize: 15.5 }]}>{addMinutes(start, 5)}</Text>
                    </TouchableOpacity>
                  </View>
                  <Text style={styles.sub}>
                    Heure réservée par le client : {clientHm}
                  </Text>
                  {moved && isFuture ? (
                    <TouchableOpacity onPress={() => void nudge(-moved)} disabled={nudging} accessibilityRole="button">
                      <Text style={{ color: t.blue, fontSize: 15, fontWeight: '600', marginTop: 4 }}>↩ Remettre à {clientHm}</Text>
                    </TouchableOpacity>
                  ) : null}
                </Card>
              ) : null}

              {editable ? (
                <>
                  <TouchableOpacity style={[styles.btn, styles.btnSoft, { flex: 0, marginBottom: 12 }]} onPress={() => setMode('services')} accessibilityRole="button">
                    <Ionicons name="create-outline" size={18} color={t.blue} />
                    <Text style={[styles.btnLabel, { color: t.blue }]}>Modifier la prestation</Text>
                  </TouchableOpacity>
                  <View style={[styles.btnRow, { marginBottom: spacing.block }]}>
                    <TouchableOpacity style={[styles.btn, styles.btnSoft]} onPress={() => setMode('move')} accessibilityRole="button">
                      <Ionicons name="swap-horizontal" size={18} color={t.blue} />
                      <Text style={[styles.btnLabel, { color: t.blue }]}>Déplacer</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.btn, { backgroundColor: t.redSoft }]} onPress={() => setMode('cancel')} accessibilityRole="button">
                      <Ionicons name="close" size={18} color={t.red} />
                      <Text style={[styles.btnLabel, { color: t.red }]}>Annuler</Text>
                    </TouchableOpacity>
                  </View>
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

              <Card t={t} flush title={`Historique des passages${history && history.length ? ` · ${history.length}` : ''}`} style={styles.block}>
                {history === null ? <InlineLoading t={t} /> : history.length === 0 ? (
                  <View style={{ padding: spacing.md }}><Text style={styles.text}>Aucun passage enregistré</Text></View>
                ) : history.slice(0, 4).map((v, i) => (
                  <ListRow key={v.id} t={t} first={i === 0}
                    right={v.total_price_cents ? <Text style={styles.sub}>{formatPriceCents(v.total_price_cents)}</Text> : undefined}>
                    <RowText t={t} title={v.service_name || 'Prestation'}
                      meta={new Date(v.checkin_at).toLocaleString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })} />
                  </ListRow>
                ))}
              </Card>

              {marketing ? (
                <Card t={t} flush title="Marketing" style={styles.block}>
                  {(marketing.loyalty_cards ?? []).some((c) => c.activated) ? (
                    (marketing.loyalty_cards ?? []).filter((c) => c.activated).map((c, i) => (
                      <ListRow key={c.card_id} t={t} first={i === 0} right={<Text style={styles.amt}>{c.points} pt{c.points > 1 ? 's' : ''}</Text>}>
                        <RowText t={t} title={`⭐ ${c.name}`} />
                      </ListRow>
                    ))
                  ) : marketing.loyalty && marketing.loyalty.activated ? (
                    <ListRow t={t} first right={<Text style={styles.amt}>{marketing.loyalty.points} pt{marketing.loyalty.points > 1 ? 's' : ''}</Text>}>
                      <RowText t={t} title="⭐ Fidélité" />
                    </ListRow>
                  ) : (
                    <View style={{ padding: spacing.md, paddingBottom: 6 }}><Text style={styles.text}>Carte de fidélité non activée</Text></View>
                  )}
                  {marketing.gifts.map((g) => (
                    <ListRow key={g.id} t={t} right={<Text style={[styles.amt, { color: g.used_at ? t.grey : t.green }]}>{formatPriceCents(g.amount_cents)}</Text>}>
                      <RowText t={t} title={g.used_at ? '🎁 Cadeau utilisé' : '🎁 Cadeau disponible'} meta={g.items.map((it) => `${it.quantity} × ${it.item_name}`).join(', ')} />
                    </ListRow>
                  ))}
                </Card>
              ) : null}

              {error ? <ErrorText t={t} text={error} /> : null}

              <TouchableOpacity style={[styles.btn, { flex: 0, backgroundColor: 'transparent', borderWidth: 1, borderColor: t.redSoft, marginBottom: 20 }]} onPress={remove} accessibilityRole="button">
                <Ionicons name="trash-outline" size={17} color={t.red} />
                <Text style={[styles.btnLabel, { color: t.red, fontSize: 15.5 }]}>Supprimer définitivement</Text>
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
  );

  if (asPanel) {
    if (!visible) return null;
    return <View style={styles.panel}>{body}</View>;
  }
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      {body}
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

/* ---------- Modifier la prestation (web : PUT :id/services, heure de début gardée) ---------- */

function ServicesPanel({ t, appt, salonSlug, auth, onDone }: {
  t: Palette; appt: AdminAppointment; salonSlug: string; auth: ApiAuth; onDone: () => void;
}) {
  const styles = stylesFor(t);
  const [services, setServices] = useState<CatalogItem[] | null>(null);
  const [extras, setExtras] = useState<CatalogItem[]>([]);
  const [serviceId, setServiceId] = useState<string>(String(appt.service_id ?? ''));
  const [extraIds, setExtraIds] = useState<string[]>((appt.pricing?.extras ?? []).map((x) => String(x.id)));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    Promise.all([fetchServices(salonSlug), fetchExtras(salonSlug)])
      .then(([sv, x]) => { setServices(sv.items.filter((i) => i.active !== 0)); setExtras(x.items.filter((i) => i.active !== 0)); })
      .catch((e) => setErr(errText(e)));
  }, [salonSlug]);

  const save = async (force = false) => {
    if (!serviceId || saving) return;
    setSaving(true);
    setErr('');
    try {
      await updateAppointmentServices(salonSlug, auth, appt.id, { service_id: serviceId, extras: extraIds, force });
      onDone();
    } catch (e) {
      const code = e instanceof ApiError ? (e as ApiError & { code?: string }).message : '';
      // Dépassement de 10 min au plus : on demande l'accord (comme le web), puis on force.
      if (e instanceof ApiError && e.status === 409 && /dépasse de \d+ min/.test(e.message) && !/Pas assez de place/.test(e.message)) {
        Alert.alert('Ça dépasse un peu', `${e.message} Enregistrer quand même ?`, [
          { text: 'Annuler', style: 'cancel' },
          { text: 'Enregistrer', onPress: () => void save(true) },
        ]);
      } else {
        setErr(code || errText(e));
      }
    } finally {
      setSaving(false);
    }
  };

  if (!services) return err ? <ErrorText t={t} text={err} /> : <InlineLoading t={t} />;
  return (
    <View>
      <Text style={styles.label}>Prestation</Text>
      <Card t={t} flush style={styles.block}>
        {services.map((sv, i) => (
          <ListRow key={sv.id} t={t} first={i === 0} inset={50} onPress={() => setServiceId(sv.id)}
            left={<Ionicons name={serviceId === sv.id ? 'checkmark-circle' : 'ellipse-outline'} size={24} color={serviceId === sv.id ? t.blue : t.sep} />}
            right={<Text style={styles.amt}>{formatPriceCents(sv.price_cents)}</Text>}>
            <RowText t={t} title={sv.name} meta={`${sv.duration_min} min`} />
          </ListRow>
        ))}
      </Card>
      {extras.length ? (
        <>
          <Text style={styles.label}>Suppléments</Text>
          <Card t={t} flush style={styles.block}>
            {extras.map((x, i) => {
              const on = extraIds.includes(String(x.id));
              return (
                <ListRow key={x.id} t={t} first={i === 0} inset={50}
                  onPress={() => setExtraIds(on ? extraIds.filter((id) => id !== String(x.id)) : [...extraIds, String(x.id)])}
                  left={<Ionicons name={on ? 'checkbox' : 'square-outline'} size={22} color={on ? t.blue : t.sep} />}
                  right={<Text style={styles.amt}>+ {formatPriceCents(x.price_cents)}</Text>}>
                  <RowText t={t} title={x.name} meta={x.duration_min ? `+ ${x.duration_min} min` : undefined} />
                </ListRow>
              );
            })}
          </Card>
        </>
      ) : null}
      {err ? <ErrorText t={t} text={err} /> : null}
      <TouchableOpacity style={[styles.btn, { flex: 0, backgroundColor: t.blue }]} disabled={saving} onPress={() => void save(false)} accessibilityRole="button">
        {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnLabel}>Enregistrer</Text>}
      </TouchableOpacity>
      <Text style={styles.hint}>L'heure de début est gardée ; prix et durée du coiffeur. Le client reçoit un email.</Text>
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
    panel: {
      position: 'absolute', top: 0, right: 0, bottom: 0, width: 420, backgroundColor: t.bg,
      borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: t.sep,
      shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 24, shadowOffset: { width: -8, height: 0 }, elevation: 12,
    },
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
    info: { color: t.green, backgroundColor: t.greenSoft, borderRadius: 12, padding: 10, fontSize: 14, fontWeight: '600', marginBottom: 12, overflow: 'hidden' },
  });
