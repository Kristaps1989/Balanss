import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { api, ApiError, type Goal, type Me, type Targets, type WeightDirection } from '@/api';
import { useMe, useMeMutation } from '@/api/hooks';
import { BottomBar, Button } from '@/components/Button';
import { RoundButton } from '@/components/Controls';
import { BackButton, StepHeader } from '@/components/Header';
import { Icon, type IconName } from '@/components/Icon';
import { Screen } from '@/components/Screen';
import { Loading } from '@/components/States';
import { duration, formatNumber, litres } from '@/lib/format';
import { KCAL_FLOOR, minGoalWeight, weightLossAllowed } from '@shared/safety';
import { computeTargets, targetSources, weeksToGoal } from '@shared/targets';
import { colors, fonts, radius, type } from '@/theme';

const GOALS: { value: Goal; label: string; hint: string; icon: IconName; bg: string; fg: string }[] = [
  { value: 'health', label: 'Justies veselīgāk', hint: 'Vairāk enerģijas un labāks miegs', icon: 'heart', bg: '#FCE7EA', fg: '#A8364C' },
  { value: 'fit', label: 'Uzturēt formu', hint: 'Saglabāt to, kas jau ir labi', icon: 'movement', bg: colors.moveSoft, fg: colors.moveDeep },
  { value: 'weight', label: 'Sasniegt vēlamo svaru', hint: 'Samazināt vai palielināt — mierīgā tempā', icon: 'scale', bg: colors.accentSoft, fg: colors.accentText },
  { value: 'routine', label: 'Izveidot rutīnu', hint: 'Regulāras maltītes, ūdens un gulētiešana', icon: 'clock', bg: colors.sleepSoft, fg: colors.sleepDeep },
];

type TargetKey = 'kcal' | 'waterMl' | 'steps' | 'sleepMin' | 'proteinG';

/** Ko vēlies sasniegt? (prototype: Onb-Goals.dc.html) */
export function GoalsScreen({ mode }: { mode: 'onboarding' | 'edit' }) {
  const me = useMe();
  if (!me.data) return <Loading />;
  return <GoalsForm mode={mode} me={me.data} />;
}

function GoalsForm({ mode, me }: { mode: 'onboarding' | 'edit'; me: Me }) {
  const p = me.profile;
  const [goals, setGoals] = useState<Goal[]>(p.goals.length ? p.goals : ['health']);
  const lossOk = weightLossAllowed(p);
  const minKg = minGoalWeight(p.heightCm);
  const [dir, setDir] = useState<WeightDirection>(lossOk ? (p.weightDirection ?? 'down') : 'up');
  const [goalKg, setGoalKg] = useState<number>(
    p.goalWeightKg ?? (lossOk ? Math.max(minKg, Math.round(p.weightKg - 5)) : Math.round(p.weightKg + 3)),
  );
  const [edited, setEdited] = useState<Partial<Targets>>(mode === 'edit' ? me.targets : {});
  const profile = { ...p, goals, weightDirection: goals.includes('weight') ? dir : null, goalWeightKg: goals.includes('weight') ? goalKg : null };
  const targets: Targets = { ...computeTargets(profile), ...edited };
  const src = targetSources(profile);
  const save = useMeMutation(async (t: Targets) => {
    await api.updateProfile({ goals, weightDirection: profile.weightDirection, goalWeightKg: profile.goalWeightKg });
    return Object.keys(edited).length ? api.updateTargets(t) : api.me();
  });

  const toggle = (g: Goal) => setGoals((cur) => (cur.includes(g) ? cur.filter((x) => x !== g) : [...cur, g]));
  const bump = (k: TargetKey, d: number, lo: number, hi: number) =>
    setEdited((e) => ({ ...e, [k]: Math.max(lo, Math.min(hi, Math.round((targets[k] + d) * 10) / 10)) }));

  const diff = Math.abs(p.weightKg - goalKg);
  const pace = diff === 0 ? 'Svars paliek, kāds ir — fokuss uz ieradumiem.' : `Mierīgā tempā tas ir apmēram ${weeksToGoal(p.weightKg, goalKg)} nedēļas (0,25–0,5 kg nedēļā).`;

  const rows: { k: TargetKey; label: string; value: string; src: string; step: number; lo: number; hi: number }[] = [
    { k: 'kcal', label: 'Enerģija dienā', value: `${formatNumber(targets.kcal)} kcal`, src: src.kcal, step: 50, lo: KCAL_FLOOR[p.sex], hi: 4500 },
    { k: 'proteinG', label: 'Olbaltumvielas', value: `${targets.proteinG} g`, src: src.protein, step: 5, lo: 40, hi: 250 },
    { k: 'waterMl', label: 'Ūdens', value: litres(targets.waterMl), src: src.water, step: 100, lo: 1000, hi: 5000 },
    { k: 'steps', label: 'Soļi', value: formatNumber(targets.steps), src: src.steps, step: 500, lo: 2000, hi: 30000 },
    { k: 'sleepMin', label: 'Miegs', value: duration(targets.sleepMin), src: src.sleep, step: 15, lo: 300, hi: 600 },
  ];

  const next = () =>
    save.mutate(targets, {
      onSuccess: () => (mode === 'onboarding' ? router.push('/personality/intro') : router.back()),
    });

  return (
    <Screen
      gap={18}
      testID="goals"
      footer={
        <BottomBar>
          {save.isError && (
            <Text style={styles.error}>
              {save.error instanceof ApiError && save.error.code === 'goal_below_healthy'
                ? 'Šāds mērķa svars būtu zem veselīga diapazona.'
                : save.error instanceof ApiError && save.error.code === 'target_below_floor'
                  ? `Enerģijas mērķis nevar būt zemāks par ${formatNumber(KCAL_FLOOR[p.sex])} kcal.`
                  : save.error instanceof ApiError && save.error.code === 'weight_loss_not_allowed'
                    ? 'Svara samazināšanu šim profilam nepiedāvājam.'
                    : 'Neizdevās saglabāt. Mēģini vēlreiz.'}
            </Text>
          )}
          <Button label={mode === 'onboarding' ? 'Tālāk' : 'Saglabāt'} onPress={next} loading={save.isPending} disabled={!goals.length} testID="goals-next" />
        </BottomBar>
      }>
      {mode === 'onboarding' ? (
        <StepHeader step={4} onBack={() => router.back()} />
      ) : (
        <View style={{ marginLeft: -10 }}>
          <BackButton />
        </View>
      )}
      <View style={{ gap: 6 }}>
        <Text style={styles.h1} accessibilityRole="header">
          Ko vēlies sasniegt?
        </Text>
        <Text style={[type.secondary, { fontSize: 15 }]}>Vari izvēlēties vairākus.</Text>
      </View>
      <View style={{ gap: 10 }}>
        {GOALS.map((g) => {
          const on = goals.includes(g.value);
          return (
            <View key={g.value} style={[styles.goal, { backgroundColor: on ? colors.accentSoft : colors.white, borderColor: on ? colors.accent : colors.inputBorder }]}>
              <Pressable
                onPress={() => toggle(g.value)}
                accessibilityRole="checkbox"
                aria-checked={on}
                accessibilityLabel={`${g.label}. ${g.hint}`}
                style={styles.goalBtn}>
                <View style={[styles.goalIcon, { backgroundColor: g.bg }]}>
                  <Icon name={g.icon} color={g.fg} size={22} />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={styles.goalLabel}>{g.label}</Text>
                  <Text style={type.secondary}>{g.hint}</Text>
                </View>
                <View style={[styles.check, { borderColor: on ? colors.accent : colors.inputBorder, backgroundColor: on ? colors.accent : colors.white }]}>
                  {on && <Icon name="check" color={colors.white} size={16} strokeWidth={3} />}
                </View>
              </Pressable>
              {on && g.value === 'weight' && (
                <View style={styles.weight}>
                  <View style={styles.dirs} accessibilityRole="radiogroup">
                    {((lossOk ? ['down', 'up'] : ['up']) as WeightDirection[]).map((d) => {
                      const sel = d === dir;
                      return (
                        <Pressable
                          key={d}
                          onPress={() => {
                            setDir(d);
                            setGoalKg(d === 'down' ? Math.max(minKg, Math.round(p.weightKg - 5)) : Math.round(p.weightKg + 4));
                          }}
                          accessibilityRole="radio"
                          aria-checked={sel}
                          style={[styles.dir, sel && { backgroundColor: colors.ink }]}>
                          <Text style={[styles.dirText, sel && { color: colors.white }]}>{d === 'down' ? 'Samazināt' : 'Palielināt'}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={type.secondary}>Vēlamais svars · tagad {formatNumber(p.weightKg)} kg</Text>
                      <Text style={styles.big}>{goalKg} kg</Text>
                    </View>
                    <RoundButton
                      icon="minus"
                      label="Vēlamais svars: mazāk"
                      bg={colors.white}
                      onPress={() => setGoalKg((k) => Math.max(dir === 'down' ? minKg : Math.ceil(p.weightKg), k - 1))}
                    />
                    <RoundButton icon="plus" label="Vēlamais svars: vairāk" bg={colors.white} onPress={() => setGoalKg((k) => Math.min(250, k + 1))} />
                  </View>
                  <Text style={type.secondary}>{pace}</Text>
                  {!lossOk && (
                    <Text style={type.secondary}>
                      Svara samazināšanu nepiedāvājam{p.age < 18 ? ' līdz 18 gadu vecumam' : ', jo tavs svars jau ir veselīgā diapazona apakšā'} — fokuss uz enerģiju un ieradumiem.
                    </Text>
                  )}
                  {lossOk && dir === 'down' && goalKg === minKg && (
                    <Text style={type.secondary}>Zemāku mērķi nepiedāvājam — tas būtu zem veselīga svara diapazona.</Text>
                  )}
                </View>
              )}
            </View>
          );
        })}
      </View>
      <View style={{ gap: 4 }}>
        <Text style={styles.label}>Tavi dienas mērķi</Text>
        <Text style={type.secondary}>Aprēķinājām pēc taviem datiem un starptautiskām vadlīnijām — vari pabīdīt.</Text>
      </View>
      <View style={styles.targets}>
        {rows.map((r, i) => (
          <View key={r.k} style={[styles.target, i === rows.length - 1 && { borderBottomWidth: 0 }]}>
            <View style={{ flex: 1 }}>
              <Text style={type.secondary}>{r.label}</Text>
              <Text style={styles.big} testID={`target-${r.k}`}>
                {r.value}
              </Text>
              <View style={{ flexDirection: 'row', gap: 5, paddingTop: 3 }}>
                <Icon name="info" color={colors.caption} size={13} />
                <Text style={styles.src}>{r.src}</Text>
              </View>
            </View>
            <RoundButton icon="minus" label={`${r.label}: mazāk`} onPress={() => bump(r.k, -r.step, r.lo, r.hi)} />
            <RoundButton icon="plus" label={`${r.label}: vairāk`} onPress={() => bump(r.k, r.step, r.lo, r.hi)} />
          </View>
        ))}
      </View>
      {targets.kcal <= KCAL_FLOOR[p.sex] && (
        <Text style={styles.disclaimer}>Enerģijas mērķi zemāk par {formatNumber(KCAL_FLOOR[p.sex])} kcal nenosakām.</Text>
      )}
      <Text style={styles.disclaimer}>
        Vispārīgi ieteikumi veseliem pieaugušajiem, nevis medicīnisks padoms. Ja tev ir veselības stāvoklis, mērķus pārrunā ar ārstu.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  h1: { fontFamily: fonts.heading, fontSize: 28, lineHeight: 32, color: colors.ink },
  label: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.ink },
  goal: { borderRadius: radius.option, borderWidth: 1.5 },
  goalBtn: { minHeight: 64, paddingVertical: 12, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 14 },
  goalIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  goalLabel: { fontFamily: fonts.bodyBold, fontSize: 17, color: colors.ink },
  check: { width: 24, height: 24, borderRadius: 7, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  weight: { paddingHorizontal: 16, paddingBottom: 14, gap: 10 },
  dirs: { flexDirection: 'row', gap: 4, padding: 4, borderRadius: 14, backgroundColor: colors.white },
  dir: { flex: 1, height: 40, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  dirText: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.ink },
  big: { fontFamily: fonts.heading, fontSize: 22, lineHeight: 28, color: colors.ink },
  targets: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.optionBorder, borderRadius: 22, paddingVertical: 6, paddingHorizontal: 16 },
  target: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F0EAE1' },
  src: { flex: 1, fontFamily: fonts.body, fontSize: 12, lineHeight: 16, color: colors.caption },
  disclaimer: { fontFamily: fonts.body, fontSize: 12, lineHeight: 17, color: colors.caption, paddingHorizontal: 4 },
  error: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.accentDeep, textAlign: 'center' },
});
