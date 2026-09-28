import { StyleSheet, Text } from 'react-native';

import type { HealthSource } from '@/api';
import { type } from '@/theme';

const LABEL: Record<HealthSource, string> = {
  apple_health: 'Dati no Apple Health',
  health_connect: 'Dati no Health Connect',
  manual: 'Ievadīts manuāli',
};

export function SourceNote({ source, devices }: { source: HealthSource; devices?: string[] }) {
  const extra = devices?.length ? ` · ${devices.join(', ')}` : '';
  return <Text style={styles.note}>{LABEL[source] + extra}</Text>;
}

const styles = StyleSheet.create({
  note: type.caption,
});
