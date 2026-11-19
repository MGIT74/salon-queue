// Dashboard admin — REPRODUCTION du web (dashboard.html) : même menu
// latéral (13 sections exactes : ordre et libellés), sélecteur d'enseigne
// en tête, Déconnexion en rouge dans « Plus », version en pied.
// Pattern mobile du web : barre du bas + bouton « Plus » (menu complet).
import React, { useState } from 'react';
import { ActionSheetIOS, Alert, Modal, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../auth/AuthContext';
import { QueueBoard } from '../../components/QueueBoard';
import { DashboardScreen } from './DashboardScreen';
import { ScreenPlaceholder } from '../../components/ScreenPlaceholder';
import { GlassTab, GlassTabBar } from '../../components/GlassTabBar';
import { Avatar, PageTitle } from '../../components/ui';
import { AdminSidebar, useSidebarCollapsed } from '../../components/AdminSidebar';
import { useLayout } from '../../hooks/useLayout';
import { useTheme } from '../../hooks/useTheme';
import { Palette, APP_VERSION, FLOATING_TABBAR_SPACE, cardShadow, radius, spacing } from '../../theme/theme';
import { ADMIN_BOTTOM_BAR, ADMIN_SECTIONS, AdminSectionDef, AdminSectionKey } from '../../navigation/menu.config';

export function AdminShell() {
  const t = useTheme();
  const styles = stylesFor(t);
  const insets = useSafeAreaInsets();
  const { admin, logout, switchAdminSalon } = useAuth();
  const [section, setSection] = useState<AdminSectionKey>('dashboard');
  const [plusOpen, setPlusOpen] = useState(false);
  const { isTablet } = useLayout();
  const [collapsed, setCollapsed] = useSidebarCollapsed();

  if (!admin) return null; // garou : rendu uniquement avec session admin

  const def = (key: AdminSectionKey): AdminSectionDef | undefined => ADMIN_SECTIONS.find((s) => s.key === key);
  const current = def(section);
  const salons = admin.salons ?? [];
  const salonName = salons.find((s) => s.slug === admin.salonSlug)?.name ?? admin.salonSlug ?? 'Salon';
  const bottomSpace = isTablet ? 40 + insets.bottom : FLOATING_TABBAR_SPACE + insets.bottom;

  // Sélecteur d'enseigne du web (salon-switcher) : seulement s'il y a plusieurs salons.
  const pickSalon = () => {
    if (salons.length < 2) return;
    const go = (slug: string) => void switchAdminSalon(slug);
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { title: 'Salon', options: [...salons.map((s) => s.name), 'Annuler'], cancelButtonIndex: salons.length },
        (i) => {
          const s = salons[i];
          if (s) go(s.slug);
        }
      );
    } else {
      Alert.alert('Salon', undefined, [
        ...salons.map((s) => ({ text: s.name, onPress: () => go(s.slug) })),
        { text: 'Annuler', style: 'cancel' as const },
      ]);
    }
  };

  const tabs: GlassTab[] = [
    ...ADMIN_BOTTOM_BAR.map((key) => {
      const d = def(key);
      return { key, label: d?.label ?? key, icon: d?.icon ?? ('ellipse-outline' as const) };
    }),
    { key: 'plus', label: 'Plus', icon: 'ellipsis-horizontal' as const },
  ];
  const activeTab = plusOpen ? 'plus' : (ADMIN_BOTTOM_BAR as string[]).includes(section) ? section : 'plus';

  const sectionContent =
    section === 'dashboard' ? (
      <DashboardScreen bottomSpace={bottomSpace} />
    ) : (
      <ScrollView style={{ flex: 1 }} contentContainerStyle={[styles.content, { paddingBottom: bottomSpace }]}>
        {current ? <PageTitle t={t} title={current.label} /> : null}
        {section === 'queue' ? (
          <QueueBoard />
        ) : current ? (
          <ScreenPlaceholder phase={current.phase} description={current.desc} checklist={listFor(current)} />
        ) : null}
        <Text style={styles.version}>{APP_VERSION}</Text>
      </ScrollView>
    );

  if (isTablet) {
    return (
      <View style={[styles.safe, { flexDirection: 'row' }]}>
        <AdminSidebar
          t={t}
          active={section}
          onSelect={setSection}
          collapsed={collapsed}
          onToggle={() => setCollapsed(!collapsed)}
          salonName={salonName}
          canSwitchSalon={salons.length > 1}
          onPickSalon={pickSalon}
          email={admin.email}
          onLogout={() => void logout('admin')}
        />
        <SafeAreaView style={{ flex: 1 }} edges={['top', 'right']}>
          {sectionContent}
        </SafeAreaView>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.topbar}>
        <TouchableOpacity style={styles.salonBtn} onPress={pickSalon} disabled={salons.length < 2} accessibilityRole="button">
          <View style={styles.salonIc}>
            <Ionicons name="business-outline" size={15} color={t.blue} />
          </View>
          <Text style={styles.salonName} numberOfLines={1}>{salonName}</Text>
          {salons.length > 1 ? <Ionicons name="chevron-down" size={13} color={t.grey} /> : null}
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setPlusOpen(true)} accessibilityRole="button" accessibilityLabel={`Compte ${admin.email}`}>
          <Avatar t={t} name={admin.email} />
        </TouchableOpacity>
      </View>

      {sectionContent}

      <GlassTabBar
        t={t}
        tabs={tabs}
        active={activeTab}
        onPress={(key) => (key === 'plus' ? setPlusOpen(true) : setSection(key as AdminSectionKey))}
      />

      <Modal animationType="slide" presentationStyle="pageSheet" visible={plusOpen} onRequestClose={() => setPlusOpen(false)}>
        <View style={{ flex: 1, backgroundColor: t.bg }}>
          <View style={styles.plusHead}>
            <View style={{ flexShrink: 1 }}>
              <Text style={styles.plusTitle}>Plus</Text>
              <Text style={styles.plusSub} numberOfLines={1}>{admin.email}</Text>
            </View>
            <TouchableOpacity onPress={() => setPlusOpen(false)} accessibilityRole="button" hitSlop={8}>
              <Text style={{ color: t.blue, fontSize: 16, fontWeight: '600' }}>Fermer</Text>
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={styles.plusList}>
            <View style={styles.plusCard}>
              {ADMIN_SECTIONS.map((s, i) => (
                <TouchableOpacity
                  key={s.key}
                  style={styles.plusItem}
                  onPress={() => {
                    setSection(s.key);
                    setPlusOpen(false);
                  }}
                  accessibilityRole="button"
                >
                  {i > 0 ? <View style={styles.plusSep} /> : null}
                  <Ionicons name={s.icon} size={20} color={section === s.key ? t.blue : t.ink} />
                  <Text style={[styles.plusItemLabel, section === s.key && { color: t.blue, fontWeight: '600' }]}>{s.label}</Text>
                  <Ionicons name="chevron-forward" size={16} color={t.sep} />
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity style={[styles.plusCard, styles.plusItem]} onPress={() => void logout('admin')} accessibilityRole="button">
              <Ionicons name="log-out-outline" size={20} color={t.red} />
              <Text style={[styles.plusItemLabel, { color: t.red, fontWeight: '600' }]}>Déconnexion</Text>
            </TouchableOpacity>
            <Text style={styles.version}>{APP_VERSION}</Text>
          </ScrollView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function listFor(def: AdminSectionDef): string[] {
  return [def.desc];
}

const stylesFor = (t: Palette) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: t.bg },
    topbar: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm,
      paddingHorizontal: spacing.page, paddingTop: 6, paddingBottom: 10,
    },
    salonBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1, backgroundColor: t.card,
      borderRadius: 12, paddingVertical: 7, paddingLeft: 8, paddingRight: 10, ...cardShadow(t),
    },
    salonIc: { width: 26, height: 26, borderRadius: 8, backgroundColor: t.blueSoft, alignItems: 'center', justifyContent: 'center' },
    salonName: { color: t.ink, fontSize: 15, fontWeight: '600', flexShrink: 1 },
    content: { paddingHorizontal: spacing.page, paddingTop: 4 },
    version: { color: t.grey, fontSize: 11, textAlign: 'center', marginTop: spacing.md },
    plusHead: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md,
      paddingHorizontal: spacing.page, paddingTop: 18, paddingBottom: 12,
    },
    plusTitle: { color: t.ink, fontSize: 28, fontWeight: '700', letterSpacing: -0.6 },
    plusSub: { color: t.grey, fontSize: 13 },
    plusList: { paddingHorizontal: spacing.page, paddingBottom: spacing.xl, gap: spacing.block },
    plusCard: { backgroundColor: t.card, borderRadius: radius.card, overflow: 'hidden', ...cardShadow(t) },
    plusItem: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 13, paddingHorizontal: spacing.md },
    plusSep: { position: 'absolute', top: 0, left: 50, right: 0, height: StyleSheet.hairlineWidth, backgroundColor: t.hair },
    plusItemLabel: { color: t.ink, fontSize: 16, flex: 1 },
  });
