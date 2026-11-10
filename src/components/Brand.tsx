import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G, Path, Rect, Text as SvgText } from 'react-native-svg';

import { colors, fonts, themed } from '@/theme';

/** Balanss mark: rounded accent square with a balance ring. */
export function Logo({ size = 32 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48" accessibilityLabel="Balanss">
      <Rect x={0} y={0} width={48} height={48} rx={15} fill={colors.accent} />
      <G rotation={-50} origin="24, 24">
        <Circle cx={24} cy={24} r={13} fill="none" stroke={colors.onAccent} strokeWidth={4} strokeLinecap="round" strokeDasharray="64 82" />
      </G>
      <Path d="M16.5 24H31.5" stroke={colors.onAccent} strokeWidth={3} strokeLinecap="round" />
      <Circle cx={24} cy={24} r={4.2} fill={colors.onAccent} />
    </Svg>
  );
}

export function Wordmark() {
  return (
    <View style={styles.word}>
      <Logo size={32} />
      <Text style={styles.wordText}>Balanss</Text>
    </View>
  );
}

/** Welcome: the day ring with water, sleep and movement chips. */
export function DayIllustration({ size = 300 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 300 300" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Circle cx={150} cy={150} r={138} fill={colors.accentSoft} />
      <Circle cx={150} cy={150} r={78} fill="none" stroke={colors.kcalTrack} strokeWidth={18} />
      <G rotation={-90} origin="150, 150">
        <Circle cx={150} cy={150} r={78} fill="none" stroke={colors.accent} strokeWidth={18} strokeLinecap="round" strokeDasharray="390 490" />
      </G>
      <SvgText x={150} y={146} textAnchor="middle" fontSize={34} fontWeight="700" fontFamily={fonts.number} fill={colors.ink}>
        1 480
      </SvgText>
      <SvgText x={150} y={172} textAnchor="middle" fontSize={14} fontFamily={fonts.bodyMedium} fill={colors.caption}>
        no 1 750 kcal
      </SvgText>
      <Rect x={222} y={48} width={58} height={58} rx={18} fill={colors.card} />
      <Path d="M251 62s12 13 12 22a12 12 0 0 1-24 0c0-9 12-22 12-22z" fill={colors.waterSoft} stroke={colors.water} strokeWidth={2} />
      <Rect x={22} y={196} width={58} height={58} rx={18} fill={colors.card} />
      <Path d="M62 232a14 14 0 1 1-17-18 11 11 0 0 0 17 18z" fill={colors.proteinTrack} stroke={colors.protein} strokeWidth={2} />
      <Rect x={206} y={214} width={66} height={40} rx={14} fill={colors.card} />
      <Path d="M216 236h9l5-10 7 18 5-8h20" fill="none" stroke={colors.steps} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

const styles = themed(() => StyleSheet.create({
  word: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  wordText: { fontFamily: fonts.heading, fontSize: 22, color: colors.ink },
}));
