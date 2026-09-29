import { StyleSheet, Text } from 'react-native';

import { colors, fonts } from '@/theme';

/** Transparency label under AI-written content. */
export function AiLabel({ ai, color = colors.caption }: { ai: boolean; color?: string }) {
  return (
    <Text style={[styles.label, { color }]}>
      {ai ? 'Sagatavojis AI pēc taviem datiem · ieteikums, nevis medicīnisks padoms' : 'Balanss ieteikums · nevis medicīnisks padoms'}
    </Text>
  );
}

const styles = StyleSheet.create({
  label: { fontFamily: fonts.body, fontSize: 12, lineHeight: 16 },
});
