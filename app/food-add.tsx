import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { api, type CreateMealRequest, type FoodItemDraft } from '@/api';
import { invalidateDay, useFavourites } from '@/api/hooks';
import { Button } from '@/components/Button';
import { Icon } from '@/components/Icon';
import { Sheet } from '@/components/Sheet';
import { formatNumber } from '@/lib/format';
import { useMealDraft } from '@/lib/mealDraft';
import { useToday } from '@/lib/today';
import { itemsTotals, mealTypeForTime, scale } from '@shared/nutrition';
import { colors, fonts, type } from '@/theme';

function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** Pievienot citādi (prototype: Food-Add.dc.html). `?mode=append` adds to the photo result instead of saving. */
export default function FoodAdd() {
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const append = mode === 'append';
  const date = useToday();
  const qc = useQueryClient();
  const addItems = useMealDraft((s) => s.addItems);
  const favs = useFavourites();
  const [q, setQ] = useState('');
  const text = useDebounced(q.trim(), 500);
  const parsed = useQuery({
    queryKey: ['parse', text],
    queryFn: () => api.parseText(text),
    enabled: text.length >= 2,
    staleTime: Infinity,
  });
  const items: FoodItemDraft[] = text.length >= 2 ? (parsed.data?.items ?? []) : [];
  const total = itemsTotals(items).kcal;

  const log = useMutation({
    mutationFn: (req: Pick<CreateMealRequest, 'items' | 'source'>) =>
      api.createMeal({ ...req, date, type: mealTypeForTime(new Date()), eatenAt: new Date().toISOString() }),
    onSuccess: () => {
      invalidateDay(qc, date);
      router.back();
    },
  });

  const addParsed = () => {
    if (append) {
      addItems(items);
      router.back();
      return;
    }
    log.mutate({
      source: 'text',
      items: items.map((i) => ({ name: i.name, grams: i.grams, per100g: i.per100g, portionLabel: i.portionLabel ?? null })),
    });
  };

  return (
    <Sheet title={append ? 'Pievienot produktu' : 'Pievienot citādi'} scroll>
      <View style={{ gap: 8 }}>
        <Text style={styles.label} nativeID="food-q">
          Uzraksti, ko ēdi
        </Text>
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="Piemēram: 2 olas un maize"
          placeholderTextColor={colors.muted}
          style={styles.input}
          accessibilityLabelledBy="food-q"
          accessibilityLabel="Uzraksti, ko ēdi"
          autoFocus
          returnKeyType="done"
          testID="food-text"
        />
        {text.length >= 2 && (
          <View style={styles.preview}>
            {parsed.isFetching ? (
              <View style={styles.previewRow}>
                <ActivityIndicator color={colors.accent} />
              </View>
            ) : items.length === 0 ? (
              <View style={styles.previewRow}>
                <Text style={type.secondary}>Neatpazinu — pamēģini citiem vārdiem.</Text>
              </View>
            ) : (
              items.map((i, k) => (
                <View key={k} style={[styles.previewRow, k < items.length - 1 && styles.previewBorder]}>
                  <Text style={styles.previewName}>
                    {i.name}
                    {i.portionLabel ? ` · ${i.portionLabel}` : ''}
                  </Text>
                  <Text style={styles.previewKcal}>{formatNumber(scale(i.per100g, i.grams).kcal)} kcal</Text>
                </View>
              ))
            )}
          </View>
        )}
        {items.length > 0 && (
          <Button
            label={append ? `Pievienot ${formatNumber(total)} kcal maltītei` : `Pievienot ${formatNumber(total)} kcal`}
            size="md"
            onPress={addParsed}
            loading={log.isPending}
            testID="add-parsed"
          />
        )}
        {log.isError && <Text style={styles.error}>Neizdevās saglabāt. Mēģini vēlreiz.</Text>}
      </View>

      {!append && (
        <Pressable
          onPress={() => router.replace('/nutrition/camera?mode=barcode')}
          accessibilityRole="button"
          style={({ pressed }) => [styles.barcode, pressed && { opacity: 0.85 }]}>
          <Icon name="barcode" color={colors.ink} size={28} />
          <View style={{ flex: 1 }}>
            <Text style={styles.barcodeTitle}>Skenēt svītrkodu</Text>
            <Text style={type.secondary}>Iepakotiem produktiem</Text>
          </View>
          <Icon name="chevron" color={colors.ink} size={20} />
        </Pressable>
      )}

      {!append && (
        <View style={{ gap: 4 }}>
          <Text style={[styles.label, { paddingBottom: 4 }]}>Iecienītākie</Text>
          {favs.data?.length === 0 && <Text style={type.secondary}>Saglabā maltīti kā iecienīto, un tā parādīsies šeit.</Text>}
          {favs.data?.map((f) => (
            <View key={f.id} style={styles.fav}>
              <View style={{ flex: 1 }}>
                <Text style={styles.favName}>{f.name}</Text>
                <Text style={type.secondary}>
                  {formatNumber(f.totals.kcal)} kcal · {Math.round(f.totals.proteinG)} g olb.
                </Text>
              </View>
              <Pressable
                onPress={() => log.mutate({ source: 'favourite', items: f.items })}
                accessibilityRole="button"
                accessibilityLabel={`Pievienot: ${f.name}`}
                style={styles.favAdd}>
                <Icon name="plus" color={colors.accentText} size={20} />
              </Pressable>
            </View>
          ))}
        </View>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  label: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.ink },
  input: {
    height: 52,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: colors.accent,
    backgroundColor: colors.white,
    paddingHorizontal: 14,
    fontFamily: fonts.body,
    fontSize: 16,
    color: colors.ink,
  },
  preview: { borderRadius: 16, backgroundColor: colors.bg, paddingVertical: 4, paddingHorizontal: 14 },
  previewRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 44 },
  previewBorder: { borderBottomWidth: 1, borderBottomColor: colors.navBorder },
  previewName: { fontFamily: fonts.body, fontSize: 15, color: colors.ink, flexShrink: 1 },
  previewKcal: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.ink },
  barcode: { minHeight: 64, borderRadius: 18, backgroundColor: colors.chip, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 14 },
  barcodeTitle: { fontFamily: fonts.bodyBold, fontSize: 16, color: colors.ink },
  fav: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, borderBottomWidth: 1, borderBottomColor: '#F0EAE1' },
  favName: { fontFamily: fonts.bodySemi, fontSize: 15, color: colors.ink },
  favAdd: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
  error: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.accentDeep },
});
