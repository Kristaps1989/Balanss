import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { api, type MealType } from '@/api';
import { invalidateDay, keys, useDay } from '@/api/hooks';
import { Button } from '@/components/Button';
import { confirm } from '@/components/Confirm';
import { Segmented } from '@/components/Controls';
import { Sheet } from '@/components/Sheet';
import { formatNumber, grams, timeOf } from '@/lib/format';
import { MEAL_LABEL, MEAL_ORDER } from '@shared/nutrition';
import { colors, fonts, type } from '@/theme';

/** Meal details: change the slot, save as favourite, delete. */
export default function MealSheet() {
  const { id, date } = useLocalSearchParams<{ id: string; date: string }>();
  const qc = useQueryClient();
  const day = useDay(date);
  const meal = day.data?.meals.find((m) => m.id === id);
  const refresh = () => invalidateDay(qc, date);

  const setType = useMutation({ mutationFn: (t: MealType) => api.updateMeal(id, { type: t }), onSuccess: refresh });
  const remove = useMutation({
    mutationFn: () => api.deleteMeal(id),
    onSuccess: () => {
      refresh();
      router.back();
    },
  });
  const fav = useMutation({
    mutationFn: () =>
      api.createFavourite({
        name: meal!.items.map((i) => i.name).join(', '),
        items: meal!.items.map((i) => ({ name: i.name, grams: i.grams, per100g: i.per100g, portionLabel: i.portionLabel })),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.favourites }),
  });

  if (!meal) return <Sheet title="Maltīte"><Text style={type.secondary}>Maltīte nav atrasta.</Text></Sheet>;

  return (
    <Sheet title={`${MEAL_LABEL[meal.type]} · ${timeOf(meal.eatenAt)}`} scroll>
      <Segmented
        options={MEAL_ORDER.map((t) => ({ value: t, label: MEAL_LABEL[t] }))}
        value={meal.type}
        onChange={(t) => setType.mutate(t)}
      />
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
      <View style={styles.total}>
        <Text style={type.bodySemi}>Kopā</Text>
        <Text style={styles.kcal}>{formatNumber(meal.totals.kcal)} kcal</Text>
      </View>
      <Button
        label={fav.isSuccess ? 'Saglabāts iecienītajos' : 'Saglabāt kā iecienīto'}
        icon={fav.isSuccess ? 'check' : 'star'}
        variant="light"
        size="md"
        disabled={fav.isSuccess}
        loading={fav.isPending}
        onPress={() => fav.mutate()}
      />
      <Button
        label="Dzēst maltīti"
        icon="trash"
        variant="danger"
        size="md"
        loading={remove.isPending}
        onPress={async () => {
          if (await confirm({ title: 'Dzēst maltīti?', message: 'To nevarēs atsaukt.', confirmLabel: 'Dzēst', destructive: true })) remove.mutate();
        }}
      />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 4 },
  kcal: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.ink },
  total: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 12 },
});
