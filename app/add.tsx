import { router, type Href } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useDay } from '@/api/hooks';
import { Icon, type IconName } from '@/components/Icon';
import { Sheet } from '@/components/Sheet';
import { formatNumber } from '@/lib/format';
import { GLASS_ML, useAddWater } from '@/lib/mutations';
import { useToday } from '@/lib/today';
import { colors, fonts, themed } from '@/theme';

interface Action {
  label: string;
  hint: string;
  icon: IconName;
  tint: string;
  bg: string;
  run: () => void;
}

/** Replace the sheet with another route. */
const go = (href: Href) => () => router.replace(href);

/** Global "+" sheet (prototype: Add-Sheet.dc.html). */
export default function AddSheet() {
  const date = useToday();
  const day = useDay(date);
  const water = useAddWater(date);
  const kg = day.data?.lastWeightKg;
  const actions: Action[] = [
    { label: 'Foto', hint: 'Nofotografē maltīti', icon: 'camera', tint: colors.accentText, bg: colors.accentSoft, run: go('/nutrition/camera') },
    {
      label: `+${GLASS_ML} ml ūdens`,
      hint: 'Viena glāze',
      icon: 'drop',
      tint: colors.waterDeep,
      bg: colors.waterSoft,
      run: () => {
        water.mutate(GLASS_ML);
        router.back();
      },
    },
    { label: 'Aktivitāte', hint: 'Ja pulkstenis to neredzēja', icon: 'movement', tint: colors.moveDeep, bg: colors.moveSoft, run: go('/activity') },
    {
      label: 'Svars',
      hint: kg ? `Pēdējais: ${formatNumber(kg, 1)} kg` : 'Pieraksti svaru',
      icon: 'scale',
      tint: colors.text2,
      bg: colors.neutralSoft,
      run: go('/weight'),
    },
  ];

  const [photo, ...rest] = actions;
  return (
    <Sheet title="Ko pievienosim?">
      {/* Photo is the main way to log, so it gets the big, brand-coloured tile. */}
      <Pressable
        onPress={photo.run}
        accessibilityRole="button"
        testID="add-photo"
        style={({ pressed }) => [styles.hero, pressed && { opacity: 0.85 }]}>
        <View style={styles.heroIcon}>
          <Icon name="camera" color={colors.commit} size={30} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.heroLabel}>Foto</Text>
          <Text style={styles.heroHint}>Nofotografē maltīti — pārējo izdarīsim mēs</Text>
        </View>
      </Pressable>
      <View style={styles.grid}>
        {rest.map((a) => (
          <Pressable
            key={a.label}
            onPress={a.run}
            accessibilityRole="button"
            style={({ pressed }) => [styles.tile, { backgroundColor: a.bg }, pressed && { opacity: 0.85 }]}>
            <Icon name={a.icon} color={a.tint} size={26} />
            <View>
              <Text style={styles.tileLabel}>{a.label}</Text>
              <Text style={styles.tileHint}>{a.hint}</Text>
            </View>
          </Pressable>
        ))}
      </View>
    </Sheet>
  );
}

const styles = themed(() => StyleSheet.create({
  hero: { flexDirection: 'row', alignItems: 'center', gap: 16, minHeight: 104, borderRadius: 24, padding: 18, marginBottom: 12, backgroundColor: colors.commit },
  heroIcon: { width: 56, height: 56, borderRadius: 18, backgroundColor: colors.onAccent, alignItems: 'center', justifyContent: 'center' },
  heroLabel: { fontFamily: fonts.bodyBold, fontSize: 20, color: colors.onAccent },
  heroHint: { fontFamily: fonts.body, fontSize: 14, lineHeight: 19, color: colors.onAccent, opacity: 0.85 },
  grid: { flexDirection: 'row', gap: 10 },
  tile: { flex: 1, height: 112, borderRadius: 20, padding: 14, justifyContent: 'space-between' },
  tileLabel: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.ink },
  tileHint: { fontFamily: fonts.body, fontSize: 13, color: colors.text2 },
}));
