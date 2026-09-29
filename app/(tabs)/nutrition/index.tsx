import { router } from 'expo-router';
import { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import type { Meal, MealType } from '@/api';
import { useDay, useMe } from '@/api/hooks';
import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { IconButton } from '@/components/Header';
import { Icon } from '@/components/Icon';
import { ProgressBar } from '@/components/ProgressBar';
import { Screen } from '@/components/Screen';
import { ErrorState, Loading } from '@/components/States';
import { dayLabel, formatNumber, grams, plural, timeOf } from '@/lib/format';
import { useToday } from '@/lib/today';
import { addDays } from '@shared/dates';
import { MEAL_LABEL, MEAL_ORDER, itemsTotals } from '@shared/nutrition';
import { colors, fonts, radius, type } from '@/theme';

/** "Kafija ar pienu" → "kafija ar pienu" when it follows another item (keeps acronyms). */
const lowerFirst = (s: string) => (/^[A-ZĀČĒĢĪĶĻŅŠŪŽ][a-zāčēģīķļņšūž]/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s);

const TILE: Record<MealType, { bg: string; ink: string }> = {
  breakfast: { bg: '#F6E7CF', ink: '#8A6420' },
  lunch: { bg: '#E6EFE9', ink: '#3F6E57' },
  snack: { bg: '#EEE6F0', ink: '#6E4E68' },
  dinner: { bg: '#EEF0F8', ink: '#3A4B7E' },
};

/** Uzturs · dienas žurnāls (prototype: Food-Log.dc.html). */
export default function FoodLog() {
  const today = useToday();
  const [date, setDate] = useState(today);
  const me = useMe();
  const day = useDay(date);
  const isToday = date === today;

  const header = (
    <View style={styles.header}>
      <Text style={type.h1} accessibilityRole="header">
        Uzturs
      </Text>
      <View style={styles.dayNav}>
        <IconButton icon="chevronLeft" label="Iepriekšējā diena" size={20} onPress={() => setDate(addDays(date, -1))} />
        <Text style={styles.dayLabel} testID="day-label">
          {dayLabel(date, today)}
        </Text>
        <IconButton
          icon="chevron"
          label="Nākamā diena"
          size={20}
          color={isToday ? colors.boxBorder : colors.ink}
          disabled={isToday}
          onPress={() => setDate(addDays(date, 1))}
        />
        <Avatar name={me.data?.profile.firstName || '?'} onPress={() => router.push('/me')} />
      </View>
    </View>
  );

  if (day.isPending) return <Screen>{header}<Loading /></Screen>;
  if (day.isError) return <ErrorState onRetry={() => day.refetch()} />;

  const { nutrition, meals } = day.data;
  const byType = new Map<MealType, Meal[]>();
  meals.forEach((m) => byType.set(m.type, [...(byType.get(m.type) ?? []), m]));
  const macros = [
    { label: 'Olbaltumv.', p: nutrition.proteinG, color: colors.protein, track: colors.proteinTrack },
    { label: 'Ogļhidr.', p: nutrition.carbsG, color: colors.carbs, track: colors.carbsTrack },
    { label: 'Tauki', p: nutrition.fatG, color: colors.fat, track: colors.fatTrack },
    { label: 'Šķiedrv.', p: nutrition.fibreG, color: colors.fibre, track: colors.fibreTrack },
  ];

  return (
    <Screen refreshing={day.isRefetching} onRefresh={() => day.refetch()} testID="food-log">
      {header}
      <Card style={styles.summary}>
        <View style={styles.summaryTop}>
          <Text testID="log-kcal">
            <Text style={styles.kcal}>{formatNumber(nutrition.kcal.value)}</Text>
            <Text style={styles.kcalTarget}> / {formatNumber(nutrition.kcal.target)} kcal</Text>
          </Text>
          <Pressable onPress={() => router.push('/nutrition/trends')} accessibilityRole="link" hitSlop={8} style={{ paddingVertical: 10, paddingLeft: 12 }}>
            <Text style={type.link}>Tendences</Text>
          </Pressable>
        </View>
        <ProgressBar progress={nutrition.kcal.value / nutrition.kcal.target} color={colors.accent} trackColor={colors.kcalTrack} height={10} />
        <View style={styles.macros}>
          {macros.map((m) => (
            <View key={m.label} style={{ flex: 1, gap: 5 }}>
              <Text style={styles.macroLabel}>{m.label}</Text>
              <ProgressBar progress={m.p.value / m.p.target} color={m.color} trackColor={m.track} height={5} />
              <Text style={styles.macroValue}>
                {grams(Math.round(m.p.value))}/{m.p.target} g
              </Text>
            </View>
          ))}
        </View>
      </Card>

      {isToday && (
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Button label="Foto" icon="camera" onPress={() => router.push('/nutrition/camera')} style={{ flex: 1 }} size="md" />
          <Button label="Citādi" icon="text" variant="light" onPress={() => router.push('/food-add')} style={{ flex: 1 }} size="md" />
        </View>
      )}

      {MEAL_ORDER.map((t) => {
        const list = byType.get(t);
        if (list?.length) return <MealCard key={t} type={t} meals={list} date={date} />;
        if (t === 'snack') return null;
        return <EmptyMeal key={t} type={t} canAdd={isToday} />;
      })}

      {isToday && (
        <Card style={styles.recipes} onPress={() => router.push('/nutrition/recipes')} accessibilityLabel="Receptes tavam mērķim">
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={type.section}>Receptes tavam mērķim</Text>
            <Text style={type.secondary}>Idejas nākamajai maltītei pēc tā, kā šodien vēl pietrūkst</Text>
          </View>
          {me.data?.plan === 'pro' ? <Icon name="chevron" color={colors.caption} size={20} /> : <Text style={styles.pro}>PRO</Text>}
        </Card>
      )}
    </Screen>
  );
}

function MealCard({ type: t, meals, date }: { type: MealType; meals: Meal[]; date: string }) {
  const items = meals.flatMap((m) => m.items);
  const totals = itemsTotals(items);
  const photo = meals.find((m) => m.photoUrl)?.photoUrl;
  const first = meals[0];
  const meta = [
    timeOf(first.eatenAt),
    `${Math.round(totals.proteinG)} g olbaltumvielu`,
    meals.some((m) => m.source === 'photo') ? 'no foto' : items.length > 2 ? `${items.length} ${plural(items.length, 'ieraksts', 'ieraksti')}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <Card
      style={styles.meal}
      onPress={() => router.push({ pathname: '/meal/[id]', params: { id: first.id, date } })}
      accessibilityLabel={`${MEAL_LABEL[t]}, ${totals.kcal} kcal`}>
      <View style={styles.mealHead}>
        <Text style={type.section}>{MEAL_LABEL[t]}</Text>
        <Text style={styles.mealKcal}>{formatNumber(totals.kcal)} kcal</Text>
      </View>
      <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
        {photo && !photo.startsWith('data:') ? (
          <Image source={{ uri: photo }} style={styles.tile} accessibilityLabel="Maltītes foto" />
        ) : (
          <View style={[styles.tile, { backgroundColor: TILE[t].bg }]}>
            <Icon name="nutrition" color={TILE[t].ink} size={28} />
          </View>
        )}
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={styles.items} numberOfLines={2}>
            {items.map((i, k) => (k === 0 ? i.name : lowerFirst(i.name))).join(', ')}
          </Text>
          <Text style={styles.meta}>{meta}</Text>
        </View>
      </View>
    </Card>
  );
}

function EmptyMeal({ type: t, canAdd }: { type: MealType; canAdd: boolean }) {
  return (
    <View style={styles.empty}>
      <View>
        <Text style={type.section}>{MEAL_LABEL[t]}</Text>
        <Text style={type.secondary}>{canAdd ? 'Vēl nav pievienotas' : 'Nav pievienotas'}</Text>
      </View>
      {canAdd && (
        <Pressable
          onPress={() => router.push('/nutrition/camera')}
          accessibilityRole="button"
          accessibilityLabel={`Pievienot: ${MEAL_LABEL[t]}`}
          style={styles.emptyAdd}>
          <Icon name="plus" color={colors.accentText} />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dayNav: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  dayLabel: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.ink, minWidth: 52, textAlign: 'center' },
  summary: { paddingVertical: 16, paddingHorizontal: 18, gap: 12 },
  summaryTop: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  kcal: { fontFamily: fonts.heading, fontSize: 28, color: colors.ink },
  kcalTarget: { fontFamily: fonts.body, fontSize: 15, color: colors.text2 },
  macros: { flexDirection: 'row', gap: 8 },
  macroLabel: { fontFamily: fonts.body, fontSize: 12, color: colors.text2 },
  macroValue: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.ink },
  meal: { paddingVertical: 16, paddingHorizontal: 18, gap: 12 },
  mealHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  mealKcal: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.ink },
  tile: { width: 64, height: 64, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  items: { fontFamily: fonts.bodySemi, fontSize: 15, lineHeight: 20, color: colors.ink },
  meta: { fontFamily: fonts.body, fontSize: 13, color: colors.caption },
  empty: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: '#D8CFC2',
    borderRadius: radius.card,
    paddingVertical: 16,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  recipes: { paddingVertical: 16, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', gap: 12 },
  pro: { fontFamily: fonts.bodyBold, fontSize: 11, color: colors.white, backgroundColor: colors.ink, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, overflow: 'hidden' },
  emptyAdd: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
});
