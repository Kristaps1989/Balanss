import { router, type Href } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getMe, getToday, useAsync, type Progress, type Today, type User, type WeeklyQuestionOption } from '@/api';
import { Avatar } from '@/components/Avatar';
import { Card } from '@/components/Card';
import { Icon, type IconName } from '@/components/Icon';
import { ProgressBar } from '@/components/ProgressBar';
import { ProgressRing } from '@/components/ProgressRing';
import { SourceNote } from '@/components/SourceNote';
import { WaterGlass } from '@/components/WaterGlass';
import { duration, formatNumber, greeting, kcal, litres, longDate } from '@/lib/format';
import { addWater, GLASS_ML, initWater, useWater } from '@/store/water';
import { colors, fonts, hit, radius, space, type } from '@/theme';

/** Šodiena (prototype: Home.dc.html). */
export default function HomeScreen() {
  const user = useAsync(getMe);
  const today = useAsync(() => getToday());
  if (!user || !today) return <View style={styles.screen} />;
  return <HomeContent user={user} today={today} />;
}

function HomeContent({ user, today }: { user: User; today: Today }) {
  const now = new Date();
  const { nutrition, movement, sleep } = today;

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={styles.date}>{longDate(now)}</Text>
            <Text style={type.h1}>
              {greeting(now)}, {user.firstName}
            </Text>
          </View>
          <Avatar name={user.firstName} onPress={() => router.push('/me')} />
        </View>

        <TipCard body={today.tip.body} highlight={today.tip.highlight} />

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
              <Text style={styles.left}>{remainingLabel(nutrition.kcal)}</Text>
              <Text style={type.secondary}>Pietiek vieglām vakariņām ar olbaltumvielām.</Text>
            </View>
          </View>
          <View style={styles.macros}>
            <Macro label="Olbaltumvielas" p={nutrition.proteinG} color={colors.protein} track={colors.proteinTrack} />
            <Macro label="Ogļhidrāti" p={nutrition.carbsG} color={colors.carbs} track={colors.carbsTrack} />
            <Macro label="Tauki" p={nutrition.fatG} color={colors.fat} track={colors.fatTrack} />
            <Macro label="Šķiedrvielas" p={nutrition.fibreG} color={colors.fibre} track={colors.fibreTrack} />
          </View>
        </Card>

        <WaterCard initialMl={nutrition.waterMl.value} target={nutrition.waterMl.target} />

        <Card style={[styles.card, { gap: 12 }]}>
          <CardHeader title="Kustība" link="Vairāk" href="/movement" />
          <View style={styles.moveRow}>
            <View style={{ flex: 1, gap: 8 }}>
              <Text>
                <Text style={type.number}>{formatNumber(movement.steps.value)}</Text>
                <Text style={styles.unit}> / {formatNumber(movement.steps.target)} soļi</Text>
              </Text>
              <ProgressBar
                progress={movement.steps.value / movement.steps.target}
                color={colors.steps}
                trackColor={colors.stepsTrack}
              />
            </View>
            <View style={styles.divider} />
            <View style={{ width: 92, gap: 2 }}>
              <Text style={type.number}>{formatNumber(movement.activeKcal)}</Text>
              <Text style={styles.smallSecondary}>aktīvās kcal</Text>
            </View>
          </View>
          <SourceNote source={movement.source} />
        </Card>

        <Card style={[styles.card, { gap: 12 }]}>
          <CardHeader title="Pagājušā nakts" link="Vairāk" href="/sleep" />
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
        </Card>

        {today.weeklyQuestion && (
          <WeeklyQuestionCard question={today.weeklyQuestion.question} options={today.weeklyQuestion.options} />
        )}

        <View style={{ gap: 10, paddingTop: 4 }}>
          <Text style={[type.section, { paddingHorizontal: 2 }]}>Pievieno</Text>
          <View style={styles.quickRow}>
            <QuickAdd icon="camera" label="Foto" onPress={() => router.navigate('/nutrition')} />
            <QuickAdd icon="drop" label="Ūdens" onPress={() => addWater()} />
            <QuickAdd icon="movement" label="Aktivitāte" onPress={() => router.navigate('/movement')} />
            <QuickAdd icon="scale" label="Svars" onPress={() => router.push('/me')} />
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function remainingLabel(p: Progress) {
  const left = p.target - p.value;
  return left >= 0 ? `Vēl ${kcal(left)}` : `${kcal(-left)} virs mērķa`;
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

function TipCard({ body, highlight }: { body: string; highlight?: string }) {
  const [before, after] = highlight && body.includes(highlight) ? body.split(highlight, 2) : [body, undefined];
  return (
    <View style={styles.tip}>
      <View style={styles.tipTitle}>
        <Icon name="bulb" color={colors.accentDeep} size={18} />
        <Text style={styles.tipTitleText}>Šodienas ieteikums · tavā stilā</Text>
      </View>
      <Text style={styles.tipBody}>
        {before}
        {after !== undefined && (
          <>
            <Text style={{ fontFamily: fonts.bodyBold }}>{highlight}</Text>
            {after}
          </>
        )}
      </Text>
      <View style={{ flexDirection: 'row', gap: 8, paddingTop: 2 }}>
        <Chip dark label="Labi, pamēģināšu" />
        <Chip label="Cits ieteikums" />
      </View>
    </View>
  );
}

function Chip({ label, dark, onPress }: { label: string; dark?: boolean; onPress?: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      hitSlop={{ top: 2, bottom: 2 }}
      style={({ pressed }) => [
        styles.chip,
        { backgroundColor: dark ? colors.ink : colors.white },
        pressed && { opacity: 0.8 },
      ]}>
      <Text style={[styles.chipText, dark && { color: colors.white }]}>{label}</Text>
    </Pressable>
  );
}

function Macro({ label, p, color, track }: { label: string; p: Progress; color: string; track: string }) {
  return (
    <View style={styles.macro}>
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

function WaterCard({ initialMl, target }: { initialMl: number; target: number }) {
  useEffect(() => initWater(initialMl), [initialMl]);
  const ml = useWater() ?? initialMl;
  return (
    <Card style={[styles.card, styles.water]}>
      <WaterGlass progress={ml / target} />
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={type.section}>Ūdens</Text>
        <Text>
          <Text style={styles.big}>{litres(ml)}</Text>
          <Text style={styles.unitLg}> no {litres(target)}</Text>
        </Text>
        <Pressable
          onPress={() => addWater()}
          accessibilityRole="button"
          accessibilityLabel={`Pievienot ${GLASS_ML} ml ūdens`}
          style={({ pressed }) => [styles.waterAdd, pressed && { opacity: 0.8 }]}>
          <Icon name="plus" color={colors.waterDeep} size={18} strokeWidth={2.2} />
          <Text style={styles.waterAddText}>{GLASS_ML} ml</Text>
        </Pressable>
      </View>
    </Card>
  );
}

function WeeklyQuestionCard({ question, options }: { question: string; options: WeeklyQuestionOption[] }) {
  const [answer, setAnswer] = useState<WeeklyQuestionOption>();
  return (
    <Card style={[styles.card, { gap: 12 }]}>
      <View style={styles.cardHeader}>
        <View style={styles.tipTitle}>
          <Icon name="chat" color={colors.accentDeep} size={18} />
          <Text style={styles.tipTitleText}>Nedēļas jautājums</Text>
        </View>
        <Text style={type.caption}>1 reizi nedēļā</Text>
      </View>
      {answer ? (
        <View style={{ gap: 8 }}>
          <Text style={type.secondary}>
            Tava atbilde: <Text style={{ fontFamily: fonts.bodyBold, color: colors.ink }}>{answer.label}</Text>
          </Text>
          <Text style={styles.reply}>{answer.reply}</Text>
        </View>
      ) : (
        <View style={{ gap: 12 }}>
          <Text style={styles.question}>{question}</Text>
          <View style={styles.options}>
            {options.map((o) => (
              <Pressable
                key={o.label}
                onPress={() => setAnswer(o)}
                accessibilityRole="button"
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
      style={({ pressed }) => [styles.quick, pressed && { backgroundColor: colors.neutralSoft }]}>
      <Icon name={icon} color={colors.ink} />
      <Text style={styles.quickLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: space.screen, paddingTop: space.lg, paddingBottom: 28, gap: space.stack },
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
