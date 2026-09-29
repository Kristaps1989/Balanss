import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { api, type Meal, type MealType } from '@/api';
import { invalidateDay, keys, useDay } from '@/api/hooks';
import { Button } from '@/components/Button';
import { confirm } from '@/components/Confirm';
import { Segmented } from '@/components/Controls';
import { Sheet } from '@/components/Sheet';
import { formatNumber, grams, timeOf } from '@/lib/format';
import { MEAL_LABEL, MEAL_ORDER, itemsTotals } from '@shared/nutrition';
import { colors, fonts, type } from '@/theme';

/** All meals logged in one slot (e.g. Vakariņas) of a day: move, save as favourite, delete. */
export default function MealSheet() {
  const { id, date } = useLocalSearchParams<{ id: string; date: string }>();
  const day = useDay(date);
  const first = day.data?.meals.find((m) => m.id === id);
  const meals = first ? day.data!.meals.filter((m) => m.type === first.type) : [];

  if (!first) {
    return (
      <Sheet title="Maltīte">
        <Text style={type.secondary}>{day.isPending ? 'Ielādē…' : 'Maltīte nav atrasta.'}</Text>
      </Sheet>
    );
  }

  const total = itemsTotals(meals.flatMap((m) => m.items)).kcal;
  return (
    <Sheet title={`${MEAL_LABEL[first.type]} · ${formatNumber(total)} kcal`} scroll>
      {meals.map((m, i) => (
        <MealBlock key={m.id} meal={m} date={date} showDivider={i > 0} alone={meals.length === 1} />
      ))}
    </Sheet>
  );
}

function MealBlock({ meal, date, showDivider, alone }: { meal: Meal; date: string; showDivider: boolean; alone: boolean }) {
  const qc = useQueryClient();
  const refresh = () => invalidateDay(qc, date);
  const setType = useMutation({ mutationFn: (t: MealType) => api.updateMeal(meal.id, { type: t }), onSuccess: refresh });
  const remove = useMutation({
    mutationFn: () => api.deleteMeal(meal.id),
    onSuccess: () => {
      refresh();
      if (alone) router.back();
    },
  });
  const fav = useMutation({
    mutationFn: () =>
      api.createFavourite({
        name: meal.items.map((i) => i.name).join(', '),
        items: meal.items.map((i) => ({ name: i.name, grams: i.grams, per100g: i.per100g, portionLabel: i.portionLabel })),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.favourites }),
  });

  return (
    <View style={[{ gap: 12 }, showDivider && styles.divider]} testID="meal-block">
      <Text style={styles.time}>
        {timeOf(meal.eatenAt)} · {formatNumber(meal.totals.kcal)} kcal
      </Text>
      <Segmented options={MEAL_ORDER.map((t) => ({ value: t, label: MEAL_LABEL[t] }))} value={meal.type} onChange={(t) => setType.mutate(t)} />
      <View style={{ gap: 10 }}>
        {meal.items.map((i) => (
          <View key={i.id} style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={type.bodySemi}>{i.name}</Text>
              <Text style={type.caption}>
                {i.portionLabel ? `${i.portionLabel} · ` : ''}
                {grams(i.grams)} g · {grams(Math.round(i.totals.proteinG))} g olb.
              </Text>
            </View>
            <Text style={styles.kcal}>{formatNumber(i.totals.kcal)} kcal</Text>
          </View>
        ))}
      </View>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Button
          label={fav.isSuccess ? 'Saglabāts' : 'Iecienītajos'}
          accessibilityLabel="Saglabāt kā iecienīto"
          icon={fav.isSuccess ? 'check' : 'star'}
          variant="light"
          size="sm"
          disabled={fav.isSuccess}
          loading={fav.isPending}
          onPress={() => fav.mutate()}
          style={{ flex: 1 }}
        />
        <Button
          label="Dzēst"
          accessibilityLabel="Dzēst maltīti"
          icon="trash"
          variant="danger"
          size="sm"
          loading={remove.isPending}
          style={{ flex: 1 }}
          onPress={async () => {
            if (await confirm({ title: 'Dzēst maltīti?', message: 'To nevarēs atsaukt.', confirmLabel: 'Dzēst', destructive: true })) remove.mutate();
          }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  divider: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 16 },
  time: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.ink },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 4 },
  kcal: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.ink },
});
