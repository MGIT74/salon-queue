// Barre d'onglets FLOTTANTE avec effet verre (docs/DESIGN.md §3 bis).
// iOS 26+ : Liquid Glass natif (expo-glass-effect). Sinon : flou système
// (expo-blur). Le contenu défile dessous : chaque écran réserve
// FLOATING_TABBAR_SPACE + insets.bottom en bas de son contenu.
import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Palette } from '../theme/theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

export type GlassTab = { key: string; label: string; icon: IconName; danger?: boolean };

const liquid = (() => {
  try {
    return Platform.OS === 'ios' && isLiquidGlassAvailable();
  } catch {
    return false;
  }
})();

export function GlassTabBar({ t, tabs, active, onPress }: {
  t: Palette;
  tabs: GlassTab[];
  active: string | null;
  onPress: (key: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const dark = t.scheme === 'dark';

  const content = (
    <View style={styles.row}>
      {tabs.map((tab) => {
        const on = tab.key === active;
        const color = tab.danger ? t.red : on ? t.blue : t.ink;
        return (
          <Pressable
            key={tab.key}
            onPress={() => onPress(tab.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            style={[styles.tab, on && { backgroundColor: dark ? 'rgba(255,255,255,0.10)' : 'rgba(0,98,196,0.10)' }]}
          >
            <Ionicons name={tab.icon} size={23} color={color} style={{ opacity: on || tab.danger ? 1 : 0.72 }} />
            <Text style={[styles.label, { color, opacity: on || tab.danger ? 1 : 0.72 }]} numberOfLines={1}>
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );

  return (
    <View
      pointerEvents="box-none"
      style={[
        styles.wrap,
        { bottom: Math.max(insets.bottom, 12) + 8 },
        {
          shadowColor: '#000',
          shadowOpacity: dark ? 0.5 : 0.14,
          shadowRadius: 14,
          shadowOffset: { width: 0, height: 8 },
          elevation: 8,
        },
      ]}
    >
      {liquid ? (
        <GlassView style={styles.glass} glassEffectStyle="regular" colorScheme={dark ? 'dark' : 'light'} isInteractive>
          {content}
        </GlassView>
      ) : (
        <BlurView
          style={[
            styles.glass,
            {
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: dark ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.7)',
              backgroundColor: dark ? 'rgba(44,44,46,0.35)' : 'rgba(255,255,255,0.35)',
            },
          ]}
          intensity={60}
          tint={dark ? 'systemChromeMaterialDark' : 'systemChromeMaterialLight'}
        >
          {content}
        </BlurView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 14, right: 14, borderRadius: 32 },
  glass: { height: 64, borderRadius: 32, overflow: 'hidden', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6 },
  tab: { flex: 1, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', gap: 2 },
  label: { fontSize: 10, fontWeight: '600' },
});
