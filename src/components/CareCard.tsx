import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { CARE_COPY } from '@shared/safety';
import { colors, fonts, radius } from '@/theme';

import { Icon } from './Icon';

/** Shown on Šodiena while care mode is active: calm, no numbers, points to support. */
export function CareCard() {
  return (
    <View style={styles.card} testID="care-card" accessibilityRole="summary">
      <View style={styles.title}>
        <Icon name="heart" color={colors.moveDeep} size={18} />
        <Text style={styles.titleText}>{CARE_COPY.title}</Text>
      </View>
      <Text style={styles.body}>{CARE_COPY.body}</Text>
      <Pressable onPress={() => Linking.openURL('tel:116123')} accessibilityRole="link" style={{ minHeight: 44, justifyContent: 'center' }}>
        <Text style={styles.support}>{CARE_COPY.support}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.moveSoft, borderRadius: radius.card, padding: 18, gap: 8 },
  title: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  titleText: { fontFamily: fonts.bodyBold, fontSize: 15, color: '#24503B' },
  body: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, color: '#24503B' },
  support: { fontFamily: fonts.bodySemi, fontSize: 14, lineHeight: 20, color: colors.moveDeep, textDecorationLine: 'underline' },
});
