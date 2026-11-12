import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router, type Href } from 'expo-router';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { api, type Day, type Meal, type Me, type Progress, type Tip, type TipFocus, type ToneStyle, type WeeklyQuestion } from '@/api';
import { keys, useDay, useMe, useTip, useWeeklyQuestion, useWeeklySummary } from '@/api/hooks';
import { AiLabel } from '@/components/AiLabel';
import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { CareCard } from '@/components/CareCard';
import { Card } from '@/components/Card';
import { IconButton } from '@/components/Header';
import { Icon, type IconName } from '@/components/Icon';
import { ProgressBar } from '@/components/ProgressBar';
import { ProgressRing } from '@/components/ProgressRing';
import { Screen } from '@/components/Screen';
import { ErrorState, Loading } from '@/components/States';
import { duration, formatNumber, greeting, itemList, litres, longDate, syncedAgo, timeOf } from '@/lib/format';
import { GLASS_ML, useAddWater } from '@/lib/mutations';
import { useHealthRefresh } from '@/lib/services';
import { useToday } from '@/lib/today';
import { MEAL_LABEL } from '@shared/nutrition';
import { colors, fonts, hit, radius, space, themed, type } from '@/theme';

/** The tone the tips are written in, as the user knows it from "Es → Tonis". */
const TONE_TITLE: Record<ToneStyle, string> = {
  plan: 'plāns un skaitļi',
  novelty: 'dažādība un jaunais',
  gentle: 'maigi, bez spiediena',
  neutral: 'neitrāls',
};

const SOURCE_LABEL = { apple_health: 'Apple Health', health_connect: 'Health Connect', manual: 'ievadīts manuāli' } as const;

/**
 * Šodiena: one question answered at a glance — how is today going?
 * One hero number (kcal left), thin bars, one focus for the day, then the
 * meals and three one-line rows. Everything else is one tap down.
 */
export default function HomeScreen() {
  const date = useToday();
  const me = useMe();
  const day = useDay(date);
  const hr = useHealthRefresh(day.refetch);
  if (day.isPending || me.isPending) return <Loading />;
  if (day.isError || !me.data) return <ErrorState onRetry={() => day.refetch()} />;
  return <HomeContent date={date} me={me.data} day={day.data} refreshing={hr.refreshing} onRefresh={hr.refresh} />;
}

function HomeContent({ date, me, day, refreshing, onRefresh }: { date: string; me: Me; day: Day; refreshing: boolean; onRefresh: () => void }) {
  const now = new Date();
  const firstName = me.profile.firstName;
  const pro = me.plan === 'pro';
  const tip = useTip(date);
  const focus = tip.data?.angle ?? null;

  return (
    <Screen refreshing={refreshing} onRefresh={onRefresh} testID="home" gap={22}>
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

      <TodayCard day={day} focus={focus} />

      <TipCard date={date} tip={tip.data} pending={tip.isPending} tone={me.tone} />

      <RowsCard date={date} day={day} focus={focus} />

      <MealsSection meals={day.meals} />

      <WeeklyQuestionCard date={date} />

      <View style={styles.more}>
        <SummaryRow date={date} pro={pro} />
        <View style={styles.rowDivider} />
        <LeisureRow />
      </View>

      <Text style={styles.week} testID="week-logged">
        Šonedēļ maltītes pierakstītas {day.week.loggedDays} no {day.week.days} dienām
      </Text>

      <SyncLine me={me} source={day.movement.source} />
    </Screen>
  );
}

// ---------------------------------------------------------------- hero

function TodayCard({ day, focus }: { day: Day; focus: TipFocus | null }) {
  const n = day.nutrition;
  const left = Math.round(n.kcal.target - n.kcal.value);
  const care = day.care.active;
  const hero = care || left < 0 ? formatNumber(n.kcal.value) : formatNumber(left);
  const heroCaption = care ? 'Šodien apēsts' : left < 0 ? 'kcal šodien' : 'kcal vēl šodien';
  return (
    <View style={styles.today}>
      <ProgressRing size={232} stroke={7} progress={n.kcal.value / n.kcal.target} color={colors.kcal} trackColor={colors.kcalTrack} animate>
        <Text style={type.hero} testID="kcal-hero">
          {hero}
        </Text>
        <Text style={styles.heroCaption}>{heroCaption}</Text>
      </ProgressRing>
      <Text style={styles.eaten} testID="kcal-line">
        {care ? 'Galvenais — regulāras maltītes un pietiekami daudz atpūtas.' : `${formatNumber(n.kcal.value)} no ${formatNumber(n.kcal.target)} kcal`}
      </Text>
      {/* Fibre and calcium live on Uzturs; the day view keeps the three macros. */}
      <View style={styles.macros}>
        <Macro label="Olbaltumvielas" short="Olbaltumv." p={n.proteinG} color={colors.protein} track={colors.proteinTrack} focused={focus === 'protein'} />
        <Macro label="Ogļhidrāti" p={n.carbsG} color={colors.carbs} track={colors.carbsTrack} />
        <Macro label="Tauki" p={n.fatG} color={colors.fat} track={colors.fatTrack} />
      </View>
    </View>
  );
}

function Macro({ label, short, p, color, track, focused }: { label: string; short?: string; p: Progress; color: string; track: string; focused?: boolean }) {
  const value = `${formatNumber(Math.round(p.value))} / ${formatNumber(p.target)} g`;
  return (
    <View style={styles.macro} accessible accessibilityLabel={`${label}: ${value}${focused ? ', šodienas fokuss' : ''}`}>
      <Text style={[styles.macroLabel, focused && styles.macroLabelFocus]} numberOfLines={1}>
        {short ?? label}
      </Text>
      <Text style={styles.macroValue} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <ProgressBar progress={p.value / p.target} color={color} trackColor={track} height={3} />
    </View>
  );
}

// ---------------------------------------------------------------- focus tip

function TipCard({ date, tip, pending, tone }: { date: string; tip: Tip | null | undefined; pending: boolean; tone: ToneStyle }) {
  const qc = useQueryClient();
  const water = useAddWater(date);
  const setTip = (t: Tip) => {
    qc.setQueryData(keys.tip(date), t);
    qc.invalidateQueries({ queryKey: keys.day(date) });
  };
  const next = useMutation({ mutationFn: () => api.tipNext(date), onSuccess: setTip });
  const accept = useMutation({ mutationFn: (id: string) => api.acceptTip(id), onSuccess: setTip });

  if (pending) {
    return (
      <View style={[styles.tip, { minHeight: 120, justifyContent: 'center' }]}>
        <TipTitle tone={tone} />
        <Text style={styles.tipBody}>Gatavoju šodienas fokusu…</Text>
      </View>
    );
  }
  if (!tip) return null;
  const t = tip;
  const [before, after] = t.highlight && t.body.includes(t.highlight) ? t.body.split(t.highlight, 2) : [t.body, undefined];
  // One action per tip: the water tip logs the glass it suggests; the rest are a "yes, I'll try".
  const action =
    t.angle === 'water'
      ? {
          label: `Pievienot ${GLASS_ML} ml`,
          run: () => {
            water.mutate(GLASS_ML);
            accept.mutate(t.id);
          },
        }
      : { label: 'Labi, pamēģināšu', run: () => accept.mutate(t.id) };
  return (
    <View style={styles.tip} testID="tip-card">
      <TipTitle tone={tone} />
      <Text style={styles.tipBody} testID="tip-body">
        {before}
        {after !== undefined && (
          <>
            <Text style={{ fontFamily: fonts.bodyBold }}>{t.highlight}</Text>
            {after}
          </>
        )}
      </Text>
      <View style={styles.tipActions}>
        {t.accepted ? (
          <View style={styles.accepted}>
            <Icon name="check" color={colors.onLime} size={18} strokeWidth={2.4} />
            <Text style={styles.acceptedText}>Pieņemts</Text>
          </View>
        ) : (
          <Chip primary label={action.label} onPress={action.run} disabled={accept.isPending} />
        )}
        <Chip label={next.isPending ? 'Meklēju…' : 'Cits ieteikums'} onPress={() => next.mutate()} disabled={next.isPending} />
        {(t.angle === 'protein' || t.angle === 'fibre' || t.angle === 'meals') && (
          <Chip label="Kas ir mājās?" onPress={() => router.push({ pathname: '/pantry', params: { date } })} testID="tip-pantry" />
        )}
      </View>
      <View style={styles.tipFoot}>
        <View style={{ flex: 1 }}>
          <AiLabel ai={t.aiGenerated} color={colors.limeDeep} />
        </View>
        <IconButton
          icon="dots"
          label="Ziņot par ieteikumu"
          color={colors.limeDeep}
          size={20}
          onPress={() => router.push({ pathname: '/tip-report', params: { id: t.id, date } })}
          testID="tip-report"
        />
      </View>
    </View>
  );
}

function TipTitle({ tone }: { tone: ToneStyle }) {
  return (
    <View style={styles.tipHead}>
      <View style={styles.tipTitle}>
        <Icon name="bulb" color={colors.onLime} size={18} />
        <Text style={styles.tipTitleText}>Šodienas fokuss</Text>
      </View>
      <Pressable onPress={() => router.push('/me/tone')} accessibilityRole="link" hitSlop={10} testID="tip-tone">
        <Text style={styles.toneLabel}>Tavā stilā: {TONE_TITLE[tone]}</Text>
      </Pressable>
    </View>
  );
}

function Chip({ label, primary, onPress, disabled, testID }: { label: string; primary?: boolean; onPress?: () => void; disabled?: boolean; testID?: string }) {
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      hitSlop={{ top: 2, bottom: 2 }}
      style={({ pressed }) => [styles.chip, primary ? styles.chipPrimary : styles.chipSecondary, (pressed || disabled) && { opacity: 0.7 }]}>
      <Text style={[styles.chipText, primary && { color: colors.lime }]}>{label}</Text>
    </Pressable>
  );
}

// ---------------------------------------------------------------- meals

function MealsSection({ meals }: { meals: Meal[] }) {
  return (
    <View style={{ gap: 10 }}>
      <SectionHeader title="Šodienas maltītes" link="Visas" href="/nutrition" />
      {meals.length === 0 ? (
        <Card style={styles.emptyMeals}>
          <Text style={type.secondary}>Vēl nav nevienas maltītes. Nofotografē pirmo — tas aizņem dažas sekundes.</Text>
          <Button label="Foto" icon="camera" size="md" variant="accent" onPress={() => router.push('/nutrition/camera')} style={{ alignSelf: 'flex-start', paddingHorizontal: 24 }} />
        </Card>
      ) : (
        <Card style={styles.list}>
          {meals.map((m, i) => (
            <View key={m.id}>
              {i > 0 && <View style={styles.rowDivider} />}
              <MealRow meal={m} />
            </View>
          ))}
        </Card>
      )}
    </View>
  );
}

function MealRow({ meal }: { meal: Meal }) {
  const photo = meal.photoUrl && !meal.photoUrl.startsWith('data:') ? meal.photoUrl : null;
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/meal/[id]', params: { id: meal.id, date: meal.date } })}
      accessibilityRole="button"
      accessibilityLabel={`${MEAL_LABEL[meal.type]}, ${meal.totals.kcal} kcal`}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.8 }]}>
      {photo ? (
        <Image source={{ uri: photo }} style={styles.thumb} accessibilityLabel="Maltītes foto" />
      ) : (
        <View style={[styles.thumb, styles.thumbEmpty]}>
          <Icon name="nutrition" color={colors.accentDeep} size={22} />
        </View>
      )}
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {itemList(meal.items.map((i) => i.name))}
        </Text>
        <Text style={styles.rowMeta}>
          {MEAL_LABEL[meal.type]} · {timeOf(meal.eatenAt)}
        </Text>
      </View>
      <Text style={styles.rowValue}>{formatNumber(meal.totals.kcal)} kcal</Text>
    </Pressable>
  );
}

// ---------------------------------------------------------------- one-line rows

function RowsCard({ date, day, focus }: { date: string; day: Day; focus: TipFocus | null }) {
  const water = useAddWater(date);
  const w = day.nutrition.waterMl;
  const steps = day.movement.steps;
  return (
    <View style={styles.tiles}>
      <Tile
        icon="drop"
        color={colors.water}
        title="Ūdens"
        value={litres(w.value)}
        valueTestID="water-total"
        sub={`+ ${GLASS_ML} ml`}
        subColor={colors.waterDeep}
        focused={focus === 'water'}
        onPress={() => water.mutate(GLASS_ML)}
        role="button"
        label={`Ūdens: ${litres(w.value)} no ${litres(w.target)}. Pievienot ${GLASS_ML} ml`}
        testID="water-add"
      />
      <Tile
        icon="movement"
        color={colors.steps}
        title="Soļi"
        value={formatNumber(steps.value)}
        sub={`no ${formatNumber(steps.target)}`}
        focused={focus === 'steps'}
        onPress={() => router.navigate('/movement')}
        role="link"
        label={`Soļi: ${formatNumber(steps.value)} no ${formatNumber(steps.target)}`}
      />
      <Tile
        icon="sleep"
        color={colors.sleepRem}
        title="Miegs"
        value={day.sleep ? duration(day.sleep.totalMin) : '—'}
        sub={day.sleep ? 'šonakt' : 'vēl nav datu'}
        focused={focus === 'sleep'}
        onPress={() => router.navigate('/sleep')}
        role="link"
        label={day.sleep ? `Miegs: ${duration(day.sleep.totalMin)}` : 'Miegs: vēl nav datu'}
      />
    </View>
  );
}

/** One of the three day tiles. The whole tile is the touch target; water adds a glass in one tap. */
function Tile({
  icon,
  color,
  title,
  value,
  valueTestID,
  sub,
  subColor,
  focused,
  onPress,
  role,
  label,
  testID,
}: {
  icon: IconName;
  color: string;
  title: string;
  value: string;
  valueTestID?: string;
  sub: string;
  subColor?: string;
  focused?: boolean;
  onPress: () => void;
  role: 'button' | 'link';
  label: string;
  testID?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={role}
      accessibilityLabel={label}
      testID={testID}
      style={({ pressed }) => [styles.tile, focused && styles.tileFocus, pressed && { opacity: 0.8 }]}>
      <View style={styles.tileHead}>
        <Icon name={icon} color={color} size={18} />
        <Text style={styles.tileTitle}>{title}</Text>
      </View>
      {/* A trailing "min" is set small, so "6 h 40 min" fits a third of the screen. */}
      <Text style={styles.tileValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75} testID={valueTestID}>
        {/\smin$/.test(value) ? (
          <>
            {value.slice(0, -4)}
            <Text style={styles.tileUnit}> min</Text>
          </>
        ) : (
          value
        )}
      </Text>
      <Text style={[styles.tileSub, subColor ? { color: subColor, fontFamily: fonts.bodySemi } : null]} numberOfLines={1}>
        {sub}
      </Text>
    </Pressable>
  );
}

function RowIcon({ icon, color }: { icon: IconName; color: string }) {
  return (
    <View style={styles.rowIcon}>
      <Icon name={icon} color={color} size={20} />
    </View>
  );
}

function SectionHeader({ title, link, href }: { title: string; link: string; href: Href }) {
  return (
    <View style={styles.sectionHead}>
      <Text style={type.section}>{title}</Text>
      <Pressable onPress={() => router.navigate(href)} accessibilityRole="link" hitSlop={8} style={styles.link}>
        <Text style={type.link}>{link}</Text>
      </Pressable>
    </View>
  );
}

// ---------------------------------------------------------------- below the fold

function SummaryRow({ date, pro }: { date: string; pro: boolean }) {
  const summary = useWeeklySummary(date, pro);
  return (
    <Pressable
      onPress={() => router.push(pro ? '/summary' : '/me/pro')}
      accessibilityRole="button"
      accessibilityLabel={pro ? 'Nedēļas kopsavilkums' : 'Nedēļas AI kopsavilkums, Pro'}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.8 }]}>
      <RowIcon icon="trend" color={colors.accentDeep} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.rowTitle}>Nedēļas kopsavilkums</Text>
        {pro ? (
          <Text style={styles.rowMeta} testID="summary-headline" numberOfLines={2}>
            {summary.data?.headline ?? (summary.isError ? 'Kopsavilkums vēl gatavojas' : 'Analizēju tavu nedēļu…')}
          </Text>
        ) : (
          <Text style={styles.rowMeta}>Kas strādā un viens mazs nākamais solis</Text>
        )}
      </View>
      {pro ? <Icon name="chevron" color={colors.caption} size={20} /> : <Text style={styles.proBadge}>PRO</Text>}
    </Pressable>
  );
}

/** Brīvais laiks: films, books and events in the user's city. */
function LeisureRow() {
  return (
    <Pressable
      onPress={() => router.push('/leisure')}
      accessibilityRole="button"
      accessibilityLabel="Brīvais laiks: filma, grāmata vai pasākums"
      testID="leisure-card"
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.8 }]}>
      <RowIcon icon="star" color={colors.accentDeep} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.rowTitle}>Brīvais laiks</Text>
        <Text style={styles.rowMeta}>Filma, grāmata vai pasākums tavā pilsētā</Text>
      </View>
      <Icon name="chevron" color={colors.caption} size={20} />
    </Pressable>
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
    <Card style={{ gap: 12 }}>
      <View style={styles.sectionHead}>
        <View style={styles.tipTitle}>
          <Icon name="chat" color={colors.accentDeep} size={18} />
          <Text style={styles.cardKicker}>Nedēļas jautājums</Text>
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
                style={({ pressed }) => [styles.option, pressed && { opacity: 0.8 }]}>
                <Text style={styles.optionText}>{o.label}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={type.caption}>Nav obligāti — vari arī izlaist.</Text>
        </View>
      )}
    </Card>
  );
}

function SyncLine({ me, source }: { me: Me; source: Day['movement']['source'] }) {
  if (!source || source === 'manual') return null;
  const ago = me.devices.lastSyncAt ? ` · sinhronizēts ${syncedAgo(me.devices.lastSyncAt)}` : '';
  return (
    <View style={styles.sync} testID="sync-line">
      <View style={[styles.dot, { backgroundColor: colors.accent }]} />
      <Text style={type.caption}>
        Dati no {SOURCE_LABEL[source]}
        {me.devices.devices.length ? ` · ${me.devices.devices.join(', ')}` : ''}
        {ago}
      </Text>
    </View>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 2, paddingTop: 4 },
    date: { fontFamily: fonts.bodySemi, fontSize: 14, lineHeight: 18, color: colors.caption },

    // The ring sits straight on the screen background: no card around the main number.
    today: { alignItems: 'center', gap: 14, paddingTop: 6 },
    heroCaption: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.text2 },
    eaten: { fontFamily: fonts.body, fontSize: 15, lineHeight: 21, color: colors.text2, textAlign: 'center' },
    macros: { flexDirection: 'row', gap: 16, alignSelf: 'stretch', paddingTop: 10, paddingHorizontal: 2 },
    macro: { flex: 1, gap: 4 },
    macroLabel: { fontFamily: fonts.body, fontSize: 13, color: colors.text2 },
    macroLabelFocus: { fontFamily: fonts.bodyBold, color: colors.ink },
    macroValue: { fontFamily: fonts.bodySemi, fontSize: 16, lineHeight: 22, color: colors.ink, marginBottom: 4 },
    dot: { width: 8, height: 8, borderRadius: 4 },

    tiles: { flexDirection: 'row', gap: 10 },
    tile: { flex: 1, minHeight: 104, backgroundColor: colors.card, borderRadius: 22, padding: 14, gap: 2 },
    tileFocus: { backgroundColor: colors.accentSoft },
    tileHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
    tileTitle: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.text2 },
    tileValue: { fontFamily: fonts.bodySemi, fontSize: 20, lineHeight: 26, color: colors.ink, letterSpacing: -0.5 },
    tileUnit: { fontFamily: fonts.bodyMedium, fontSize: 13, letterSpacing: 0, color: colors.text2 },
    tileSub: { fontFamily: fonts.body, fontSize: 12, lineHeight: 16, color: colors.caption },

    tip: { backgroundColor: colors.lime, borderRadius: radius.card, padding: space.card, gap: 10 },
    tipHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
    tipTitle: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    tipTitleText: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.onLime },
    toneLabel: { fontFamily: fonts.bodySemi, fontSize: 12, color: colors.limeDeep, textDecorationLine: 'underline' },
    tipBody: { fontFamily: fonts.body, fontSize: 16, lineHeight: 24, color: colors.onLime },
    tipActions: { flexDirection: 'row', gap: 8, paddingTop: 2, flexWrap: 'wrap' },
    chip: { height: 40, paddingHorizontal: 16, borderRadius: radius.chip, justifyContent: 'center' },
    chipPrimary: { backgroundColor: colors.onLime },
    chipSecondary: { borderWidth: 1.5, borderColor: colors.onLime },
    chipText: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.onLime },
    accepted: { height: 40, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', gap: 6 },
    acceptedText: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.onLime },
    tipFoot: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: -4, marginBottom: -8, marginRight: -10 },

    sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 2 },
    link: { minHeight: hit - 6, justifyContent: 'center', paddingLeft: 12 },
    list: { paddingVertical: 4, paddingHorizontal: space.lg },
    emptyMeals: { gap: 12 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, paddingVertical: 8 },
    rowDivider: { height: 1, backgroundColor: colors.divider },
    rowIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.chip, alignItems: 'center', justifyContent: 'center' },
    rowTitle: { fontFamily: fonts.bodySemi, fontSize: 15, lineHeight: 20, color: colors.ink },
    rowMeta: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: colors.text2 },
    rowValue: { fontFamily: fonts.bodySemi, fontSize: 15, color: colors.ink },
    thumb: { width: 48, height: 48, borderRadius: 14 },
    thumbEmpty: { backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' },

    more: { backgroundColor: colors.card, borderRadius: radius.card, paddingHorizontal: space.lg, paddingVertical: 4 },
    cardKicker: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.accentDeep },
    proBadge: {
      fontFamily: fonts.bodyBold,
      fontSize: 11,
      color: colors.onInk,
      backgroundColor: colors.ink,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 8,
      overflow: 'hidden',
    },
    basedOn: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: colors.text2 },
    question: { fontFamily: fonts.bodySemi, fontSize: 17, lineHeight: 24, color: colors.ink },
    reply: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, color: colors.ink },
    options: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    option: { height: 40, paddingHorizontal: 16, borderRadius: radius.chip, justifyContent: 'center', backgroundColor: colors.chip },
    optionText: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.ink },

    week: { fontFamily: fonts.body, fontSize: 13, color: colors.text2, textAlign: 'center' },
    sync: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingBottom: 8 },
  }),
);
