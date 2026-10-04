import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router, type Href } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { api, type Day, type Progress, type Tip, type WeeklyQuestion } from '@/api';
import { keys, useDay, useMe, useTip, useWeeklyQuestion, useWeeklySummary } from '@/api/hooks';
import { AiLabel } from '@/components/AiLabel';
import { Avatar } from '@/components/Avatar';
import { CareCard } from '@/components/CareCard';
import { Card } from '@/components/Card';
import { IconButton } from '@/components/Header';
import { Icon, type IconName } from '@/components/Icon';
import { ProgressBar } from '@/components/ProgressBar';
import { ProgressRing } from '@/components/ProgressRing';
import { Screen } from '@/components/Screen';
import { SourceNote } from '@/components/SourceNote';
import { ErrorState, Loading } from '@/components/States';
import { WaterGlass } from '@/components/WaterGlass';
import { duration, formatNumber, greeting, kcal, litres, longDate } from '@/lib/format';
import { GLASS_ML, useAddWater } from '@/lib/mutations';
import { useHealthRefresh } from '@/lib/services';
import { useToday } from '@/lib/today';
import { colors, fonts, hit, radius, space, type } from '@/theme';

/** Šodiena (prototype: Home.dc.html). */
export default function HomeScreen() {
  const date = useToday();
  const me = useMe();
  const day = useDay(date);
  const hr = useHealthRefresh(day.refetch);
  if (day.isPending || me.isPending) return <Loading />;
  if (day.isError || !me.data) return <ErrorState onRetry={() => day.refetch()} />;
  return (
    <HomeContent
      date={date}
      pro={me.data.plan === 'pro'}
      firstName={me.data.profile.firstName}
      day={day.data}
      refreshing={hr.refreshing}
      onRefresh={hr.refresh}
    />
  );
}

function HomeContent({ date, pro, firstName, day, refreshing, onRefresh }: { date: string; pro: boolean; firstName: string; day: Day; refreshing: boolean; onRefresh: () => void }) {
  const now = new Date();
  const { nutrition, movement, sleep } = day;
  const water = useAddWater(date);

  return (
    <Screen refreshing={refreshing} onRefresh={onRefresh} testID="home">
      <View style={styles.header}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.date}>{longDate(now)}</Text>
          <Text style={type.h1} accessibilityRole="header">
            {greeting(now)}
            {firstName ? `, ${firstName}` : ''}
          </Text>
        </View>
        <Avatar name={firstName || '?'} onPress={() => router.push('/me')} />
      </View>

      {day.care.active && <CareCard />}

      <TipCard date={date} />

      <Card style={styles.card}>
        <CardHeader title="Uzturs" link="Maltītes" href="/nutrition" />
        <View style={styles.energy}>
          <ProgressRing
            size={128}
            stroke={12}
            progress={nutrition.kcal.value / nutrition.kcal.target}
            color={colors.accent}
            trackColor={colors.kcalTrack}>
            <Text style={styles.ringValue}>{formatNumber(nutrition.kcal.value)}</Text>
            <Text style={styles.ringCaption}>no {kcal(nutrition.kcal.target)}</Text>
          </ProgressRing>
          <View style={{ flex: 1, gap: 4 }}>
            {day.care.active ? (
              <>
                <Text style={styles.left}>Šodien apēsts</Text>
                <Text style={type.secondary}>Galvenais — regulāras maltītes un pietiekami daudz atpūtas.</Text>
              </>
            ) : (
              <>
                <Text style={styles.left}>{remainingLabel(nutrition.kcal)}</Text>
                <Text style={type.secondary}>{remainingHint(nutrition.kcal)}</Text>
              </>
            )}
          </View>
        </View>
        <View style={styles.macros}>
          <Macro label="Olbaltumvielas" p={nutrition.proteinG} color={colors.protein} track={colors.proteinTrack} />
          <Macro label="Ogļhidrāti" p={nutrition.carbsG} color={colors.carbs} track={colors.carbsTrack} />
          <Macro label="Tauki" p={nutrition.fatG} color={colors.fat} track={colors.fatTrack} />
          <Macro label="Šķiedrvielas" p={nutrition.fibreG} color={colors.fibre} track={colors.fibreTrack} />
        </View>
      </Card>

      <Card style={[styles.card, styles.water]}>
        <WaterGlass progress={nutrition.waterMl.value / nutrition.waterMl.target} />
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={type.section}>Ūdens</Text>
          <Text testID="water-total">
            <Text style={styles.big}>{litres(nutrition.waterMl.value)}</Text>
            <Text style={styles.unitLg}> no {litres(nutrition.waterMl.target)}</Text>
          </Text>
          <Pressable
            onPress={() => water.mutate(GLASS_ML)}
            accessibilityRole="button"
            accessibilityLabel={`Pievienot ${GLASS_ML} ml ūdens`}
            testID="water-add"
            style={({ pressed }) => [styles.waterAdd, pressed && { opacity: 0.8 }]}>
            <Icon name="plus" color={colors.waterDeep} size={18} strokeWidth={2.2} />
            <Text style={styles.waterAddText}>{GLASS_ML} ml</Text>
          </Pressable>
        </View>
      </Card>

      <Card style={[styles.card, { gap: 12 }]}>
        <CardHeader title="Kustība" link="Vairāk" href="/movement" />
        <View style={styles.moveRow}>
          <View style={{ flex: 1, gap: 8 }}>
            <Text>
              <Text style={type.number}>{formatNumber(movement.steps.value)}</Text>
              <Text style={styles.unit}> / {formatNumber(movement.steps.target)} soļi</Text>
            </Text>
            <ProgressBar progress={movement.steps.value / movement.steps.target} color={colors.steps} trackColor={colors.stepsTrack} />
          </View>
          <View style={styles.divider} />
          <View style={{ width: 92, gap: 2 }}>
            <Text style={type.number}>{formatNumber(movement.activeKcal)}</Text>
            <Text style={styles.smallSecondary}>aktīvās kcal</Text>
          </View>
        </View>
        {movement.source && <SourceNote source={movement.source} />}
      </Card>

      <Card style={[styles.card, { gap: 12 }]}>
        <CardHeader title="Pagājušā nakts" link="Vairāk" href="/sleep" />
        {sleep ? (
          <>
            <View style={styles.sleepRow}>
              <View>
                <Text style={type.number}>{duration(sleep.totalMin)}</Text>
                <Text style={type.secondary}>
                  {sleep.bedtime} → {sleep.wakeTime}
                </Text>
              </View>
              <View style={styles.score}>
                <Text style={styles.scoreValue}>{sleep.score}</Text>
                <Text style={styles.scoreLabel}>miega vērtējums</Text>
              </View>
            </View>
            <View style={styles.stages}>
              <View style={{ flex: sleep.deepMin, backgroundColor: colors.sleepDeep }} />
              <View style={{ flex: sleep.remMin, backgroundColor: colors.sleepRem }} />
              <View style={{ flex: sleep.lightMin, backgroundColor: colors.sleepLight }} />
            </View>
            <SourceNote source={sleep.source} />
          </>
        ) : (
          <Text style={type.secondary}>Miega dati vēl nav. Pievieno pulksteni sadaļā “Es”, un nakts parādīsies šeit.</Text>
        )}
      </Card>

      <WeeklyQuestionCard date={date} />

      <SummaryCard date={date} pro={pro} />

      <LeisureCard />

      <View style={{ gap: 10, paddingTop: 4 }}>
        <Text style={[type.section, { paddingHorizontal: 2 }]}>Pievieno</Text>
        <View style={styles.quickRow}>
          <QuickAdd icon="camera" label="Foto" onPress={() => router.push('/nutrition/camera')} />
          <QuickAdd icon="drop" label="Ūdens" onPress={() => water.mutate(GLASS_ML)} />
          <QuickAdd icon="movement" label="Aktivitāte" onPress={() => router.push('/activity')} />
          <QuickAdd icon="scale" label="Svars" onPress={() => router.push('/weight')} />
        </View>
      </View>
    </Screen>
  );
}

function remainingLabel(p: Progress) {
  const left = Math.round(p.target - p.value);
  return left >= 0 ? `Vēl ${kcal(left)}` : `${kcal(-left)} virs mērķa`;
}

function remainingHint(p: Progress) {
  const left = p.target - p.value;
  if (left > 700) return 'Vēl pietiek pilnvērtīgai maltītei.';
  if (left > 150) return 'Pietiek vieglām vakariņām ar olbaltumvielām.';
  if (left >= 0) return 'Diena gandrīz pilna — ja gribas, kaut kas viegls.';
  return 'Tas nekas — viena diena neko neizšķir.';
}

function CardHeader({ title, link, href }: { title: string; link: string; href: Href }) {
  return (
    <View style={styles.cardHeader}>
      <Text style={type.section}>{title}</Text>
      <Pressable onPress={() => router.navigate(href)} accessibilityRole="link" hitSlop={8} style={styles.link}>
        <Text style={type.link}>{link}</Text>
      </Pressable>
    </View>
  );
}

function TipCard({ date }: { date: string }) {
  const qc = useQueryClient();
  const tip = useTip(date);
  const setTip = (t: Tip) => {
    qc.setQueryData(keys.tip(date), t);
    qc.invalidateQueries({ queryKey: keys.day(date) });
  };
  const next = useMutation({ mutationFn: () => api.tipNext(date), onSuccess: setTip });
  const accept = useMutation({ mutationFn: (id: string) => api.acceptTip(id), onSuccess: setTip });

  if (tip.isPending) {
    return (
      <View style={[styles.tip, { minHeight: 120, justifyContent: 'center' }]}>
        <TipTitle />
        <Text style={styles.tipBody}>Gatavoju šodienas ieteikumu…</Text>
      </View>
    );
  }
  if (!tip.data) return null;
  const t = tip.data;
  const [before, after] = t.highlight && t.body.includes(t.highlight) ? t.body.split(t.highlight, 2) : [t.body, undefined];
  return (
    <View style={styles.tip} testID="tip-card">
      <TipTitle />
      <Text style={styles.tipBody}>
        {before}
        {after !== undefined && (
          <>
            <Text style={{ fontFamily: fonts.bodyBold }}>{t.highlight}</Text>
            {after}
          </>
        )}
      </Text>
      <View style={{ flexDirection: 'row', gap: 8, paddingTop: 2, flexWrap: 'wrap' }}>
        {t.accepted ? (
          <View style={styles.accepted}>
            <Icon name="check" color={colors.moveDeep} size={18} strokeWidth={2.4} />
            <Text style={[styles.chipText, { color: colors.moveDeep }]}>Pieņemts</Text>
          </View>
        ) : (
          <Chip dark label="Labi, pamēģināšu" onPress={() => accept.mutate(t.id)} disabled={accept.isPending} />
        )}
        <Chip label={next.isPending ? 'Meklēju…' : 'Cits ieteikums'} onPress={() => next.mutate()} disabled={next.isPending} />
        {(t.angle === 'protein' || t.angle === 'fibre' || t.angle === 'meals') && (
          <Chip label="Kas ir mājās?" onPress={() => router.push({ pathname: '/pantry', params: { date } })} testID="tip-pantry" />
        )}
      </View>
      <View style={styles.tipFoot}>
        <View style={{ flex: 1 }}>
          <AiLabel ai={t.aiGenerated} color={colors.accentDeep} />
        </View>
        <IconButton
          icon="dots"
          label="Ziņot par ieteikumu"
          color={colors.accentDeep}
          size={20}
          onPress={() => router.push({ pathname: '/tip-report', params: { id: t.id, date } })}
          testID="tip-report"
        />
      </View>
    </View>
  );
}

/** Brīvais laiks: films, books and events in the user's city. */
function LeisureCard() {
  return (
    <Card style={[styles.card, { gap: 8 }]} onPress={() => router.push('/leisure')} accessibilityLabel="Brīvais laiks: filma, grāmata vai pasākums" testID="leisure-card">
      <View style={styles.cardHeader}>
        <View style={styles.tipTitle}>
          <Icon name="star" color={colors.accentDeep} size={18} />
          <Text style={styles.tipTitleText}>Brīvais laiks</Text>
        </View>
        <Icon name="chevron" color={colors.caption} size={20} />
      </View>
      <Text style={type.secondary}>Filma kinoteātrī vai Go3, grāmata vai pasākums tavā pilsētā — tikai tas, kam vēl vari paspēt.</Text>
    </Card>
  );
}

function SummaryCard({ date, pro }: { date: string; pro: boolean }) {
  const summary = useWeeklySummary(date, pro);
  return (
    <Card
      style={[styles.card, { gap: 8 }]}
      onPress={() => router.push(pro ? '/summary' : '/me/pro')}
      accessibilityLabel={pro ? 'Nedēļas kopsavilkums' : 'Nedēļas AI kopsavilkums, Pro'}>
      <View style={styles.cardHeader}>
        <View style={styles.tipTitle}>
          <Icon name="trend" color={colors.accentDeep} size={18} />
          <Text style={styles.tipTitleText}>Nedēļas kopsavilkums</Text>
        </View>
        {pro ? <Icon name="chevron" color={colors.caption} size={20} /> : <Text style={styles.proBadge}>PRO</Text>}
      </View>
      {pro ? (
        <Text style={styles.question} testID="summary-headline">
          {summary.data?.headline ?? (summary.isError ? 'Kopsavilkums vēl gatavojas' : 'Analizēju tavu nedēļu…')}
        </Text>
      ) : (
        <Text style={type.secondary}>AI izanalizē tavu nedēļu — kas strādā, kur ir iespējas un viens mazs nākamais solis.</Text>
      )}
    </Card>
  );
}

function TipTitle() {
  return (
    <View style={styles.tipTitle}>
      <Icon name="bulb" color={colors.accentDeep} size={18} />
      <Text style={styles.tipTitleText}>Šodienas ieteikums · tavā stilā</Text>
    </View>
  );
}

function Chip({ label, dark, onPress, disabled, testID }: { label: string; dark?: boolean; onPress?: () => void; disabled?: boolean; testID?: string }) {
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      hitSlop={{ top: 2, bottom: 2 }}
      style={({ pressed }) => [
        styles.chip,
        { backgroundColor: dark ? colors.ink : colors.white },
        (pressed || disabled) && { opacity: 0.7 },
      ]}>
      <Text style={[styles.chipText, dark && { color: colors.white }]}>{label}</Text>
    </Pressable>
  );
}

function Macro({ label, p, color, track }: { label: string; p: Progress; color: string; track: string }) {
  return (
    <View style={styles.macro} accessible accessibilityLabel={`${label}: ${Math.round(p.value)} no ${p.target} gramiem`}>
      <ProgressRing size={46} stroke={6} progress={p.value / p.target} color={color} trackColor={track} />
      <View style={{ flexShrink: 1 }}>
        <Text style={styles.smallSecondary}>{label}</Text>
        <Text style={styles.macroValue}>
          {formatNumber(p.value)} / {formatNumber(p.target)} g
        </Text>
      </View>
    </View>
  );
}

function WeeklyQuestionCard({ date }: { date: string }) {
  const qc = useQueryClient();
  const wq = useWeeklyQuestion(date);
  const answer = useMutation({
    mutationFn: ({ id, i }: { id: string; i: number }) => api.answerWeeklyQuestion(id, i),
    onSuccess: (q: WeeklyQuestion) => qc.setQueryData(keys.weekly(date), q),
  });
  const q = wq.data;
  if (!q) return null;
  const picked = q.answerIndex !== null ? q.options[q.answerIndex] : null;
  return (
    <Card style={[styles.card, { gap: 12 }]}>
      <View style={styles.cardHeader}>
        <View style={styles.tipTitle}>
          <Icon name="chat" color={colors.accentDeep} size={18} />
          <Text style={styles.tipTitleText}>Nedēļas jautājums</Text>
        </View>
        <Text style={type.caption}>1 reizi nedēļā</Text>
      </View>
      {picked ? (
        <View style={{ gap: 8 }}>
          <Text style={type.secondary}>
            Tava atbilde: <Text style={{ fontFamily: fonts.bodyBold, color: colors.ink }}>{picked.label}</Text>
          </Text>
          <Text style={styles.reply}>{picked.reply}</Text>
        </View>
      ) : (
        <View style={{ gap: 12 }}>
          {q.basedOn && <Text style={styles.basedOn}>Pamanīju: {q.basedOn}</Text>}
          <Text style={styles.question}>{q.question}</Text>
          <View style={styles.options}>
            {q.options.map((o, i) => (
              <Pressable
                key={o.label}
                onPress={() => answer.mutate({ id: q.id, i })}
                disabled={answer.isPending}
                accessibilityRole="button"
                hitSlop={{ top: 2, bottom: 2 }}
                style={({ pressed }) => [styles.chip, { backgroundColor: colors.chip }, pressed && { opacity: 0.8 }]}>
                <Text style={styles.chipText}>{o.label}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={type.caption}>Nav obligāti — vari arī izlaist.</Text>
        </View>
      )}
    </Card>
  );
}

function QuickAdd({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }): ReactNode {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Pievienot: ${label}`}
      style={({ pressed }) => [styles.quick, pressed && { backgroundColor: colors.neutralSoft }]}>
      <Icon name={icon} color={colors.ink} />
      <Text style={styles.quickLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 2, paddingBottom: 4 },
  date: { fontFamily: fonts.bodySemi, fontSize: 14, lineHeight: 18, color: colors.caption },

  card: { padding: space.card, gap: 16 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  link: { minHeight: hit - 6, justifyContent: 'center', paddingLeft: 12 },
  unit: { fontFamily: fonts.body, fontSize: 14, color: colors.text2 },
  unitLg: { fontFamily: fonts.body, fontSize: 15, color: colors.text2 },
  smallSecondary: { fontFamily: fonts.body, fontSize: 13, lineHeight: 17, color: colors.text2 },
  big: { fontFamily: fonts.heading, fontSize: 30, lineHeight: 36, color: colors.ink, letterSpacing: -0.6 },

  tip: { backgroundColor: colors.accentSoft, borderRadius: radius.card, padding: space.card, gap: 10 },
  tipTitle: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  tipTitleText: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.accentDeep },
  tipBody: { fontFamily: fonts.body, fontSize: 16, lineHeight: 24, color: colors.tipText },
  chip: { height: 40, paddingHorizontal: 16, borderRadius: radius.chip, justifyContent: 'center' },
  chipText: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.ink },
  tipFoot: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: -4, marginBottom: -8, marginRight: -10 },
  proBadge: { fontFamily: fonts.bodyBold, fontSize: 11, color: colors.white, backgroundColor: colors.ink, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, overflow: 'hidden' },
  basedOn: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: colors.text2 },
  accepted: { height: 40, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 6 },

  energy: { flexDirection: 'row', alignItems: 'center', gap: 18 },
  ringValue: { fontFamily: fonts.heading, fontSize: 30, lineHeight: 32, color: colors.ink, letterSpacing: -0.6 },
  ringCaption: { fontFamily: fonts.body, fontSize: 13, color: colors.text2, paddingTop: 4 },
  left: { fontFamily: fonts.heading, fontSize: 22, lineHeight: 28, color: colors.ink, letterSpacing: -0.4 },
  macros: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 14, columnGap: 12 },
  macro: { flexDirection: 'row', alignItems: 'center', gap: 10, width: '47%' },
  macroValue: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.ink },

  water: { flexDirection: 'row', alignItems: 'center', gap: 18 },
  waterAdd: {
    marginTop: 6,
    height: hit,
    paddingHorizontal: 16,
    alignSelf: 'flex-start',
    borderRadius: 22,
    backgroundColor: colors.waterSoft,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  waterAddText: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.waterDeep },

  moveRow: { flexDirection: 'row', gap: 16 },
  divider: { width: 1, backgroundColor: colors.border },

  sleepRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  score: { alignItems: 'center', gap: 2, paddingVertical: 8, paddingHorizontal: 14, borderRadius: 16, backgroundColor: colors.sleepSoft },
  scoreValue: { fontFamily: fonts.heading, fontSize: 24, lineHeight: 28, color: colors.sleepDeep },
  scoreLabel: { fontFamily: fonts.bodySemi, fontSize: 12, color: colors.sleepDeep },
  stages: { flexDirection: 'row', height: 10, borderRadius: 5, overflow: 'hidden', gap: 2 },

  question: { fontFamily: fonts.bodySemi, fontSize: 17, lineHeight: 24, color: colors.ink },
  reply: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, color: colors.ink },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },

  quickRow: { flexDirection: 'row', gap: 10 },
  quick: {
    flex: 1,
    height: 76,
    borderRadius: radius.option,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  quickLabel: { fontFamily: fonts.bodySemi, fontSize: 13, color: colors.ink },
});
