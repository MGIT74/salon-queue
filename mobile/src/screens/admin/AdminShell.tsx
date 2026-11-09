// Dashboard admin — REPRODUCTION du web (dashboard.html) : même menu
// latéral (13 sections exactes : ordre et libellés), sélecteur d'enseigne
// en tête, Déconnexion en rouge dans « Plus », version en pied.
// Pattern mobile du web : barre du bas + bouton « Plus » (menu complet).
import React, { useState } from 'react';
import { Modal, SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../auth/AuthContext';
import { QueueBoard } from '../../components/QueueBoard';
import { ScreenPlaceholder } from '../../components/ScreenPlaceholder';
import { useTheme } from '../../hooks/useTheme';
import { Palette, APP_VERSION, radius, spacing } from '../../theme/theme';
import { ADMIN_BOTTOM_BAR, ADMIN_SECTIONS, AdminSectionDef, AdminSectionKey } from '../../navigation/menu.config';

export function AdminShell() {
  const t = useTheme();
  const styles = stylesFor(t);
  const { admin, logout } = useAuth();
  const [section, setSection] = useState<AdminSectionKey>('dashboard');
  const [plusOpen, setPlusOpen] = useState(false);

  if (!admin) return null; // garou : rendu uniquement avec session admin

  const def = (key: AdminSectionKey): AdminSectionDef | undefined => ADMIN_SECTIONS.find((s) => s.key === key);
  const current = def(section);
  const salonName =
    (admin.salons ?? []).find((s) => s.slug === admin.salonSlug)?.name ?? admin.salonSlug ?? 'Salon';

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.salonHead}>
        <Ionicons name="business-outline" size={18} color={t.blue} />
        <Text style={styles.salonName}>{salonName}</Text>
        <Text style={styles.account}>{admin.email}</Text>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content}>
        {section === 'queue' ? (
          <>
            <Text style={styles.sectionTitle}>File d'attente</Text>
            <QueueBoard />
          </>
        ) : current ? (
          <>
            <Text style={styles.sectionTitle}>{current.label}</Text>
            <ScreenPlaceholder phase={current.phase} description={current.desc} checklist={listFor(current)} />
          </>
        ) : null}
        <Text style={styles.version}>{APP_VERSION}</Text>
      </ScrollView>

      <View style={styles.bottomBar}>
        {ADMIN_BOTTOM_BAR.map((key) => {
          const def = ADMIN_SECTIONS.find((s) => s.key === key);
          if (!def) return null;
          return (
            <TabIcon
              key={key}
              t={t}
              active={section === key}
              icon={def.icon}
              label={def.label}
              onPress={() => setSection(key)}
            />
          );
        })}
        <TabIcon t={t} active={plusOpen} icon="ellipsis-horizontal" label="Plus" onPress={() => setPlusOpen(true)} />
      </View>

      <Modal animationType="slide" visible={plusOpen} onRequestClose={() => setPlusOpen(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }}>
          <View style={styles.plusHead}>
            <Text style={styles.plusTitle}>Plus</Text>
            <TouchableOpacity onPress={() => setPlusOpen(false)} accessibilityRole="button">
              <Ionicons name="close" size={22} color={t.blue} />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={styles.plusList}>
            {ADMIN_SECTIONS.map((s) => (
              <TouchableOpacity
                key={s.key}
                style={[styles.plusItem, section === s.key && styles.plusItemOn]}
                onPress={() => {
                  setSection(s.key);
                  setPlusOpen(false);
                }}
                accessibilityRole="button"
              >
                <Ionicons name={s.icon} size={19} color={section === s.key ? t.blue : t.ink} />
                <Text style={[styles.plusItemLabel, section === s.key && { color: t.blue, fontWeight: '600' }]}>{s.label}</Text>
                <Ionicons name="chevron-forward" size={15} color={t.grey} />
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={styles.plusLogout} onPress={() => void logout('admin')} accessibilityRole="button">
              <Ionicons name="log-out-outline" size={19} color={t.red} />
              <Text style={[styles.plusItemLabel, { color: t.red, fontWeight: '600' }]}>Déconnexion</Text>
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

function listFor(def: AdminSectionDef): string[] {
  return [def.desc];
}

function TabIcon({ t, active, icon, label, onPress }: {
  t: Palette; active: boolean; icon: AdminSectionDef['icon'] | 'ellipsis-horizontal'; label: string; onPress: () => void;
}) {
  const styles = stylesFor(t);
  return (
    <TouchableOpacity style={styles.tabBtn} onPress={onPress} accessibilityRole="button">
      <Ionicons name={icon} size={21} color={active ? t.blue : t.grey} />
      <Text style={[styles.tabLabel, active && { color: t.blue }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const stylesFor = (t: Palette) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: t.bg },
    salonHead: {
      flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: spacing.lg,
      paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.sep,
      backgroundColor: t.card,
    },
    salonName: { color: t.ink, fontSize: 14, fontWeight: '700', flexShrink: 1 },
    account: { color: t.grey, fontSize: 11, marginLeft: 'auto', flexShrink: 2 },
    content: { padding: spacing.lg, paddingBottom: spacing.xl + spacing.lg, gap: 4 },
    sectionTitle: { color: t.ink, fontSize: 22, fontWeight: '700', letterSpacing: -0.4, marginBottom: 6 },
    version: { color: t.grey, fontSize: 11, textAlign: 'right', marginTop: 'auto' },
    bottomBar: {
      flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.sep,
      backgroundColor: t.card, paddingTop: 6, paddingBottom: 4,
    },
    tabBtn: { flex: 1, alignItems: 'center', gap: 2, paddingVertical: 2 },
    tabLabel: { fontSize: 10.5, fontWeight: '600', color: t.grey },
    plusHead: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg,
      paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.sep,
    },
    plusTitle: { color: t.ink, fontSize: 18, fontWeight: '700' },
    plusList: { padding: spacing.sm, paddingBottom: spacing.xl },
    plusItem: {
      flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 13,
      paddingHorizontal: spacing.sm, borderRadius: radius.button,
    },
    plusItemOn: { backgroundColor: t.blueSoft },
    plusItemLabel: { color: t.ink, fontSize: 15, flex: 1 },
    plusLogout: {
      flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 13, paddingHorizontal: spacing.sm,
      borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.sep, marginTop: spacing.sm,
    },
  });
