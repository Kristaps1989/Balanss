import { StyleSheet, Text, View } from 'react-native';

import type { Personality } from '@/api';
import { levelLabel, scorePercent, TRAITS, TRAIT_LABEL, TRAIT_LABEL_SHORT } from '@shared/personality';
import { colors, fonts } from '@/theme';

/** Five trait bars with low / medium / high labels (prototype: Onb-Result, Me). */
export function TraitBars({ personality, short }: { personality: Personality; short?: boolean }) {
  return (
    <View style={{ gap: 16 }}>
      {TRAITS.map((t) => {
        const name = short ? TRAIT_LABEL_SHORT[t] : TRAIT_LABEL[t];
        const level = levelLabel(t, personality.levels[t]);
        const pct = Math.max(6, scorePercent(personality.scores[t]));
        return (
          <View key={t} style={{ gap: 7 }} accessible accessibilityLabel={`${name}: ${level}`}>
            <View style={styles.row}>
              <Text style={styles.name}>{name}</Text>
              <Text style={styles.level}>{level}</Text>
            </View>
            <View style={styles.track}>
              <View style={[styles.fill, { width: `${pct}%` }]} />
            </View>
          </View>
        );
      })}
      <View style={styles.scale} importantForAccessibility="no-hide-descendants">
        <Text style={styles.scaleText}>zems</Text>
        <Text style={styles.scaleText}>vidējs</Text>
        <Text style={styles.scaleText}>augsts</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  name: { fontFamily: fonts.bodySemi, fontSize: 15, color: colors.ink },
  level: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.text2 },
  track: { height: 10, borderRadius: 5, backgroundColor: '#F0E9DF' },
  fill: { height: 10, borderRadius: 5, backgroundColor: colors.accent },
  scale: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 2 },
  scaleText: { fontFamily: fonts.body, fontSize: 12, color: colors.caption },
});
