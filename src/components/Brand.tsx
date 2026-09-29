import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G, Path, Rect, Text as SvgText } from 'react-native-svg';

import { colors, fonts } from '@/theme';

import { Icon } from './Icon';

/** Balanss mark: rounded accent square with a balance ring. */
export function Logo({ size = 32 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48" accessibilityLabel="Balanss">
      <Rect x={0} y={0} width={48} height={48} rx={15} fill={colors.accent} />
      <G rotation={-50} origin="24, 24">
        <Circle cx={24} cy={24} r={13} fill="none" stroke={colors.white} strokeWidth={4} strokeLinecap="round" strokeDasharray="64 82" />
      </G>
      <Path d="M16.5 24H31.5" stroke={colors.white} strokeWidth={3} strokeLinecap="round" />
      <Circle cx={24} cy={24} r={4.2} fill={colors.white} />
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

/** Slide 1: the day ring with water, sleep and movement chips. */
export function DayIllustration({ size = 300 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 300 300" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Circle cx={150} cy={150} r={138} fill={colors.accentSoft} />
      <Circle cx={150} cy={150} r={78} fill="none" stroke="#F1DCCB" strokeWidth={18} />
      <G rotation={-90} origin="150, 150">
        <Circle cx={150} cy={150} r={78} fill="none" stroke={colors.accent} strokeWidth={18} strokeLinecap="round" strokeDasharray="390 490" />
      </G>
      <SvgText x={150} y={146} textAnchor="middle" fontSize={34} fontWeight="700" fontFamily={fonts.heading} fill={colors.ink}>
        1 480
      </SvgText>
      <SvgText x={150} y={172} textAnchor="middle" fontSize={14} fontFamily={fonts.bodyMedium} fill={colors.caption}>
        no 1 750 kcal
      </SvgText>
      <Rect x={222} y={48} width={58} height={58} rx={18} fill={colors.white} />
      <Path d="M251 62s12 13 12 22a12 12 0 0 1-24 0c0-9 12-22 12-22z" fill="#BFDDEF" stroke={colors.water} strokeWidth={2} />
      <Rect x={22} y={196} width={58} height={58} rx={18} fill={colors.white} />
      <Path d="M62 232a14 14 0 1 1-17-18 11 11 0 0 0 17 18z" fill="#D6DBEE" stroke={colors.protein} strokeWidth={2} />
      <Rect x={206} y={214} width={66} height={40} rx={14} fill={colors.white} />
      <Path d="M216 236h9l5-10 7 18 5-8h20" fill="none" stroke={colors.steps} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/** Slide 2: devices flowing into Balanss. */
export function DevicesIllustration() {
  return (
    <View style={[styles.circle, { backgroundColor: '#E9EEF6', gap: 14 }]}>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        {(['watch', 'target', 'heart'] as const).map((i) => (
          <View key={i} style={styles.tile}>
            <Icon name={i} color={colors.protein} size={30} />
          </View>
        ))}
      </View>
      <Svg width={28} height={28} viewBox="0 0 24 24">
        <Path d="M12 4v16M6 14l6 6 6-6" stroke={colors.protein} strokeWidth={1.8} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
      <View style={styles.pill}>
        <Logo size={36} />
        <Text style={styles.pillText}>Balanss</Text>
      </View>
    </View>
  );
}

/** Slide 3: shield — your data stays yours. */
export function PrivacyIllustration() {
  return (
    <View style={[styles.circle, { backgroundColor: colors.moveSoft }]}>
      <View style={styles.shieldCard}>
        <Svg width={56} height={56} viewBox="0 0 24 24">
          <Path d="M12 3l7 3v5.5c0 4.5-3 8-7 9.5-4-1.5-7-5-7-9.5V6z" stroke="#3F6E57" strokeWidth={1.5} fill="none" strokeLinejoin="round" />
          <Path d="M9 12l2.2 2.2L15.5 10" stroke="#3F6E57" strokeWidth={1.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          <View style={[styles.bar, { width: 26 }]} />
          <View style={[styles.bar, { width: 40 }]} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  word: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  wordText: { fontFamily: fonts.heading, fontSize: 22, color: colors.ink },
  circle: { width: 300, height: 300, borderRadius: 150, alignItems: 'center', justifyContent: 'center' },
  tile: { width: 64, height: 64, borderRadius: 20, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  pill: { height: 64, paddingHorizontal: 22, borderRadius: 20, backgroundColor: colors.white, flexDirection: 'row', alignItems: 'center', gap: 10 },
  pillText: { fontFamily: fonts.headingSemi, fontSize: 18, color: colors.ink },
  shieldCard: { width: 150, height: 170, borderRadius: 36, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center', gap: 14 },
  bar: { height: 6, borderRadius: 3, backgroundColor: '#B9D3C4' },
});
