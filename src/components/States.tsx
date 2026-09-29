import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { colors, space, type } from '@/theme';

import { Button } from './Button';

export function Loading({ label = 'Ielādē…' }: { label?: string }) {
  return (
    <View style={styles.center} accessibilityLabel={label}>
      <ActivityIndicator color={colors.accent} />
    </View>
  );
}

/** Friendly error with retry; message in Latvian, never shows raw errors. */
export function ErrorState({ onRetry, message }: { onRetry?: () => void; message?: string }) {
  return (
    <View style={styles.center}>
      <Text style={[type.bodySemi, { textAlign: 'center' }]}>{message ?? 'Neizdevās ielādēt datus.'}</Text>
      <Text style={[type.secondary, { textAlign: 'center' }]}>Pārbaudi interneta savienojumu un mēģini vēlreiz.</Text>
      {onRetry && <Button label="Mēģināt vēlreiz" onPress={onRetry} size="md" variant="light" />}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.md, padding: space.xxl, backgroundColor: colors.bg },
});
