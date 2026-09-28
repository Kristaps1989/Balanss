import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api, ApiError } from '@/api';
import { useMe, useMeMutation } from '@/api/hooks';
import { BottomBar, Button } from '@/components/Button';
import { CheckRow } from '@/components/Controls';
import { BackButton, IconButton, StepHeader } from '@/components/Header';
import { Screen } from '@/components/Screen';
import { Loading } from '@/components/States';
import { TraitBars } from '@/components/TraitBars';
import { LIKERT_LABELS, PERSONALITY_ITEMS } from '@shared/personality';
import { colors, fonts, radius, type } from '@/theme';

const EXAMPLES = [
  { trait: 'Ja tev patīk jaunais', bg: '#F6E7CF', fg: '#5E420F', say: 'Ko jaunu šonedēļ izmēģināji? Ideja: lēcu zupa ar ciedru riekstiem.' },
  { trait: 'Ja tev patīk plāns', bg: colors.sleepSoft, fg: '#2E3B66', say: 'Šodien trūkst 42 g olbaltumvielu. Plāns: biezpiens brokastīs (+18 g).' },
  { trait: 'Ja viegli satraucies', bg: colors.moveSoft, fg: '#24503B', say: 'Miegs bija īsāks, tas ir normāli. Šodien — bez spiediena.' },
];

/** Hook: finish onboarding and land on Šodiena. */
function useFinishOnboarding() {
  return useMeMutation(() => api.completeOnboarding());
}

/** Onb-TestIntro (5/7). */
export function PersonalityIntro() {
  const [consent, setConsent] = useState(true);
  const finish = useFinishOnboarding();
  return (
    <Screen
      gap={18}
      testID="personality-intro"
      footer={
        <BottomBar>
          <Button label="Uzzināt savu stilu" onPress={() => router.push('/personality/test')} disabled={!consent} testID="start-test" />
          <Button label="Izlaist — pielāgošu vēlāk" variant="ghost" size="md" onPress={() => finish.mutate()} loading={finish.isPending} testID="skip-test" />
        </BottomBar>
      }>
      <StepHeader step={5} onBack={() => router.back()} />
      <View style={{ gap: 8 }}>
        <Text style={styles.h1} accessibilityRole="header">
          Mērķi ir vieglāk sasniegt, ja zini, kāds esi
        </Text>
        <Text style={styles.lead}>2 minūtes, 20 apgalvojumi. Uzzināsi savu stilu, un mēs ieteiksim, atgādināsim un pajautāsim tieši tā, kā tev der.</Text>
      </View>
      <View style={{ gap: 10 }}>
        <Text style={styles.overline}>Piemēram</Text>
        {EXAMPLES.map((e) => (
          <View key={e.trait} style={styles.example}>
            <View style={[styles.chip, { backgroundColor: e.bg }]}>
              <Text style={[styles.chipText, { color: e.fg }]}>{e.trait}</Text>
            </View>
            <Text style={styles.say}>{e.say}</Text>
          </View>
        ))}
      </View>
      <CheckRow
        checked={consent}
        onChange={setConsent}
        title="Atļauju izmantot rezultātu ieteikumu pielāgošanai"
        hint="Vari mainīt vai dzēst jebkurā brīdī sadaļā “Es”."
      />
      {!consent && <Text style={type.secondary}>Bez piekrišanas testa rezultātu nesaglabāsim — ieteikumi būs neitrālā tonī.</Text>}
    </Screen>
  );
}

/** Onb-Test (6/7): one statement per screen. `mode="retest"` returns to "Es". */
export function PersonalityTest({ mode }: { mode: 'onboarding' | 'retest' }) {
  const [i, setI] = useState(0);
  const [answers, setAnswers] = useState<(number | null)[]>(() => PERSONALITY_ITEMS.map(() => null));
  const submit = useMeMutation(() => api.submitPersonality({ consent: true, answers: answers as number[] }));
  const n = PERSONALITY_ITEMS.length;
  const cur = answers[i];
  const last = i === n - 1;

  const pick = (v: number) => {
    const a = answers.slice();
    a[i] = v;
    setAnswers(a);
  };

  const finish = () =>
    submit.mutate(undefined, {
      onSuccess: () => router.replace(mode === 'onboarding' ? '/personality/result' : '/me/personality'),
    });

  return (
    <SafeAreaView style={styles.test} testID="personality-test">
      <View style={styles.testTop}>
        {i === 0 ? <BackButton /> : <IconButton icon="back" label="Iepriekšējais apgalvojums" onPress={() => setI(i - 1)} />}
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${((i + 1) / n) * 100}%` }]} />
        </View>
        <Text style={styles.count}>
          {i + 1} no {n}
        </Text>
      </View>
      <View style={styles.statement}>
        <Text style={styles.ask}>Cik lielā mērā tas par tevi?</Text>
        <Text style={styles.stText} accessibilityRole="header" testID="statement">
          {PERSONALITY_ITEMS[i].text}
        </Text>
      </View>
      <View style={{ gap: 8 }} accessibilityRole="radiogroup" accessibilityLabel="Atbilde">
        {LIKERT_LABELS.map((label, k) => {
          const v = k + 1;
          const on = cur === v;
          const size = [22, 18, 14, 18, 22][k];
          return (
            <Pressable
              key={label}
              onPress={() => pick(v)}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              style={[styles.opt, { backgroundColor: on ? colors.accentSoft : colors.white, borderColor: on ? colors.accent : colors.optionBorder }]}>
              <View style={styles.dotBox}>
                <View
                  style={{
                    width: size,
                    height: size,
                    borderRadius: size / 2,
                    borderWidth: 2,
                    borderColor: on ? colors.accent : colors.boxBorder,
                    backgroundColor: on ? colors.accent : colors.white,
                  }}
                />
              </View>
              <Text style={styles.optText}>{label}</Text>
            </Pressable>
          );
        })}
      </View>
      <View style={{ height: 56 }}>
        {cur !== null &&
          (last ? (
            <Button label="Skatīt rezultātu" onPress={finish} loading={submit.isPending} testID="test-finish" />
          ) : (
            <Button label="Tālāk" onPress={() => setI(i + 1)} testID="test-next" />
          ))}
      </View>
      {submit.isError && (
        <Text style={styles.error}>
          {submit.error instanceof ApiError && submit.error.code === 'retest_locked'
            ? 'Testu atkārtot varēs vēlāk.'
            : 'Neizdevās saglabāt. Mēģini vēlreiz.'}
        </Text>
      )}
    </SafeAreaView>
  );
}

/** Onb-Result (7/7). In "Es" it is shown without the step header and CTA. */
export function PersonalityResult({ mode }: { mode: 'onboarding' | 'view' }) {
  const me = useMe();
  const finish = useFinishOnboarding();
  const p = me.data?.personality;
  if (!me.data) return <Loading />;
  if (!p) {
    return (
      <Screen>
        <BackButton />
        <Text style={type.h2}>Personības profila nav</Text>
      </Screen>
    );
  }
  return (
    <Screen
      gap={16}
      testID="personality-result"
      footer={
        mode === 'onboarding' ? (
          <BottomBar>
            <Button label="Sākt lietot Balansu" variant="accent" onPress={() => finish.mutate(undefined, { onSuccess: () => router.replace('/') })} loading={finish.isPending} testID="start-app" />
          </BottomBar>
        ) : undefined
      }>
      {mode === 'onboarding' ? (
        <View style={styles.resultTop}>
          <View style={styles.track}>
            <View style={[styles.fillInk, { width: '100%' }]} />
          </View>
          <Text style={styles.count}>7/7</Text>
        </View>
      ) : (
        <View style={{ marginLeft: -10 }}>
          <BackButton />
        </View>
      )}
      <View style={{ gap: 6 }}>
        <Text style={styles.styleLabel}>Tavs stils</Text>
        <Text style={styles.h1Big} accessibilityRole="header" testID="style-name">
          {p.styleName}
        </Text>
      </View>
      <View style={styles.traits}>
        <TraitBars personality={p} />
      </View>
      <View style={styles.help}>
        <Text style={styles.helpTitle}>Tā mēs tev palīdzēsim</Text>
        <Text style={styles.helpBody}>{p.styleDescription}</Text>
      </View>
      <Text style={styles.disclaimer}>Šis nav klīnisks vai diagnostisks tests. Toni vari mainīt vai atgriezt neitrālu jebkurā brīdī sadaļā “Es”.</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  h1: { fontFamily: fonts.heading, fontSize: 28, lineHeight: 32, color: colors.ink },
  h1Big: { fontFamily: fonts.heading, fontSize: 30, lineHeight: 34, color: colors.ink },
  lead: { fontFamily: fonts.body, fontSize: 16, lineHeight: 23, color: colors.text2 },
  overline: { fontFamily: fonts.bodyBold, fontSize: 13, letterSpacing: 0.5, textTransform: 'uppercase', color: colors.caption },
  example: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.optionBorder, borderRadius: radius.option, paddingVertical: 12, paddingHorizontal: 14, gap: 6 },
  chip: { alignSelf: 'flex-start', height: 26, paddingHorizontal: 10, borderRadius: 13, justifyContent: 'center' },
  chipText: { fontFamily: fonts.bodyBold, fontSize: 12 },
  say: { fontFamily: fonts.body, fontSize: 15, lineHeight: 21, color: colors.ink },
  test: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 24, gap: 20 },
  testTop: { flexDirection: 'row', alignItems: 'center', gap: 12, height: 44 },
  track: { flex: 1, height: 6, borderRadius: 3, backgroundColor: '#E6DED3', overflow: 'hidden' },
  fill: { height: 6, backgroundColor: colors.accent },
  fillInk: { height: 6, backgroundColor: colors.ink },
  count: { fontFamily: fonts.bodySemi, fontSize: 13, color: colors.caption },
  statement: { flex: 1, justifyContent: 'center', gap: 12, paddingHorizontal: 4 },
  ask: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.caption },
  stText: { fontFamily: fonts.headingSemi, fontSize: 30, lineHeight: 36, color: colors.ink },
  opt: { height: 56, borderRadius: 18, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', gap: 14, borderWidth: 1.5 },
  dotBox: { width: 22, alignItems: 'center' },
  optText: { fontFamily: fonts.bodySemi, fontSize: 16, color: colors.ink },
  error: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.accentDeep, textAlign: 'center' },
  resultTop: { flexDirection: 'row', alignItems: 'center', gap: 12, height: 44 },
  styleLabel: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.accentText },
  traits: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.optionBorder, borderRadius: radius.card, padding: 18 },
  help: { backgroundColor: colors.accentSoft, borderRadius: radius.card, padding: 18, gap: 8 },
  helpTitle: { fontFamily: fonts.heading, fontSize: 18, color: colors.ink },
  helpBody: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, color: '#3B3833' },
  disclaimer: { fontFamily: fonts.body, fontSize: 13, lineHeight: 19, color: colors.caption, paddingHorizontal: 4 },
});
