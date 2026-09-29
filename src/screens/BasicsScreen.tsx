import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import type { ActivityLevel, Sex } from '@/api';
import { api } from '@/api';
import { useMe, useMeMutation } from '@/api/hooks';
import { BottomBar, Button } from '@/components/Button';
import { OptionCard, PillChoice, StepperCard } from '@/components/Controls';
import { BackButton, StepHeader } from '@/components/Header';
import { Screen } from '@/components/Screen';
import { Loading } from '@/components/States';
import { colors, fonts, type } from '@/theme';

const ACTS: { value: ActivityLevel; label: string; hint: string }[] = [
  { value: 'sit', label: 'Pārsvarā sēžu', hint: 'Birojs, maz kustību' },
  { value: 'light', label: 'Nedaudz kustos', hint: 'Pastaigas, dažreiz sports' },
  { value: 'active', label: 'Aktīvi', hint: 'Treniņi 3–4 reizes nedēļā' },
  { value: 'very', label: 'Ļoti aktīvi', hint: 'Fizisks darbs vai ikdienas sports' },
];

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Pastāsti par sevi (prototype: Onb-Basics.dc.html). Also used from "Es" to edit. */
export function BasicsScreen({ mode }: { mode: 'onboarding' | 'edit' }) {
  const me = useMe();
  if (!me.data) return <Loading />;
  return <BasicsForm mode={mode} initial={me.data.profile} />;
}

function BasicsForm({ mode, initial }: { mode: 'onboarding' | 'edit'; initial: NonNullable<ReturnType<typeof useMe>['data']>['profile'] }) {
  const [name, setName] = useState(initial.firstName);
  const [age, setAge] = useState(initial.age);
  const [h, setH] = useState(initial.heightCm);
  const [w, setW] = useState(Math.round(initial.weightKg));
  const [sex, setSex] = useState<Sex>(initial.sex);
  const [act, setAct] = useState<ActivityLevel>(initial.activity);
  const save = useMeMutation(() => api.updateProfile({ firstName: name.trim(), age, heightCm: h, weightKg: w, sex, activity: act }));

  const next = () =>
    save.mutate(undefined, {
      onSuccess: () => (mode === 'onboarding' ? router.push('/devices') : router.back()),
    });

  return (
    <Screen
      gap={18}
      testID="basics"
      footer={
        <BottomBar>
          {save.isError && <Text style={styles.error}>Neizdevās saglabāt. Mēģini vēlreiz.</Text>}
          <Button label={mode === 'onboarding' ? 'Tālāk' : 'Saglabāt'} onPress={next} loading={save.isPending} disabled={!name.trim()} testID="basics-next" />
        </BottomBar>
      }>
      {mode === 'onboarding' ? (
        <StepHeader step={2} onBack={() => router.back()} />
      ) : (
        <View style={{ marginLeft: -10 }}>
          <BackButton />
        </View>
      )}
      <View style={{ gap: 6 }}>
        <Text style={styles.h1} accessibilityRole="header">
          Pastāsti par sevi
        </Text>
        <Text style={styles.lead}>Lai mērķi būtu reāli, nevis vispārīgi.</Text>
      </View>
      <View style={{ gap: 8 }}>
        <Text style={styles.label} nativeID="name-label">
          Kā tevi uzrunāt?
        </Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="Vārds"
          placeholderTextColor={colors.muted}
          autoCapitalize="words"
          autoComplete="given-name"
          accessibilityLabelledBy="name-label"
          accessibilityLabel="Vārds"
          style={styles.input}
          testID="name-input"
          maxLength={40}
        />
      </View>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <StepperCard label="Vecums" value={String(age)} unit="gadi" onDec={() => setAge((v) => clamp(v - 1, 16, 100))} onInc={() => setAge((v) => clamp(v + 1, 16, 100))} />
        <StepperCard label="Augums" value={String(h)} unit="cm" onDec={() => setH((v) => clamp(v - 1, 120, 230))} onInc={() => setH((v) => clamp(v + 1, 120, 230))} />
        <StepperCard label="Svars" value={String(w)} unit="kg" onDec={() => setW((v) => clamp(v - 1, 35, 250))} onInc={() => setW((v) => clamp(v + 1, 35, 250))} />
      </View>
      <View style={{ gap: 10 }}>
        <Text style={styles.label}>Dzimums</Text>
        <PillChoice<Sex>
          value={sex}
          onChange={setSex}
          options={[
            { value: 'f', label: 'Sieviete' },
            { value: 'm', label: 'Vīrietis' },
            { value: 'x', label: 'Nenorādīt' },
          ]}
        />
      </View>
      <View style={{ gap: 10 }}>
        <Text style={styles.label}>Cik daudz kustos ikdienā?</Text>
        <View style={styles.grid}>
          {ACTS.map((a) => (
            <OptionCard key={a.value} selected={act === a.value} onPress={() => setAct(a.value)} style={styles.act} accessibilityLabel={`${a.label}. ${a.hint}`}>
              <Text style={styles.actLabel}>{a.label}</Text>
              <Text style={styles.actHint}>{a.hint}</Text>
            </OptionCard>
          ))}
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  h1: { fontFamily: fonts.heading, fontSize: 28, lineHeight: 32, color: colors.ink },
  lead: { ...type.body, color: colors.text2 },
  label: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.ink },
  input: {
    height: 52,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.optionBorder,
    backgroundColor: colors.white,
    paddingHorizontal: 16,
    fontFamily: fonts.body,
    fontSize: 16,
    color: colors.ink,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  act: { width: '48%', flexGrow: 1, minHeight: 84, gap: 4 },
  actLabel: { fontFamily: fonts.bodyBold, fontSize: 16, color: colors.ink },
  actHint: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: colors.text2 },
  error: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.accentDeep, textAlign: 'center' },
});
