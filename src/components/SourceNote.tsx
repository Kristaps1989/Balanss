import { StyleSheet, Text } from 'react-native';

import type { HealthSource } from '@/api';
import { type } from '@/theme';

const LABEL: Record<HealthSource, string> = {
  apple_health: 'Dati no Apple Health',
  health_connect: 'Dati no Health Connect',
};

export function SourceNote({ source }: { source: HealthSource }) {
  return <Text style={styles.note}>{LABEL[source]}</Text>;
}

const styles = StyleSheet.create({
  note: type.caption,
});
