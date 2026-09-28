import { router, type Href } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useDay } from '@/api/hooks';
import { Icon, type IconName } from '@/components/Icon';
import { Sheet } from '@/components/Sheet';
import { formatNumber } from '@/lib/format';
import { GLASS_ML, useAddWater } from '@/lib/mutations';
import { useToday } from '@/lib/today';
import { colors, fonts } from '@/theme';

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

  return (
    <Sheet title="Ko pievienosim?">
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
    </Sheet>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  tile: { width: '47%', flexGrow: 1, height: 120, borderRadius: 22, padding: 16, justifyContent: 'space-between' },
  tileLabel: { fontFamily: fonts.bodyBold, fontSize: 17, color: colors.ink },
  tileHint: { fontFamily: fonts.body, fontSize: 13, color: colors.text2 },
});
