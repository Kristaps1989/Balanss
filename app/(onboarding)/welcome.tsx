import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, useWindowDimensions, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DayIllustration, DevicesIllustration, PrivacyIllustration, Wordmark } from '@/components/Brand';
import { Button } from '@/components/Button';
import { IconButton } from '@/components/Header';
import { colors, fonts } from '@/theme';

const SLIDES = [
  {
    title: 'Visa tava diena — vienā skatā',
    body: 'Nofotografē maltīti, un mēs to saskaitīsim kopā ar kustību un miegu — bez tabulām un stresa.',
    art: <DayIllustration />,
  },
  {
    title: 'Tavs pulkstenis jau zina daudz',
    body: 'Soļus, pulsu un miegu nolasām no Apple Health vai Health Connect — nekas papildus nav jāvalkā.',
    art: <DevicesIllustration />,
  },
  {
    title: 'Tavi dati paliek tavi',
    body: 'Mēs tos nepārdodam, un visu vari izdzēst ar vienu pieskārienu.',
    art: <PrivacyIllustration />,
  },
];

/** Sveiciens · 3 slaidi (prototype: Main, Onb-Welcome2, Onb-Welcome3). */
export default function Welcome() {
  const { width } = useWindowDimensions();
  const [i, setI] = useState(0);
  const list = useRef<FlatList>(null);
  const go = (n: number) => {
    setI(n);
    list.current?.scrollToIndex({ index: n, animated: true });
  };
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const n = Math.round(e.nativeEvent.contentOffset.x / width);
    if (n !== i && n >= 0 && n < SLIDES.length) setI(n);
  };
  const last = i === SLIDES.length - 1;
  return (
    <SafeAreaView style={styles.root} testID="welcome">
      <View style={styles.top}>
        {i === 0 ? <Wordmark /> : <IconButton icon="back" label="Atpakaļ" onPress={() => go(i - 1)} />}
        {!last && (
          <Pressable onPress={() => router.push('/login')} accessibilityRole="button" style={styles.skip}>
            <Text style={styles.skipText}>Izlaist</Text>
          </Pressable>
        )}
      </View>
      <FlatList
        ref={list}
        data={SLIDES}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScroll}
        onScroll={onScroll}
        scrollEventThrottle={32}
        keyExtractor={(s) => s.title}
        getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
        renderItem={({ item }) => (
          <View style={{ width, paddingHorizontal: 24 }}>
            <View style={styles.art}>{item.art}</View>
            <View style={styles.copy}>
              <Text style={styles.title} accessibilityRole="header">
                {item.title}
              </Text>
              <Text style={styles.body}>{item.body}</Text>
            </View>
          </View>
        )}
      />
      <View style={styles.bottom}>
        <View style={styles.dots} accessibilityLabel={`${i + 1}. no 3 slaidiem`}>
          {SLIDES.map((s, k) => (
            <View key={s.title} style={[styles.dot, k === i && styles.dotOn]} />
          ))}
        </View>
        {last ? (
          <Button label="Sākam" variant="accent" onPress={() => router.push('/login')} testID="welcome-start" />
        ) : (
          <Button label="Tālāk" onPress={() => go(i + 1)} testID="welcome-next" />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  top: { height: 44, marginTop: 12, paddingHorizontal: 24, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  skip: { paddingVertical: 12, paddingHorizontal: 4 },
  skipText: { fontFamily: fonts.bodySemi, fontSize: 16, color: colors.caption },
  art: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 300 },
  copy: { gap: 12, paddingBottom: 28 },
  title: { fontFamily: fonts.heading, fontSize: 32, lineHeight: 35, color: colors.ink },
  body: { fontFamily: fonts.body, fontSize: 17, lineHeight: 25, color: colors.text2 },
  bottom: { paddingHorizontal: 24, paddingBottom: 24 },
  dots: { flexDirection: 'row', gap: 8, paddingBottom: 24 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.toggleOff },
  dotOn: { width: 22, backgroundColor: colors.ink },
});
