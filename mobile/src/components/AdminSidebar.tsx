// Menu latéral admin sur TABLETTE (maquette maquettes-tablette.html) :
// les 13 sections du web, sélecteur de salon, compte + Déconnexion en bas.
// Repliable en colonne d'icônes ; le choix est mémorisé sur l'appareil.
import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ADMIN_SECTIONS, AdminSectionKey } from '../navigation/menu.config';
import { Palette } from '../theme/theme';
import { Avatar } from './ui';

const KEY = 'tbo.ui.sidebarCollapsed';

export function useSidebarCollapsed(): [boolean, (v: boolean) => void] {
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    SecureStore.getItemAsync(KEY)
      .then((v) => setCollapsed(v === '1'))
      .catch(() => undefined);
  }, []);
  const set = (v: boolean) => {
    setCollapsed(v);
    void SecureStore.setItemAsync(KEY, v ? '1' : '0').catch(() => undefined);
  };
  return [collapsed, set];
}

export function AdminSidebar({ t, active, onSelect, collapsed, onToggle, salonName, canSwitchSalon, onPickSalon, email, onLogout }: {
  t: Palette;
  active: AdminSectionKey;
  onSelect: (k: AdminSectionKey) => void;
  collapsed: boolean;
  onToggle: () => void;
  salonName: string;
  canSwitchSalon: boolean;
  onPickSalon: () => void;
  email: string;
  onLogout: () => void;
}) {
  const insets = useSafeAreaInsets();
  const styles = stylesFor(t);
  const toggle = (
    <TouchableOpacity onPress={onToggle} style={styles.fold} accessibilityRole="button" accessibilityLabel={collapsed ? 'Déplier le menu' : 'Replier le menu'} hitSlop={6}>
      <Ionicons name={collapsed ? 'chevron-forward-circle-outline' : 'chevron-back-circle-outline'} size={22} color={t.blue} />
    </TouchableOpacity>
  );

  return (
    <View style={[styles.side, collapsed && styles.sideMini, { paddingTop: insets.top + 10, paddingBottom: Math.max(insets.bottom, 12) }]}>
      <View style={[styles.top, collapsed && { flexDirection: 'column' }]}>
        {collapsed ? toggle : null}
        <TouchableOpacity
          style={[styles.salonBtn, collapsed && styles.salonMini]}
          onPress={onPickSalon}
          disabled={!canSwitchSalon}
          accessibilityRole="button"
          accessibilityLabel={`Salon ${salonName}`}
        >
          <View style={styles.salonIc}>
            <Ionicons name="business-outline" size={15} color={t.blue} />
          </View>
          {!collapsed ? (
            <>
              <Text style={styles.salonName} numberOfLines={1}>{salonName}</Text>
              {canSwitchSalon ? <Ionicons name="chevron-down" size={13} color={t.grey} /> : null}
            </>
          ) : null}
        </TouchableOpacity>
        {!collapsed ? toggle : null}
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: 2 }} showsVerticalScrollIndicator={false}>
        {ADMIN_SECTIONS.map((s) => {
          const on = s.key === active;
          return (
            <Pressable
              key={s.key}
              onPress={() => onSelect(s.key)}
              accessibilityRole="button"
              accessibilityLabel={s.label}
              accessibilityState={{ selected: on }}
              style={[styles.item, collapsed && styles.itemMini, on && { backgroundColor: t.blue }]}
            >
              <Ionicons name={s.icon} size={collapsed ? 21 : 19} color={on ? '#fff' : t.blue} />
              {!collapsed ? <Text style={[styles.itemLabel, on && styles.itemLabelOn]} numberOfLines={1}>{s.label}</Text> : null}
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={[styles.acc, collapsed && { justifyContent: 'center' }]}>
        <Avatar t={t} name={email} />
        {!collapsed ? (
          <>
            <Text style={styles.email} numberOfLines={1}>{email}</Text>
            <TouchableOpacity onPress={onLogout} accessibilityRole="button" accessibilityLabel="Déconnexion" hitSlop={8}>
              <Ionicons name="log-out-outline" size={20} color={t.red} />
            </TouchableOpacity>
          </>
        ) : null}
      </View>
    </View>
  );
}

const stylesFor = (t: Palette) =>
  StyleSheet.create({
    side: {
      width: 268,
      backgroundColor: t.scheme === 'dark' ? '#111113' : t.card,
      borderRightWidth: StyleSheet.hairlineWidth,
      borderRightColor: t.sep,
      paddingHorizontal: 12,
    },
    sideMini: { width: 76, paddingHorizontal: 10, alignItems: 'center' },
    top: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
    fold: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    salonBtn: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: t.fill, borderRadius: 12, padding: 8 },
    salonMini: { flex: 0, width: 44, height: 44, padding: 0, justifyContent: 'center' },
    salonIc: { width: 26, height: 26, borderRadius: 8, backgroundColor: t.blueSoft, alignItems: 'center', justifyContent: 'center' },
    salonName: { color: t.ink, fontSize: 15, fontWeight: '600', flex: 1 },
    item: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 9, paddingHorizontal: 12, borderRadius: 10 },
    itemMini: { width: 48, height: 44, paddingHorizontal: 0, justifyContent: 'center' },
    itemLabel: { color: t.ink, fontSize: 15.5, flex: 1 },
    itemLabelOn: { color: '#fff', fontWeight: '600' },
    acc: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.sep },
    email: { color: t.grey, fontSize: 13, flex: 1 },
  });
