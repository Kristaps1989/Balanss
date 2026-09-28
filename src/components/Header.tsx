import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fonts, hit } from '@/theme';

import { Icon, type IconName } from './Icon';

/** Round icon button, 44 px (back, close, day switch). */
export function IconButton({
  icon,
  label,
  onPress,
  color = colors.ink,
  bg,
  size = 24,
  disabled,
  testID,
}: {
  icon: IconName;
  label: string;
  onPress?: () => void;
  color?: string;
  bg?: string;
  size?: number;
  disabled?: boolean;
  testID?: string;
}) {
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={4}
      style={({ pressed }) => [
        styles.iconBtn,
        bg ? { backgroundColor: bg } : null,
        pressed && { opacity: 0.7 },
        disabled && { opacity: 0.35 },
      ]}>
      <Icon name={icon} color={color} size={size} />
    </Pressable>
  );
}

export function BackButton({ onPress, label = 'Atpakaļ' }: { onPress?: () => void; label?: string }) {
  return (
    <IconButton
      icon="back"
      label={label}
      onPress={onPress ?? (() => (router.canGoBack() ? router.back() : router.replace('/')))}
    />
  );
}

/** Onboarding top bar: back, progress bar, "2/7". */
export function StepHeader({ step, total = 7, onBack }: { step: number; total?: number; onBack?: () => void }) {
  return (
    <View style={styles.step}>
      <BackButton onPress={onBack} />
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${(step / total) * 100}%` }]} />
      </View>
      <Text style={styles.count}>
        {step}/{total}
      </Text>
    </View>
  );
}

/** Screen title row with optional right-side content. */
export function TitleRow({ title, right }: { title: string; right?: ReactNode }) {
  return (
    <View style={styles.titleRow}>
      <Text style={styles.title} accessibilityRole="header">
        {title}
      </Text>
      {right}
    </View>
  );
}

const styles = StyleSheet.create({
  iconBtn: { width: hit, height: hit, borderRadius: hit / 2, alignItems: 'center', justifyContent: 'center' },
  step: { flexDirection: 'row', alignItems: 'center', gap: 12, height: 44 },
  track: { flex: 1, height: 6, borderRadius: 3, backgroundColor: '#E6DED3', overflow: 'hidden' },
  fill: { height: 6, backgroundColor: colors.ink },
  count: { fontFamily: fonts.bodySemi, fontSize: 13, color: colors.caption },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontFamily: fonts.heading, fontSize: 30, lineHeight: 36, color: colors.ink, letterSpacing: -0.6 },
});
