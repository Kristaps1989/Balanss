import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, fonts, hit, radius } from '@/theme';

import { Icon } from './Icon';

/** Card with a big value and −/+ buttons (prototype: Onb-Basics). */
export function StepperCard({
  label,
  value,
  unit,
  onDec,
  onInc,
  style,
}: {
  label: string;
  value: string;
  unit?: string;
  onDec: () => void;
  onInc: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.stepper, style]}>
      <Text style={styles.stepperLabel}>{label}</Text>
      <Text style={styles.stepperValue} accessibilityLabel={`${label}: ${value} ${unit ?? ''}`}>
        {value}
      </Text>
      <Text style={styles.stepperUnit}>{unit ?? ''}</Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <RoundButton icon="minus" label={`${label}: mazāk`} onPress={onDec} />
        <RoundButton icon="plus" label={`${label}: vairāk`} onPress={onInc} />
      </View>
    </View>
  );
}

export function RoundButton({ icon, label, onPress, bg = colors.chip }: { icon: 'minus' | 'plus'; label: string; onPress: () => void; bg?: string }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.round, { backgroundColor: bg }, pressed && { opacity: 0.7 }]}>
      <Icon name={icon} color={colors.ink} size={18} strokeWidth={2.2} />
    </Pressable>
  );
}

/** Row of pill choices; selected is ink-filled (prototype: Dzimums). */
export function PillChoice<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T | null;
  onChange: (v: T) => void;
}) {
  return (
    <View style={{ flexDirection: 'row', gap: 8 }} accessibilityRole="radiogroup">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            accessibilityRole="radio"
            aria-checked={on}
            style={[styles.pill, { backgroundColor: on ? colors.ink : colors.white, borderColor: on ? colors.ink : colors.inputBorder }]}>
            <Text style={[styles.pillText, { color: on ? colors.white : colors.ink }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Segmented control on a chip background (prototype: Reti / Vidēji / Bieži). */
export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  style,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.seg, style]} accessibilityRole="radiogroup">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={String(o.value)}
            onPress={() => onChange(o.value)}
            accessibilityRole="radio"
            aria-checked={on}
            style={[styles.segItem, on && styles.segOn]}>
            <Text style={styles.segText}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Selectable card with an accent border when on (prototype: activity level, goals). */
export function OptionCard({
  selected,
  onPress,
  children,
  style,
  accessibilityLabel,
  multi,
}: {
  selected: boolean;
  onPress: () => void;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  multi?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={multi ? 'checkbox' : 'radio'}
      aria-checked={selected}
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [
        styles.option,
        { backgroundColor: selected ? colors.accentSoft : colors.white, borderColor: selected ? colors.accent : colors.optionBorder },
        pressed && { opacity: 0.9 },
        style,
      ]}>
      {children}
    </Pressable>
  );
}

/** On/off switch (prototype: green track when on). */
export function Toggle({
  value,
  onChange,
  label,
  onColor = colors.moveDeep,
  testID,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
  label: string;
  onColor?: string;
  testID?: string;
}) {
  return (
    <Pressable
      testID={testID}
      onPress={() => onChange(!value)}
      accessibilityRole="switch"
      accessibilityLabel={label}
      aria-checked={value}
      hitSlop={8}
      style={[styles.toggle, { backgroundColor: value ? onColor : colors.toggleOff, justifyContent: value ? 'flex-end' : 'flex-start' }]}>
      <View style={styles.knob} />
    </Pressable>
  );
}

/** Checkbox row (prototype: consent on Onb-TestIntro). */
export function CheckRow({ checked, onChange, title, hint }: { checked: boolean; onChange: (v: boolean) => void; title: string; hint?: string }) {
  return (
    <Pressable
      onPress={() => onChange(!checked)}
      accessibilityRole="checkbox"
      aria-checked={checked}
      style={styles.checkRow}>
      <View style={[styles.box, { backgroundColor: checked ? colors.accent : colors.white, borderColor: checked ? colors.accent : colors.boxBorder }]}>
        {checked && <Icon name="check" color={colors.white} size={16} strokeWidth={2.6} />}
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.checkTitle}>{title}</Text>
        {hint ? <Text style={styles.checkHint}>{hint}</Text> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  stepper: {
    flex: 1,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.optionBorder,
    borderRadius: radius.option,
    paddingVertical: 12,
    paddingHorizontal: 8,
    alignItems: 'center',
    gap: 4,
  },
  stepperLabel: { fontFamily: fonts.bodySemi, fontSize: 13, color: colors.caption },
  stepperValue: { fontFamily: fonts.heading, fontSize: 30, lineHeight: 34, color: colors.ink },
  stepperUnit: { fontFamily: fonts.body, fontSize: 12, lineHeight: 16, height: 16, color: colors.caption },
  round: { width: hit, height: hit, borderRadius: hit / 2, alignItems: 'center', justifyContent: 'center' },
  pill: { flex: 1, height: 52, borderRadius: 26, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  pillText: { fontFamily: fonts.bodySemi, fontSize: 15 },
  chip: { minHeight: 44, borderRadius: 22, borderWidth: 1, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  seg: { flexDirection: 'row', backgroundColor: colors.chip, borderRadius: 22, padding: 4, gap: 4 },
  segItem: { flex: 1, minHeight: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  segOn: {
    backgroundColor: colors.white,
    shadowColor: colors.ink,
    shadowOpacity: 0.12,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  segText: { fontFamily: fonts.bodySemi, fontSize: 13, color: colors.ink, textAlign: 'center' },
  option: { borderRadius: radius.option, borderWidth: 1.5, padding: 14 },
  toggle: { width: 52, height: 32, borderRadius: 16, padding: 3, flexDirection: 'row' },
  knob: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.white,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  checkRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', minHeight: 44 },
  box: { width: 24, height: 24, borderRadius: 7, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  checkTitle: { fontFamily: fonts.bodySemi, fontSize: 15, lineHeight: 20, color: colors.ink },
  checkHint: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: colors.text2 },
});

/** Wrapping single-choice chips (genres, cities). Each chip ≥ 44 px tall. */
export function ChipGroup<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: string }[];
  value: T | null;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }} accessibilityRole="radiogroup" accessibilityLabel={label}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            accessibilityRole="radio"
            aria-checked={on}
            style={[styles.chip, { backgroundColor: on ? colors.ink : colors.white, borderColor: on ? colors.ink : colors.inputBorder }]}>
            <Text style={[styles.pillText, { color: on ? colors.white : colors.ink }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
