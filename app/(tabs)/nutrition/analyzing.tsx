import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { api, ApiError } from '@/api';
import { keys } from '@/api/hooks';
import { Button } from '@/components/Button';
import { IconButton } from '@/components/Header';
import { Icon } from '@/components/Icon';
import { useMealDraft } from '@/lib/mealDraft';
import { colors, fonts, type } from '@/theme';

const STEPS = ['Atpazīstu produktus', 'Novērtēju porcijas', 'Rēķinu uzturvērtību'];

/** Foto · analizēju (prototype: Food-Analyzing.dc.html). */
export default function Analyzing() {
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const photo = useMealDraft((s) => s.photo);
  const takenAt = useMealDraft((s) => s.takenAt);
  const setAnalysis = useMealDraft((s) => s.setAnalysis);
  const [tick, setTick] = useState(0);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [scan] = useState(() => new Animated.Value(0));
  const started = useRef(-1);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(scan, { toValue: 1, duration: 1400, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(scan, { toValue: 0, duration: 1400, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [scan]);

  useEffect(() => {
    if (!photo || started.current === attempt) return;
    started.current = attempt;
    setError(null);
    setDone(false);
    setTick(0);
    const timers = [900, 1800].map((ms, i) => setTimeout(() => setTick((t) => Math.max(t, i + 1)), ms));
    api
      .analyzeMeal({ imageBase64: photo.base64, mediaType: photo.mediaType, takenAt: takenAt ?? new Date().toISOString() })
      .then((res) => {
        setAnalysis(res);
        qc.setQueryData(keys.quota, res.quota);
        setTick(3);
        setDone(true);
      })
      .catch((e: unknown) => setError(e instanceof ApiError ? e : new ApiError(0, 'unknown', String(e))));
    return () => timers.forEach(clearTimeout);
  }, [photo, takenAt, attempt, setAnalysis, qc]);

  if (!photo) {
    return (
      <View style={[styles.body, { paddingTop: insets.top + 40 }]}>
        <Text style={type.h1}>Nav foto</Text>
        <Button label="Atpakaļ uz kameru" onPress={() => router.replace('/nutrition/camera')} />
      </View>
    );
  }

  const quotaExceeded = error?.status === 402;
  const translateY = scan.interpolate({ inputRange: [0, 1], outputRange: [40, 380] });

  return (
    <View style={styles.root} testID="analyzing">
      <View style={styles.photo}>
        <Image source={{ uri: photo.uri }} style={StyleSheet.absoluteFill} resizeMode="cover" accessibilityLabel="Maltītes foto" />
        {!done && !error && <Animated.View style={[styles.scan, { transform: [{ translateY }] }]} />}
        <View style={{ position: 'absolute', left: 16, top: insets.top + 12 }}>
          <IconButton icon="close" label="Atcelt" color={colors.white} bg="rgba(0,0,0,0.45)" size={20} onPress={() => router.dismissTo('/nutrition')} />
        </View>
      </View>
      <View style={[styles.body, { paddingBottom: Math.max(insets.bottom, 16) + 24 }]}>
        {error ? (
          <>
            <Text style={type.h1}>{quotaExceeded ? 'Šodienas limits sasniegts' : 'Neizdevās analizēt'}</Text>
            <Text style={[type.secondary, { fontSize: 16, lineHeight: 22 }]}>
              {quotaExceeded
                ? 'Bezmaksas versijā ir 3 foto analīzes dienā. Maltīti vari pievienot ar tekstu vai no iecienītajiem.'
                : 'Pārbaudi savienojumu un mēģini vēlreiz, vai pievieno maltīti ar tekstu.'}
            </Text>
            <View style={{ flex: 1 }} />
            {quotaExceeded ? (
              <Button label="Balanss Pro — foto bez limita" variant="accent" onPress={() => router.push('/me/pro')} />
            ) : (
              <Button label="Mēģināt vēlreiz" onPress={() => setAttempt((a) => a + 1)} />
            )}
            <Button label="Pievienot ar tekstu" variant="light" onPress={() => router.replace('/food-add')} />
          </>
        ) : (
          <>
            <View style={styles.dots}>
              {[0, 1, 2].map((i) => (
                <View key={i} style={[styles.dot, { opacity: done ? 1 : tick >= i ? 1 : 0.35 }]} />
              ))}
            </View>
            <Text style={type.h1} accessibilityLiveRegion="polite">
              {done ? 'Gatavs' : 'Analizēju…'}
            </Text>
            <View style={{ gap: 10 }}>
              {STEPS.map((s, i) => {
                const ok = tick > i;
                return (
                  <View key={s} style={styles.step}>
                    {ok ? <Icon name="check" color={colors.ink} size={20} /> : <View style={styles.pending} />}
                    <Text style={[styles.stepText, { color: ok ? colors.ink : colors.muted }]}>{s}</Text>
                  </View>
                );
              })}
            </View>
            <View style={{ flex: 1 }} />
            {done ? (
              <Button label="Skatīt rezultātu" onPress={() => router.replace('/nutrition/result')} testID="see-result" />
            ) : (
              <View style={styles.wait}>
                <Text style={type.caption}>Parasti tas aizņem pāris sekundes</Text>
              </View>
            )}
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  photo: { height: 430, backgroundColor: '#5B4E43', overflow: 'hidden' },
  scan: {
    position: 'absolute',
    left: 24,
    right: 24,
    height: 3,
    borderRadius: 2,
    backgroundColor: '#F5B48F',
    shadowColor: '#F5B48F',
    shadowOpacity: 0.8,
    shadowRadius: 12,
  },
  body: { flex: 1, paddingTop: 28, paddingHorizontal: 24, gap: 18, backgroundColor: colors.bg },
  dots: { flexDirection: 'row', gap: 10 },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.accent },
  step: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  pending: { width: 20, height: 20, alignItems: 'center', justifyContent: 'center' },
  stepText: { fontFamily: fonts.body, fontSize: 16 },
  wait: { height: 56, alignItems: 'center', justifyContent: 'center' },
});
