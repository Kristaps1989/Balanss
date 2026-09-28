import { Pressable, StyleSheet, Text } from 'react-native';

import { colors, fonts } from '@/theme';

interface Props {
  name: string;
  onPress?: () => void;
}

export function Avatar({ name, onPress }: Props) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Mans profils"
      hitSlop={4}
      style={({ pressed }) => [styles.avatar, pressed && { opacity: 0.8 }]}>
      <Text style={styles.initial}>{name.charAt(0).toUpperCase()}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: colors.avatar,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initial: { fontFamily: fonts.heading, fontSize: 19, color: colors.ink },
});
