import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { api, type MealType } from '@/api';
import { invalidateDay } from '@/api/hooks';
import { Button } from '@/components/Button';
import { RoundButton, Segmented } from '@/components/Controls';
import { IconButton } from '@/components/Header';
import { Icon } from '@/components/Icon';
import { Slider } from '@/components/Slider';
import { formatNumber, grams as fmtGrams, plural } from '@/lib/format';
import { useMealDraft, type DraftItem } from '@/lib/mealDraft';
import { portionMax } from '@/lib/portion';
import { useToday } from '@/lib/today';
import { MEAL_LABEL, MEAL_ORDER, itemsTotals, scale } from '@shared/nutrition';
import { colors, fonts, radius, type } from '@/theme';

/** Foto · rezultāts (prototype: Food-Result.dc.html). */
export default function Result() {
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const date = useToday();
  const draft = useMealDraft();
  const [pickType, setPickType] = useState(false);
  const items = draft.items;
  const totals = itemsTotals(items);

  const save = useMutation({
    mutationFn: () =>
      api.createMeal({
        date,
        type: draft.type,
        eatenAt: draft.takenAt ?? new Date().toISOString(),
        source: draft.source,
        photoUrl: draft.photoUrl,
        items: items.filter((i) => i.grams > 0).map((i) => ({ name: i.name, grams: i.grams, per100g: i.per100g, portionLabel: i.portionLabel ?? null })),
      }),
    onSuccess: () => {
      invalidateDay(qc, date);
      draft.reset();
      router.dismissTo('/nutrition');
    },
  });

  const n = items.length;
  const title =
    draft.source === 'photo'
      ? n
        ? `Atpazinu ${n} ${plural(n, 'produktu', 'produktus')}`
        : 'Neatpazinu ēdienu'
      : 'Pārbaudi un saglabā';

  return (
    <View style={styles.root} testID="result">
      <ScrollView contentContainerStyle={{ paddingBottom: 24 }} showsVerticalScrollIndicator={false}>
        <View style={[styles.photo, { height: draft.photo ? 200 : insets.top + 64 }]}>
          {draft.photo && <Image source={{ uri: draft.photo.uri }} style={StyleSheet.absoluteFill} resizeMode="cover" />}
          <View style={{ position: 'absolute', left: 16, top: insets.top + 12 }}>
            <IconButton
              icon="back"
              label="Atpakaļ uz kameru"
              color={colors.white}
              bg="rgba(0,0,0,0.45)"
              size={20}
              onPress={() => router.replace('/nutrition/camera')}
            />
          </View>
        </View>
        <View style={styles.body}>
          <View style={styles.titleRow}>
            <Text style={styles.title} accessibilityRole="header">
              {title}
            </Text>
            <Pressable
              onPress={() => setPickType((v) => !v)}
              accessibilityRole="button"
              accessibilityLabel={`Maltīte: ${MEAL_LABEL[draft.type]}. Mainīt`}
              style={styles.typeBtn}>
              <Text style={styles.typeText}>{MEAL_LABEL[draft.type]}</Text>
              <Icon name="chevron" color={colors.ink} size={16} />
            </Pressable>
          </View>
          {pickType && (
            <Segmented<MealType>
              options={MEAL_ORDER.map((t) => ({ value: t, label: MEAL_LABEL[t] }))}
              value={draft.type}
              onChange={(t) => {
                draft.setType(t);
                setPickType(false);
              }}
            />
          )}
          {n === 0 && draft.source === 'photo' && (
            <Text style={type.secondary}>Fotoattēlā neredzēju ēdienu. Pamēģini vēlreiz vai pievieno produktus ar tekstu.</Text>
          )}
          {items.map((it) => (
            <ItemCard key={it.key} item={it} />
          ))}
          <Pressable onPress={() => router.push('/food-add?mode=append')} accessibilityRole="button" style={styles.addMissing}>
            <Icon name="plus" color={colors.text2} size={18} />
            <Text style={styles.addMissingText}>Pievienot, ko nepamanīju</Text>
          </Pressable>
        </View>
      </ScrollView>
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) + 24 }]}>
        <View style={styles.totals}>
          <Text style={styles.totalsText}>
            <Text style={styles.totalKcal} testID="result-total">
              {formatNumber(totals.kcal)} kcal
            </Text>{' '}
            kopā
          </Text>
          <Text style={styles.totalsText}>
            olb. {Math.round(totals.proteinG)} g · ogļh. {Math.round(totals.carbsG)} g · tauki {Math.round(totals.fatG)} g
          </Text>
        </View>
        {save.isError && <Text style={styles.error}>Neizdevās saglabāt. Mēģini vēlreiz.</Text>}
        <Button label="Saglabāt" variant="accent" onPress={() => save.mutate()} loading={save.isPending} disabled={!items.some((i) => i.grams > 0)} testID="save-meal" />
      </View>
    </View>
  );
}

function ItemCard({ item }: { item: DraftItem }) {
  const update = useMealDraft((s) => s.updateItem);
  const remove = useMealDraft((s) => s.removeItem);
  const t = scale(item.per100g, item.grams);
  const unsure = item.confidence < 0.6 && item.alternatives.length > 0 && !item.picked;
  // Range fixed from the first estimate: recomputing it from the current grams made each drag
  // raise the maximum, which raised the value again (180 g → millions). Alternatives may set more.
  const [baseMax] = useState(() => portionMax(item.grams));
  const max = Math.max(baseMax, item.grams);
  const nudge = (d: number) => update(item.key, { grams: Math.max(0, Math.min(max, item.grams + d)), portionLabel: null });
  return (
    <View style={styles.item}>
      <View style={styles.itemHead}>
        <Text style={styles.itemName}>{item.name}</Text>
        <Text style={styles.itemKcal}>{formatNumber(t.kcal)} kcal</Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={styles.itemMeta}>
          {item.portionLabel ? `${item.portionLabel} · ` : ''}
          {fmtGrams(item.grams)} g · {Math.round(t.proteinG)} g olb.{unsure ? ' · aptuveni' : ''}
        </Text>
        <Pressable onPress={() => remove(item.key)} accessibilityRole="button" accessibilityLabel={`Noņemt: ${item.name}`} hitSlop={8} style={styles.remove}>
          <Icon name="close" color={colors.caption} size={16} />
        </Pressable>
      </View>
      <View style={styles.sliderRow}>
        <RoundButton icon="minus" label={`Mazāk: ${item.name}, −10 g`} onPress={() => nudge(-10)} />
        <View style={{ flex: 1 }}>
          <Slider
            label={`Porcija: ${item.name}`}
            value={item.grams}
            min={0}
            max={max}
            step={5}
            onChange={(g) => update(item.key, { grams: g, portionLabel: null })}
            testID="portion-slider"
          />
        </View>
        <RoundButton icon="plus" label={`Vairāk: ${item.name}, +10 g`} onPress={() => nudge(10)} />
      </View>
      {unsure && (
        <View style={styles.unsure}>
          <Text style={styles.unsureTitle}>{item.name} atpazinu neskaidri — precizē?</Text>
          <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
            {item.alternatives.map((a) => (
              <Pressable
                key={a.label}
                onPress={() =>
                  update(item.key, {
                    picked: a.label,
                    name: a.grams === 0 ? item.name : a.label,
                    grams: a.grams,
                    per100g: a.per100g,
                    confidence: 1,
                  })
                }
                accessibilityRole="button"
                style={styles.altChip}>
                <Text style={styles.altText}>{a.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  sliderRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  root: { flex: 1, backgroundColor: colors.bg },
  photo: { backgroundColor: '#5B4E43', overflow: 'hidden' },
  body: { paddingTop: 18, paddingHorizontal: 20, gap: 12 },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  title: { fontFamily: fonts.heading, fontSize: 24, lineHeight: 30, color: colors.ink, flexShrink: 1 },
  typeBtn: {
    height: 36,
    minHeight: 36,
    paddingHorizontal: 12,
    borderRadius: 18,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  typeText: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.ink },
  item: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radius.option, paddingTop: 14, paddingHorizontal: 16, paddingBottom: 6, gap: 2 },
  itemHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 },
  itemName: { fontFamily: fonts.bodyBold, fontSize: 16, color: colors.ink, flexShrink: 1 },
  itemKcal: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.ink },
  itemMeta: { fontFamily: fonts.body, fontSize: 13, color: colors.text2 },
  remove: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  unsure: { marginTop: 4, marginBottom: 8, borderRadius: 14, backgroundColor: colors.accentSoft, paddingVertical: 10, paddingHorizontal: 12, gap: 8 },
  unsureTitle: { fontFamily: fonts.bodySemi, fontSize: 14, color: '#6E3A1F' },
  altChip: { height: 36, paddingHorizontal: 12, borderRadius: 18, backgroundColor: colors.white, justifyContent: 'center' },
  altText: { fontFamily: fonts.bodySemi, fontSize: 13, color: colors.ink },
  addMissing: {
    height: 48,
    borderRadius: 16,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: '#D8CFC2',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  addMissingText: { fontFamily: fonts.bodySemi, fontSize: 15, color: colors.text2 },
  footer: { backgroundColor: colors.white, borderTopWidth: 1, borderTopColor: colors.navBorder, paddingTop: 12, paddingHorizontal: 20, gap: 10 },
  totals: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 4 },
  totalsText: { fontFamily: fonts.body, fontSize: 14, color: colors.text2 },
  totalKcal: { fontFamily: fonts.heading, fontSize: 18, color: colors.ink },
  error: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.accentDeep },
});
