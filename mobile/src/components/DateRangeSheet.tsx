// Choix d'une plage de dates « Du » / « Au » (web : stats-range-picker,
// deux champs date). Feuille iOS avec calendrier mensuel : 1er appui = Du,
// 2e appui = Au (inversés si besoin). Pas de date dans le futur, comme la
// navigation des statistiques du web.
import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Palette, cardShadow, radius, spacing } from '../theme/theme';
import { CustomRange, localDateStr } from '../utils/period';

const WEEKDAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

const fmt = (ymd: string) =>
  new Date(`${ymd}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

export function DateRangeSheet({ t, visible, value, onClose, onApply }: {
  t: Palette;
  visible: boolean;
  value: CustomRange;
  onClose: () => void;
  onApply: (r: CustomRange) => void;
}) {
  const today = localDateStr(new Date());
  const [from, setFrom] = useState(value.from);
  const [to, setTo] = useState<string | null>(value.to);
  const [month, setMonth] = useState(() => {
    const d = new Date(`${value.to || today}T12:00:00`);
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  useEffect(() => {
    if (!visible) return;
    setFrom(value.from);
    setTo(value.to);
    const d = new Date(`${value.to || today}T12:00:00`);
    setMonth(new Date(d.getFullYear(), d.getMonth(), 1));
  }, [visible, value.from, value.to, today]);

  const cells = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const lead = (first.getDay() + 6) % 7; // lundi = 0
    const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    const out: (string | null)[] = Array.from({ length: lead }, () => null);
    for (let d = 1; d <= days; d++) out.push(localDateStr(new Date(month.getFullYear(), month.getMonth(), d)));
    while (out.length % 7) out.push(null);
    return out;
  }, [month]);

  const pick = (ymd: string) => {
    if (!from || to) {
      setFrom(ymd);
      setTo(null);
    } else if (ymd < from) {
      setTo(from);
      setFrom(ymd);
    } else {
      setTo(ymd);
    }
  };

  const nextMonthDisabled = localDateStr(new Date(month.getFullYear(), month.getMonth() + 1, 1)) > today;
  const styles = stylesFor(t);
  const monthLabel = month.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.sheet}>
        <View style={styles.head}>
          <TouchableOpacity onPress={onClose} hitSlop={8} accessibilityRole="button">
            <Text style={styles.cancel}>Annuler</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Plage</Text>
          <TouchableOpacity
            onPress={() => onApply({ from, to: to ?? from })}
            disabled={!from}
            hitSlop={8}
            accessibilityRole="button"
          >
            <Text style={styles.apply}>Valider</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.fields}>
          <View style={[styles.field, !to && styles.fieldOn]}>
            <Text style={styles.fieldLabel}>Du</Text>
            <Text style={styles.fieldValue} numberOfLines={1}>{from ? fmt(from) : '—'}</Text>
          </View>
          <View style={[styles.field, !!from && !to && styles.fieldOn]}>
            <Text style={styles.fieldLabel}>Au</Text>
            <Text style={styles.fieldValue} numberOfLines={1}>{to ? fmt(to) : 'Choisissez le dernier jour'}</Text>
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.monthRow}>
            <TouchableOpacity onPress={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} hitSlop={8} accessibilityRole="button">
              <Ionicons name="chevron-back" size={20} color={t.blue} />
            </TouchableOpacity>
            <Text style={styles.monthLabel}>{monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1)}</Text>
            <TouchableOpacity
              onPress={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
              disabled={nextMonthDisabled}
              hitSlop={8}
              accessibilityRole="button"
            >
              <Ionicons name="chevron-forward" size={20} color={t.blue} style={{ opacity: nextMonthDisabled ? 0.3 : 1 }} />
            </TouchableOpacity>
          </View>
          <View style={styles.grid}>
            {WEEKDAYS.map((w, i) => (
              <Text key={`w${i}`} style={styles.weekday}>{w}</Text>
            ))}
            {cells.map((ymd, i) => {
              if (!ymd) return <View key={`e${i}`} style={styles.cell} />;
              const future = ymd > today;
              const end = to ?? from;
              const isEdge = ymd === from || ymd === to;
              const inside = !!from && !!end && ymd > from && ymd < end;
              return (
                <Pressable key={ymd} style={styles.cell} disabled={future} onPress={() => pick(ymd)} accessibilityRole="button">
                  <View style={[styles.day, inside && { backgroundColor: t.blueSoft }, isEdge && { backgroundColor: t.blue }]}>
                    <Text
                      style={[
                        styles.dayText,
                        ymd === today && !isEdge && { color: t.blue, fontWeight: '700' },
                        isEdge && { color: '#fff', fontWeight: '700' },
                        future && { opacity: 0.3 },
                      ]}
                    >
                      {Number(ymd.slice(8, 10))}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const stylesFor = (t: Palette) =>
  StyleSheet.create({
    sheet: { flex: 1, backgroundColor: t.bg },
    head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing.page, paddingTop: 18 },
    title: { color: t.ink, fontSize: 17, fontWeight: '700' },
    cancel: { color: t.blue, fontSize: 16 },
    apply: { color: t.blue, fontSize: 16, fontWeight: '700' },
    fields: { flexDirection: 'row', gap: 10, paddingHorizontal: spacing.page, marginBottom: spacing.md },
    field: { flex: 1, backgroundColor: t.card, borderRadius: 12, padding: 12, borderWidth: 1.5, borderColor: 'transparent', ...cardShadow(t) },
    fieldOn: { borderColor: t.blue },
    fieldLabel: { color: t.grey, fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.6 },
    fieldValue: { color: t.ink, fontSize: 14.5, fontWeight: '600', marginTop: 3, textTransform: 'capitalize' },
    card: { marginHorizontal: spacing.page, backgroundColor: t.card, borderRadius: radius.card, padding: 14, ...cardShadow(t) },
    monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, paddingHorizontal: 4 },
    monthLabel: { color: t.ink, fontSize: 17, fontWeight: '700' },
    grid: { flexDirection: 'row', flexWrap: 'wrap' },
    weekday: { width: `${100 / 7}%`, textAlign: 'center', color: t.grey, fontSize: 12, fontWeight: '600', paddingBottom: 6 },
    cell: { width: `${100 / 7}%`, aspectRatio: 1, padding: 2 },
    day: { flex: 1, borderRadius: 99, alignItems: 'center', justifyContent: 'center' },
    dayText: { color: t.ink, fontSize: 16, fontVariant: ['tabular-nums'] },
  });
