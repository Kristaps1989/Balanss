import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { ApiError } from '@/api';
import { useMe, useWeeklySummary } from '@/api/hooks';
import { AiLabel } from '@/components/AiLabel';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { BackButton } from '@/components/Header';
import { Icon } from '@/components/Icon';
import { Screen } from '@/components/Screen';
import { ErrorState, Loading } from '@/components/States';
import { duration, formatNumber } from '@/lib/format';
import { useToday } from '@/lib/today';
import { colors, fonts, radius, type } from '@/theme';

/** Nedēļas AI kopsavilkums (Pro): patterns from the last weeks, phrased in the user's tone. */
export default function Summary() {
  const date = useToday();
  const me = useMe();
  const pro = me.data?.plan === 'pro';
  const s = useWeeklySummary(date, pro);
  const header = (
    <View style={{ marginLeft: -10 }}>
      <BackButton />
    </View>
  );
  if (me.data && !pro) {
    return (
      <Screen>
        {header}
        <Text style={styles.h1}>Nedēļas kopsavilkums</Text>
        <Text style={type.secondary}>Pieejams ar Balanss Pro.</Text>
        <Button label="Uzzināt par Pro" onPress={() => router.replace('/me/pro')} />
      </Screen>
    );
  }
  if (s.isPending) return <Screen>{header}<Loading label="Analizēju nedēļu…" /></Screen>;
  if (s.isError) {
    return s.error instanceof ApiError && s.error.status === 402 ? (
      <Screen>
        {header}
        <Button label="Uzzināt par Pro" onPress={() => router.replace('/me/pro')} />
      </Screen>
    ) : (
      <ErrorState onRetry={() => s.refetch()} />
    );
  }
  const d = s.data;
  const [sd, sm] = [d.periodStart.slice(8, 10), d.periodStart.slice(5, 7)];
  const [ed, em] = [d.periodEnd.slice(8, 10), d.periodEnd.slice(5, 7)];
  return (
    <Screen testID="summary">
      {header}
      <View style={{ gap: 6 }}>
        <Text style={styles.over}>
          Nedēļa · {Number(sd)}.{sm}.–{Number(ed)}.{em}.
        </Text>
        <Text style={styles.h1} accessibilityRole="header">
          {d.headline}
        </Text>
      </View>

      <View style={styles.stats}>
        <Stat label="Vidēji kcal" value={formatNumber(d.stats.avgKcal)} />
        <Stat label="Olbaltumv." value={`${formatNumber(d.stats.avgProteinG)} g`} />
        {d.stats.avgSteps !== null && <Stat label="Soļi" value={formatNumber(d.stats.avgSteps)} />}
        {d.stats.avgSleepMin !== null && <Stat label="Miegs" value={duration(d.stats.avgSleepMin)} />}
      </View>

      {d.observations.map((o) => (
        <Card key={o.title} style={styles.card}>
          <Text style={type.section}>{o.title}</Text>
          <Text style={styles.body}>{o.text}</Text>
        </Card>
      ))}

      <View style={styles.suggestion}>
        <View style={styles.row}>
          <Icon name="bulb" color={colors.accentDeep} size={18} />
          <Text style={styles.sugTitle}>Viens mazs solis nākamnedēļ</Text>
        </View>
        <Text style={styles.body}>{d.suggestion}</Text>
      </View>

      <Card style={styles.card}>
        <View style={styles.row}>
          <Icon name="chat" color={colors.accentDeep} size={18} />
          <Text style={styles.sugTitle}>Pārdomām</Text>
        </View>
        <Text style={styles.body}>{d.reflection}</Text>
      </Card>

      {d.findings.length > 0 && (
        <Card style={styles.card}>
          <Text style={type.section}>Ko pamanīju datos</Text>
          {d.findings.map((f) => (
            <View key={f.kind + f.fact} style={styles.finding}>
              <Icon name={f.polarity === 'positive' ? 'check' : 'target'} color={f.polarity === 'positive' ? colors.moveDeep : colors.accentText} size={18} />
              <Text style={[styles.body, { flex: 1, fontSize: 14 }]}>{f.fact}</Text>
            </View>
          ))}
        </Card>
      )}

      <AiLabel ai={d.aiGenerated} />
      <Text style={type.caption}>Balstīts uz {d.stats.daysLogged} dienām ar ierakstiem. Analīze apraksta paradumus, nevis veselības stāvokli.</Text>
    </Screen>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={type.caption}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  over: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.accentText },
  h1: { fontFamily: fonts.heading, fontSize: 28, lineHeight: 32, color: colors.ink },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  stat: { flexGrow: 1, minWidth: '22%', backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 16, padding: 12, gap: 2 },
  statValue: { fontFamily: fonts.heading, fontSize: 18, color: colors.ink },
  card: { padding: 18, gap: 8 },
  body: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, color: colors.ink },
  suggestion: { backgroundColor: colors.accentSoft, borderRadius: radius.card, padding: 18, gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sugTitle: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.accentDeep },
  finding: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', paddingTop: 4 },
});
