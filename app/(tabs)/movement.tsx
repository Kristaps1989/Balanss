import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import type { Workout, WorkoutType } from '@/api';
import { useMe, useMovement } from '@/api/hooks';
import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { BarChart, Sparkline, weekdayShort } from '@/components/Charts';
import { TitleRow } from '@/components/Header';
import { Icon, type IconName } from '@/components/Icon';
import { ProgressBar } from '@/components/ProgressBar';
import { Screen } from '@/components/Screen';
import { SourceNote } from '@/components/SourceNote';
import { ErrorState, Loading } from '@/components/States';
import { formatNumber, workoutWhen } from '@/lib/format';
import { hrTrend, hrvTrend } from '@/lib/sleepPlan';
import { useToday } from '@/lib/today';
import { colors, fonts, radius, type } from '@/theme';

const ZONES = [
  { name: '1 · Ļoti viegli', c: '#CBD3EA' },
  { name: '2 · Viegli', c: colors.sleepRem },
  { name: '3 · Vidēji', c: colors.steps },
  { name: '4 · Intensīvi', c: colors.carbs },
  { name: '5 · Maksimāli', c: colors.accent },
];

const WORKOUT_ICON: Partial<Record<WorkoutType, IconName>> = { yoga: 'heart', swim: 'drop', strength: 'target' };

/** Kustība (prototype: Move.dc.html). */
export default function Movement() {
  const date = useToday();
  const me = useMe();
  const mv = useMovement(date);
  const header = <TitleRow title="Kustība" right={<Avatar name={me.data?.profile.firstName || '?'} onPress={() => router.push('/me')} />} />;
  if (mv.isPending) return <Screen>{header}<Loading /></Screen>;
  if (mv.isError) return <ErrorState onRetry={() => mv.refetch()} />;
  const m = mv.data;
  const zoned = m.workouts.find((w) => w.zones);
  const labels = m.days.map((d) => weekdayShort(d.date));
  const max = Math.max(m.today.steps.target * 1.35, ...m.days.map((d) => d.steps));

  return (
    <Screen refreshing={mv.isRefetching} onRefresh={() => mv.refetch()} testID="movement">
      {header}
      <Card style={styles.card}>
        <View style={styles.stepsHead}>
          <View>
            <Text style={type.secondary}>Soļi šodien</Text>
            <Text>
              <Text style={styles.huge}>{formatNumber(m.today.steps.value)}</Text>
              <Text style={styles.unit}> / {formatNumber(m.today.steps.target)}</Text>
            </Text>
          </View>
          <Text style={[type.secondary, { paddingBottom: 6 }]}>{formatNumber(m.today.activeKcal)} aktīvās kcal</Text>
        </View>
        <ProgressBar progress={m.today.steps.value / m.today.steps.target} color={colors.steps} trackColor={colors.stepsTrack} height={10} />
        <View style={{ marginTop: 6 }}>
          <BarChart
            values={m.days.map((d) => d.steps)}
            labels={labels}
            max={max}
            height={96}
            target={{ value: m.today.steps.target, label: '' }}
            color={colors.steps}
            mutedColor="#C9D9CF"
            highlight={m.days.length - 1}
            accessibilityLabel={`Soļi 7 dienās: ${m.days.map((d) => formatNumber(d.steps)).join(', ')}`}
          />
        </View>
        {m.source && <SourceNote source={m.source} />}
      </Card>

      <View style={{ flexDirection: 'row', gap: 12 }}>
        <Card style={styles.half}>
          <Text style={styles.small}>Miera pulss</Text>
          <Text>
            <Text style={styles.mid}>{m.restingHr.today ?? '—'}</Text>
            <Text style={styles.unitSm}> sit./min</Text>
          </Text>
          <Sparkline values={m.restingHr.series} color={colors.accent} width={130} />
          <Text style={type.caption}>7 dienas · {hrTrend(m.restingHr.series)}</Text>
        </Card>
        <Card style={styles.half}>
          <Text style={styles.small}>Sirds ritma mainība</Text>
          <Text>
            <Text style={styles.mid}>{m.hrv.today ?? '—'}</Text>
            <Text style={styles.unitSm}> ms</Text>
          </Text>
          <Sparkline values={m.hrv.series} color={colors.protein} width={130} />
          <Text style={type.caption}>7 dienas · {hrvTrend(m.hrv.series)}</Text>
        </Card>
      </View>

      <Card style={styles.list}>
        <View style={styles.listHead}>
          <Text style={type.section}>Treniņi</Text>
          <Button label="Pievienot" icon="plus" size="sm" variant="soft" onPress={() => router.push('/activity')} />
        </View>
        {m.workouts.length === 0 && <Text style={[type.secondary, { paddingBottom: 12 }]}>Vēl nav treniņu šonedēļ.</Text>}
        {m.workouts.slice(0, 6).map((w) => (
          <WorkoutRow key={w.id} w={w} today={date} />
        ))}
      </Card>

      {zoned?.zones && (
        <Card style={styles.card}>
          <View>
            <Text style={type.section}>Pulsa zonas</Text>
            <Text style={styles.small}>
              {zoned.name}, {workoutWhen(zoned.startedAt, date).toLowerCase().replace(/ \d\d:\d\d$/, '')} · {zoned.durationMin} min
            </Text>
          </View>
          {ZONES.map((z, i) => {
            const mins = zoned.zones!.minutes[i];
            const zmax = Math.max(...zoned.zones!.minutes, 1);
            return (
              <View key={z.name} style={styles.zone} accessible accessibilityLabel={`${z.name}: ${mins} minūtes`}>
                <Text style={styles.zoneName}>{z.name}</Text>
                <View style={styles.zoneTrack}>
                  <View style={{ height: 12, borderRadius: 6, backgroundColor: z.c, width: `${(mins / zmax) * 100}%` }} />
                </View>
                <Text style={styles.zoneMin}>{mins} min</Text>
              </View>
            );
          })}
          <SourceNote source={zoned.source} devices={zoned.device ? [zoned.device] : undefined} />
        </Card>
      )}
    </Screen>
  );
}

function WorkoutRow({ w, today }: { w: Workout; today: string }) {
  const meta = [workoutWhen(w.startedAt, today), `${w.durationMin} min`, w.device ?? (w.source === 'manual' ? 'ievadīts' : null)].filter(Boolean).join(' · ');
  return (
    <View style={styles.row}>
      <View style={styles.wIcon}>
        <Icon name={WORKOUT_ICON[w.type] ?? 'movement'} color={colors.moveDeep} size={22} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.wName}>{w.name}</Text>
        <Text style={styles.small}>{meta}</Text>
      </View>
      {w.avgHr !== null && (
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={styles.wName}>{w.avgHr}</Text>
          <Text style={type.caption}>vid. pulss</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: 18, gap: 12 },
  stepsHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  huge: { fontFamily: fonts.heading, fontSize: 36, lineHeight: 42, color: colors.ink },
  unit: { fontFamily: fonts.body, fontSize: 15, color: colors.text2 },
  half: { flex: 1, padding: 16, gap: 6, borderRadius: 22 },
  small: { fontFamily: fonts.body, fontSize: 13, color: colors.text2 },
  mid: { fontFamily: fonts.heading, fontSize: 28, color: colors.ink },
  unitSm: { fontFamily: fonts.body, fontSize: 13, color: colors.text2 },
  list: { paddingVertical: 8, paddingHorizontal: 18 },
  listHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 6, paddingBottom: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 68, borderTopWidth: 1, borderTopColor: '#F0EAE1' },
  wIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: colors.moveSoft, alignItems: 'center', justifyContent: 'center' },
  wName: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.ink },
  zone: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  zoneName: { width: 100, fontFamily: fonts.bodySemi, fontSize: 13, color: colors.ink },
  zoneTrack: { flex: 1, height: 12, borderRadius: 6, backgroundColor: colors.chip, overflow: 'hidden' },
  zoneMin: { width: 48, textAlign: 'right', fontFamily: fonts.bodyBold, fontSize: 13, color: colors.ink },
  radius: { borderRadius: radius.card },
});
