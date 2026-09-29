import { StyleSheet, Text, View } from 'react-native';

import { useNutritionStats } from '@/api/hooks';
import { Card } from '@/components/Card';
import { BarChart, weekdayShort } from '@/components/Charts';
import { BackButton } from '@/components/Header';
import { Icon } from '@/components/Icon';
import { Screen } from '@/components/Screen';
import { ErrorState, Loading } from '@/components/States';
import { formatNumber } from '@/lib/format';
import { useToday } from '@/lib/today';
import { colors, fonts, radius } from '@/theme';

/** Pēdējās 7 dienas (prototype: Food-Trends.dc.html). */
export default function Trends() {
  const date = useToday();
  const stats = useNutritionStats(date);
  const header = (
    <View style={styles.header}>
      <BackButton />
      <Text style={styles.title} accessibilityRole="header">
        Pēdējās 7 dienas
      </Text>
    </View>
  );
  if (stats.isPending) return <Screen>{header}<Loading /></Screen>;
  if (stats.isError) return <ErrorState onRetry={() => stats.refetch()} />;
  const s = stats.data;
  const labels = s.days.map((d) => weekdayShort(d.date));
  const last = s.days.length - 1;
  const kMax = Math.max(s.targetKcal * 1.15, ...s.days.map((d) => d.kcal));
  const pMax = Math.max(s.targetProteinG * 1.1, ...s.days.map((d) => d.proteinG));
  return (
    <Screen testID="trends">
      {header}
      <Card style={styles.card}>
        <View style={styles.head}>
          <Text style={styles.h2}>Enerģija</Text>
          <Text style={styles.avg}>
            vidēji <Text style={styles.avgValue}>{formatNumber(s.avgKcal)} kcal</Text>
          </Text>
        </View>
        <BarChart
          values={s.days.map((d) => d.kcal)}
          labels={labels}
          max={kMax}
          target={{ value: s.targetKcal, label: `mērķis ${formatNumber(s.targetKcal)}` }}
          color={colors.accent}
          highlight={last}
          accessibilityLabel={`Enerģija 7 dienās: ${s.days.map((d) => `${formatNumber(d.kcal)} kcal`).join(', ')}`}
        />
      </Card>
      <Card style={styles.card}>
        <View style={styles.head}>
          <Text style={styles.h2}>Olbaltumvielas</Text>
          <Text style={styles.avg}>
            vidēji <Text style={styles.avgValue}>{formatNumber(s.avgProteinG)} g</Text>
          </Text>
        </View>
        <BarChart
          values={s.days.map((d) => d.proteinG)}
          labels={labels}
          max={pMax}
          target={{ value: s.targetProteinG, label: `mērķis ${s.targetProteinG} g` }}
          color={colors.accent}
          highlight={last}
          accessibilityLabel={`Olbaltumvielas 7 dienās: ${s.days.map((d) => `${d.proteinG} g`).join(', ')}`}
        />
      </Card>
      {s.insight && (
        <View style={styles.insight}>
          <Icon name="trend" color={colors.accentDeep} />
          <Text style={styles.insightText}>{s.insight}</Text>
        </View>
      )}
      <Text style={styles.note}>Šodienas stabiņš vēl aug — diena nav beigusies.</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 44, marginLeft: -10 },
  title: { fontFamily: fonts.heading, fontSize: 24, color: colors.ink },
  card: { padding: 18, gap: 14 },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  h2: { fontFamily: fonts.bodyBold, fontSize: 17, color: colors.ink },
  avg: { fontFamily: fonts.body, fontSize: 14, color: colors.text2 },
  avgValue: { fontFamily: fonts.bodyBold, color: colors.ink },
  insight: { backgroundColor: colors.accentSoft, borderRadius: radius.card, paddingVertical: 16, paddingHorizontal: 18, flexDirection: 'row', gap: 12 },
  insightText: { flex: 1, fontFamily: fonts.body, fontSize: 15, lineHeight: 22, color: colors.tipText },
  note: { fontFamily: fonts.body, fontSize: 13, color: colors.caption, paddingHorizontal: 4 },
});
