import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DayIllustration, Wordmark } from '@/components/Brand';
import { Button } from '@/components/Button';
import { colors, fonts, themed } from '@/theme';

/** Sveiciens: one screen, one promise, one button (was a 3-slide carousel). */
export default function Welcome() {
  return (
    <SafeAreaView style={styles.root} testID="welcome">
      <View style={styles.top}>
        <Wordmark />
      </View>
      <View style={styles.art}>
        <DayIllustration />
      </View>
      <View style={styles.copy}>
        <Text style={styles.title} accessibilityRole="header">
          Visa tava diena — vienā skatā
        </Text>
        <Text style={styles.body}>
          Nofotografē maltīti, un mēs to saliksim kopā ar soļiem un miegu no tava pulksteņa — bez tabulām un stresa.
        </Text>
        <Text style={styles.small}>Tavi dati paliek tavi: mēs tos nepārdodam, un visu vari izdzēst ar vienu pieskārienu.</Text>
      </View>
      <View style={styles.bottom}>
        <Button label="Sākam" variant="accent" onPress={() => router.push('/login')} testID="welcome-start" />
      </View>
    </SafeAreaView>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },
    top: { height: 44, marginTop: 12, paddingHorizontal: 24, flexDirection: 'row', alignItems: 'center' },
    art: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 280 },
    copy: { gap: 12, paddingHorizontal: 24, paddingBottom: 28 },
    title: { fontFamily: fonts.heading, fontSize: 32, lineHeight: 36, color: colors.ink },
    body: { fontFamily: fonts.body, fontSize: 17, lineHeight: 25, color: colors.text2 },
    small: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: colors.caption },
    bottom: { paddingHorizontal: 24, paddingBottom: 24 },
  }),
);
