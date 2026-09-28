import { router } from 'expo-router';
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { Fragment } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fonts } from '@/theme';

import { Icon, type IconName } from './Icon';

const TABS: Record<string, { label: string; icon: IconName }> = {
  index: { label: 'Šodiena', icon: 'today' },
  nutrition: { label: 'Uzturs', icon: 'nutrition' },
  movement: { label: 'Kustība', icon: 'movement' },
  sleep: { label: 'Miegs', icon: 'sleep' },
};

/** Five equal slots: Šodiena · Uzturs · (+) · Kustība · Miegs. */
export function TabBar({ state, navigation, insets }: BottomTabBarProps) {
  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      {state.routes.map((route, index) => {
        const tab = TABS[route.name];
        if (!tab) return null;
        const focused = state.index === index;
        const color = focused ? colors.accentText : colors.caption;

        const onPress = () => {
          const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!focused && !event.defaultPrevented) navigation.navigate(route.name, route.params);
        };

        return (
          <Fragment key={route.key}>
            {index === 2 && <AddButton />}
            <Pressable
              onPress={onPress}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={tab.label}
              style={styles.slot}>
              <Icon name={tab.icon} color={color} size={24} />
              <Text style={[styles.label, { color }, focused && styles.labelActive]}>{tab.label}</Text>
            </Pressable>
          </Fragment>
        );
      })}
    </View>
  );
}

function AddButton() {
  return (
    <View style={styles.addSlot}>
      <Pressable
        onPress={() => router.push('/add')}
        accessibilityRole="button"
        accessibilityLabel="Pievienot"
        style={({ pressed }) => [styles.add, pressed && { transform: [{ scale: 0.95 }] }]}>
        <Icon name="plus" color={colors.white} size={26} strokeWidth={2.4} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.navBorder,
    paddingTop: 6,
    paddingHorizontal: 8,
  },
  slot: {
    flex: 1,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  addSlot: { flex: 1, alignItems: 'center' },
  label: { fontFamily: fonts.bodySemi, fontSize: 11, lineHeight: 14 },
  labelActive: { fontFamily: fonts.bodyBold },
  add: {
    width: 60,
    height: 60,
    marginTop: -24,
    borderRadius: 30,
    borderWidth: 4,
    borderColor: colors.bg,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.accent,
    shadowOpacity: 0.3,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
});
