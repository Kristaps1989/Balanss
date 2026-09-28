import { router, type Href } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getMe, useAsync } from '@/api';
import { Icon, type IconName } from '@/components/Icon';
import { formatNumber } from '@/lib/format';
import { addWater, GLASS_ML } from '@/store/water';
import { colors, fonts, hit, radius, space, type } from '@/theme';

interface Action {
  label: string;
  hint: string;
  icon: IconName;
  tint: string;
  bg: string;
  run: () => void;
}

/** Closes the sheet, then opens a route behind it. */
const go = (href: Href) => () => {
  router.back();
  router.navigate(href);
};

/** Global "+" sheet (prototype: Add-Sheet.dc.html). */
export default function AddSheet() {
  const insets = useSafeAreaInsets();
  const user = useAsync(getMe);
  const actions: Action[] = [
    { label: 'Foto', hint: 'Nofotografē maltīti', icon: 'camera', tint: colors.accentText, bg: colors.accentSoft, run: go('/nutrition') },
    {
      label: `+${GLASS_ML} ml ūdens`,
      hint: 'Viena glāze',
      icon: 'drop',
      tint: colors.waterDeep,
      bg: colors.waterSoft,
      run: () => {
        addWater();
        router.back();
      },
    },
    { label: 'Aktivitāte', hint: 'Ja pulkstenis to neredzēja', icon: 'movement', tint: colors.moveDeep, bg: colors.moveSoft, run: go('/movement') },
    {
      label: 'Svars',
      hint: user ? `Pēdējais: ${formatNumber(user.weightKg, 1)} kg` : 'Pieraksti svaru',
      icon: 'scale',
      tint: colors.text2,
      bg: colors.neutralSoft,
      run: go('/me'),
    },
  ];

  return (
    <View style={styles.root}>
      <Pressable style={StyleSheet.absoluteFill} onPress={() => router.back()} accessibilityLabel="Aizvērt" />
      <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) + 24 }]} accessibilityLabel="Pievienot">
        <View style={styles.handle} />
        <View style={styles.header}>
          <Text style={type.h2}>Ko pievienosim?</Text>
          <Pressable
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Aizvērt"
            style={styles.close}>
            <Icon name="close" color={colors.ink} size={20} />
          </Pressable>
        </View>
        <View style={styles.grid}>
          {actions.map((a) => (
            <Pressable
              key={a.label}
              onPress={a.run}
              accessibilityRole="button"
              style={({ pressed }) => [styles.tile, { backgroundColor: a.bg }, pressed && { opacity: 0.85 }]}>
              <Icon name={a.icon} color={a.tint} size={30} />
              <View>
                <Text style={styles.tileLabel}>{a.label}</Text>
                <Text style={styles.tileHint}>{a.hint}</Text>
              </View>
            </Pressable>
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end', backgroundColor: colors.scrim },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    paddingHorizontal: space.screen,
    paddingTop: 10,
    gap: space.lg,
  },
  handle: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: colors.handle },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  close: {
    width: hit,
    height: hit,
    borderRadius: hit / 2,
    backgroundColor: colors.chip,
    alignItems: 'center',
    justifyContent: 'center',
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  tile: {
    width: '48%',
    flexGrow: 1,
    height: 120,
    borderRadius: 22,
    padding: 16,
    justifyContent: 'space-between',
  },
  tileLabel: { fontFamily: fonts.bodyBold, fontSize: 17, color: colors.ink },
  tileHint: { fontFamily: fonts.body, fontSize: 13, color: colors.text2 },
});
