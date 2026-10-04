import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { api } from '@/api';
import { useMe, useMeMutation, useSleep } from '@/api/hooks';
import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { weekdayShort } from '@/components/Charts';
import { Segmented, Toggle } from '@/components/Controls';
import { TitleRow } from '@/components/Header';
import { Icon } from '@/components/Icon';
import { Screen } from '@/components/Screen';
import { SourceNote } from '@/components/SourceNote';
import { ErrorState, Loading } from '@/components/States';
import { duration } from '@/lib/format';
import { eveningAxisPos, windDownSteps } from '@/lib/sleepPlan';
import { useHealthRefresh } from '@/lib/services';
import { useToday } from '@/lib/today';
import { eveningMinutes, fromEveningMinutes } from '@shared/sleep';
import { colors, fonts, radius, type } from '@/theme';

const LEADS = [30, 45, 60] as const;

/** Miegs (prototype: Sleep.dc.html). */
export default function Sleep() {
  const date = useToday();
  const me = useMe();
  const sl = useSleep(date);
  const hr = useHealthRefresh(sl.refetch);
  const reminders = useMeMutation(api.updateReminders);
  const header = <TitleRow title="Miegs" right={<Avatar name={me.data?.profile.firstName || '?'} onPress={() => router.push('/me')} />} />;
  if (sl.isPending || !me.data) return <Screen>{header}<Loading /></Screen>;
  if (sl.isError) return <ErrorState onRetry={() => sl.refetch()} />;
  const s = sl.data;
  const n = s.lastNight;
  const r = me.data.reminders;

  if (!n) {
    const dev = me.data.devices;
    const sourceName = dev.source === 'apple_health' ? 'Apple Health' : 'Health Connect';
    return (
      <Screen testID="sleep">
        {header}
        {dev.connected ? (
          <Card style={{ padding: 18, gap: 12 }}>
            <Text style={type.section}>Gaidām pirmo nakti</Text>
            <Text style={type.secondary}>{sourceName} ir savienots. Kad pulkstenis būs reģistrējis nakti, rītā šeit redzēsi savu miegu un miega logu.</Text>
          </Card>
        ) : (
          <Card style={{ padding: 18, gap: 12 }}>
            <Text style={type.section}>Miega dati vēl nav</Text>
            <Text style={type.secondary}>Savieno pulksteni ar Health Connect, un katru rītu šeit redzēsi pagājušo nakti un savu miega logu.</Text>
            <Button label="Pievienot pulksteni" size="md" onPress={() => router.push('/me/devices')} />
          </Card>
        )}
      </Screen>
    );
  }

  const stageTotal = n.deepMin + n.remMin + n.lightMin || 1;

  // Regularity plot: 1 px per minute, 150 px tall, starting 30 min before the window.
  const axisStart = s.window ? eveningMinutes(s.window.start) - 30 : Math.min(...s.nights.map((x) => eveningMinutes(x.bedtime))) - 15;
  const y = (hm: string) => Math.max(0, Math.min(136, eveningMinutes(hm) - axisStart - 7));

  return (
    <Screen refreshing={hr.refreshing} onRefresh={hr.refresh} testID="sleep">
      {header}
      <View style={styles.night}>
        <View style={styles.nightTop}>
          <View style={{ flex: 1 }}>
            <Text style={styles.nightLabel}>Pagājušā nakts</Text>
            <Text style={styles.nightDur}>{duration(n.totalMin)}</Text>
            <Text style={styles.nightTimes}>
              Gulētiešana {n.bedtime} · celšanās {n.wakeTime}
            </Text>
          </View>
          <View style={styles.score} accessible accessibilityLabel={`Miega vērtējums ${n.score} no 100`}>
            <Text style={styles.scoreValue}>{n.score}</Text>
            <Text style={styles.scoreLabel}>no 100</Text>
          </View>
        </View>
        <View style={styles.stages}>
          <View style={{ flex: n.deepMin / stageTotal, backgroundColor: colors.sleepDeep }} />
          <View style={{ flex: n.remMin / stageTotal, backgroundColor: colors.sleepRem }} />
          <View style={{ flex: n.lightMin / stageTotal, backgroundColor: colors.sleepLight }} />
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Stage color={colors.sleepDeep} label="Dziļais" min={n.deepMin} />
          <Stage color={colors.sleepRem} label="REM" min={n.remMin} />
          <Stage color={colors.sleepLight} label="Vieglais" min={n.lightMin} />
        </View>
        <Text style={styles.nightSource}>
          {n.source === 'health_connect' ? 'Dati no Health Connect' : n.source === 'apple_health' ? 'Dati no Apple Health' : 'Ievadīts manuāli'}
          {s.devices.length ? ` · ${s.devices[0]}` : ''}
        </Text>
      </View>

      {s.nights.length >= 3 && (
        <Card style={styles.card}>
          <View>
            <Text style={type.section}>Gulētiešanas regularitāte</Text>
            <Text style={styles.small}>Pēdējās {s.nights.length} naktis{s.window ? ' · iezīmētā josla ir tavs miega logs' : ''}</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ width: 44, height: 150 }}>
              {[0, 60, 120].map((off) => (
                <Text key={off} style={[styles.axis, { top: off - 6 }]}>
                  {fromEveningMinutes(axisStart + off)}
                </Text>
              ))}
            </View>
            <View style={{ flex: 1, height: 150 }} accessible accessibilityLabel={`Gulētiešanas laiki: ${s.nights.map((x) => x.bedtime).join(', ')}`}>
              {s.window && <View style={[styles.band, { top: 30 }]} />}
              {[0, 60, 120].map((off) => (
                <View key={off} style={[styles.grid, { top: off }]} />
              ))}
              <View style={[StyleSheet.absoluteFill, { flexDirection: 'row' }]}>
                {s.nights.map((x, i) => (
                  <View key={x.date} style={{ flex: 1, alignItems: 'center' }}>
                    <View style={[styles.dot, { top: y(x.bedtime), backgroundColor: i === s.nights.length - 1 ? colors.sleepDeep : colors.sleepRem }]} />
                  </View>
                ))}
              </View>
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ width: 44 }} />
            {s.nights.map((x, i) => (
              <Text key={x.date} style={[styles.day, i === s.nights.length - 1 && { color: colors.ink }]}>
                {weekdayShort(x.date)}
              </Text>
            ))}
          </View>
        </Card>
      )}

      {s.window && (
        <Card style={styles.card}>
          <View style={styles.window}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Icon name="moon" color="#C9D1EA" size={18} />
              <Text style={styles.windowLabel}>Tavs miega logs šovakar</Text>
            </View>
            <Text style={styles.windowTime} testID="sleep-window">
              {s.window.start}–{s.window.end}
            </Text>
            <Text style={styles.windowText}>Laiks, kad tev parasti vieglāk aizmigt. Aprēķināts no pēdējo {s.window.basedOnNights} nakšu ritma.</Text>
            <View style={styles.axisBar}>
              <View style={[styles.axisWindow, { left: `${eveningAxisPos(s.window.start) * 100}%`, width: '12.5%' }]} />
              {r.sleepWindow && (
                <View
                  style={[
                    styles.axisNudge,
                    { left: `${eveningAxisPos(fromEveningMinutes(eveningMinutes(s.window.start) - r.sleepLeadMin)) * 100}%` },
                  ]}
                />
              )}
            </View>
            <View style={styles.axisLabels}>
              {['21:00', '22:00', '23:00', '00:00', '01:00'].map((t) => (
                <Text key={t} style={styles.axisLabel}>
                  {t}
                </Text>
              ))}
            </View>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Text style={type.section}>Brīdināt pirms miega loga</Text>
              <Text style={styles.small}>Maigs signāls, lai sāktu nomierināties</Text>
            </View>
            <Toggle
              value={r.sleepWindow}
              onChange={(v) => reminders.mutate({ sleepWindow: v })}
              label="Brīdināt pirms miega loga"
              onColor={colors.sleepDeep}
              testID="sleep-toggle"
            />
          </View>
          {r.sleepWindow && (
            <>
              <Segmented
                options={LEADS.map((m) => ({ value: m, label: `${m} min pirms` }))}
                value={r.sleepLeadMin}
                onChange={(m) => reminders.mutate({ sleepLeadMin: m })}
              />
              <View>
                {windDownSteps(s.window.start, s.window.end, r.sleepLeadMin).map((st, i, all) => (
                  <View key={st.title} style={styles.step}>
                    <Text style={styles.stepTime}>{st.time}</Text>
                    <View style={{ width: 20, alignItems: 'center' }}>
                      <View
                        style={[
                          styles.stepDot,
                          { backgroundColor: st.kind === 'nudge' ? colors.accent : st.kind === 'window' ? colors.sleepWindow : colors.sleepRem },
                        ]}
                      />
                      <View style={{ flex: 1, width: 2, backgroundColor: i === all.length - 1 ? 'transparent' : colors.inputBorder }} />
                    </View>
                    <View style={{ flex: 1, paddingBottom: 14, gap: 1 }}>
                      <Text style={styles.stepTitle}>{st.title}</Text>
                      <Text style={styles.small}>{st.text}</Text>
                    </View>
                  </View>
                ))}
              </View>
            </>
          )}
          {s.source && <SourceNote source={s.source} devices={s.devices.slice(0, 1)} />}
        </Card>
      )}
    </Screen>
  );
}

function Stage({ color, label, min }: { color: string; label: string; min: number }) {
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: color }} />
        <Text style={styles.stageLabel}>{label}</Text>
      </View>
      <Text style={styles.stageValue}>{duration(min)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: 18, gap: 14 },
  small: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: colors.text2 },
  night: { backgroundColor: colors.sleepSoft, borderRadius: radius.card, padding: 18, gap: 14 },
  nightTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  nightLabel: { fontFamily: fonts.body, fontSize: 14, color: '#414B6E' },
  nightDur: { fontFamily: fonts.heading, fontSize: 38, lineHeight: 44, color: '#1F2A4D' },
  nightTimes: { fontFamily: fonts.body, fontSize: 15, color: '#414B6E' },
  score: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  scoreValue: { fontFamily: fonts.heading, fontSize: 24, lineHeight: 26, color: colors.sleepDeep },
  scoreLabel: { fontFamily: fonts.bodyBold, fontSize: 10, color: colors.sleepDeep },
  stages: { flexDirection: 'row', height: 18, borderRadius: 9, overflow: 'hidden', gap: 3 },
  stageLabel: { fontFamily: fonts.body, fontSize: 13, color: '#414B6E' },
  stageValue: { fontFamily: fonts.bodyBold, fontSize: 16, color: '#1F2A4D' },
  nightSource: { fontFamily: fonts.body, fontSize: 12, color: '#414B6E' },
  axis: { position: 'absolute', fontFamily: fonts.bodySemi, fontSize: 11, color: colors.caption },
  band: { position: 'absolute', left: 0, right: 0, height: 30, borderRadius: 8, backgroundColor: colors.sleepSoft },
  grid: { position: 'absolute', left: 0, right: 0, borderTopWidth: 1, borderTopColor: '#F0EAE1' },
  dot: { position: 'absolute', width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: colors.white },
  day: { flex: 1, textAlign: 'center', fontFamily: fonts.bodySemi, fontSize: 12, color: colors.text2 },
  window: { borderRadius: 18, backgroundColor: colors.sleepWindow, padding: 16, gap: 6 },
  windowLabel: { fontFamily: fonts.bodySemi, fontSize: 13, color: '#C9D1EA' },
  windowTime: { fontFamily: fonts.heading, fontSize: 34, lineHeight: 38, color: colors.white },
  windowText: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: '#C9D1EA' },
  axisBar: { height: 10, borderRadius: 5, backgroundColor: '#3A4670', marginTop: 8 },
  axisWindow: { position: 'absolute', top: 0, bottom: 0, borderRadius: 5, backgroundColor: '#F5B48F' },
  axisNudge: { position: 'absolute', top: 0, bottom: 0, width: 3, borderRadius: 2, backgroundColor: colors.white },
  axisLabels: { flexDirection: 'row', justifyContent: 'space-between' },
  axisLabel: { fontFamily: fonts.bodySemi, fontSize: 11, color: '#C9D1EA' },
  step: { flexDirection: 'row', gap: 8, alignItems: 'stretch' },
  stepTime: { width: 48, fontFamily: fonts.heading, fontSize: 15, color: colors.ink, paddingTop: 1 },
  stepDot: { width: 12, height: 12, borderRadius: 6, marginTop: 4 },
  stepTitle: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.ink },
});
