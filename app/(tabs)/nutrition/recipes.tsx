import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ApiError, api, type Recipe } from '@/api';
import { invalidateDay, useMe, useRecipes } from '@/api/hooks';
import { AiLabel } from '@/components/AiLabel';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { BackButton } from '@/components/Header';
import { Icon } from '@/components/Icon';
import { Screen } from '@/components/Screen';
import { ErrorState, Loading } from '@/components/States';
import { formatNumber } from '@/lib/format';
import { useToday } from '@/lib/today';
import { MEAL_LABEL } from '@shared/nutrition';
import { colors, fonts, type } from '@/theme';

const DIET_LABEL = { any: 'bez ierobežojumiem', vegetarian: 'veģetārs', vegan: 'vegāns', pescatarian: 'peskatārs' } as const;

/** Receptes tavam mērķim (Pro): ideas that fit what is left of today and the food preferences. */
export default function Recipes() {
  const date = useToday();
  const me = useMe();
  const pro = me.data?.plan === 'pro';
  const r = useRecipes(date, pro);
  const header = (
    <View style={{ gap: 6 }}>
      <View style={{ marginLeft: -10 }}>
        <BackButton />
      </View>
      <Text style={styles.h1} accessibilityRole="header">
        Receptes tavam mērķim
      </Text>
    </View>
  );
  if (me.data && !pro) {
    return (
      <Screen>
        {header}
        <Text style={type.secondary}>Idejas nākamajai maltītei, kas papildina to, kā šodien vēl pietrūkst. Pieejamas ar Balanss Pro.</Text>
        <Button label="Uzzināt par Pro" onPress={() => router.push('/me/pro')} />
      </Screen>
    );
  }
  if (r.isPending) return <Screen>{header}<Loading label="Meklēju idejas…" /></Screen>;
  if (r.isError) {
    if (r.error instanceof ApiError && r.error.status === 402) return <Screen>{header}<Button label="Uzzināt par Pro" onPress={() => router.push('/me/pro')} /></Screen>;
    return <ErrorState onRetry={() => r.refetch()} />;
  }
  const prefs = me.data!.preferences;
  return (
    <Screen testID="recipes">
      {header}
      <Text style={type.secondary}>
        {MEAL_LABEL[r.data.mealType]} · {DIET_LABEL[prefs.diet]}
        {prefs.avoid.length ? ` · bez ${prefs.avoid.length} produktu grupām` : ''}
      </Text>
      <Pressable onPress={() => router.push('/me/preferences')} accessibilityRole="link" style={{ minHeight: 32, justifyContent: 'center' }}>
        <Text style={type.link}>Mainīt ēšanas paradumus</Text>
      </Pressable>
      {r.data.recipes.length === 0 && <Text style={type.secondary}>Šobrīd nav piemērotu ideju. Pamēģini vēlāk.</Text>}
      {r.data.recipes.map((x) => (
        <RecipeCard key={x.id} recipe={x} date={date} />
      ))}
      <Text style={type.caption}>Ja tev ir alerģija vai nepanesamība, vienmēr pārbaudi produktu sastāvu. Uzturvērtības ir aptuvenas.</Text>
      <AiLabel ai={r.data.aiGenerated} />
    </Screen>
  );
}

function RecipeCard({ recipe, date }: { recipe: Recipe; date: string }) {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const log = useMutation({
    mutationFn: () => api.logRecipe(recipe.id, date),
    onSuccess: () => {
      invalidateDay(qc, date);
      router.dismissTo('/nutrition');
    },
  });
  const n = recipe.perServing;
  return (
    <Card style={styles.card}>
      <Pressable onPress={() => setOpen((v) => !v)} accessibilityRole="button" aria-expanded={open} style={{ gap: 6 }}>
        <View style={styles.head}>
          <Text style={[type.section, { flex: 1 }]}>{recipe.title}</Text>
          <Icon name="chevron" color={colors.caption} size={20} />
        </View>
        <Text style={styles.why}>{recipe.why}</Text>
        <Text style={type.caption}>
          {recipe.minutes} min · {formatNumber(n.kcal)} kcal · {Math.round(n.proteinG)} g olb. · {Math.round(n.fibreG)} g šķiedrv. porcijā
        </Text>
      </Pressable>
      {open && (
        <View style={{ gap: 10 }}>
          <Text style={styles.sub}>Sastāvdaļas ({recipe.servings} {recipe.servings === 1 ? 'porcija' : 'porcijas'})</Text>
          {recipe.ingredients.map((i) => (
            <View key={i.name} style={styles.ing}>
              <Text style={[styles.body, { flex: 1 }]}>{i.name}</Text>
              <Text style={styles.body}>{i.amount}</Text>
            </View>
          ))}
          <Text style={styles.sub}>Pagatavošana</Text>
          {recipe.steps.map((st, k) => (
            <Text key={k} style={styles.body}>
              {k + 1}. {st}
            </Text>
          ))}
          <Button label="Pievienot kā maltīti" size="md" icon="plus" onPress={() => log.mutate()} loading={log.isPending} />
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  h1: { fontFamily: fonts.heading, fontSize: 28, lineHeight: 32, color: colors.ink },
  card: { padding: 18, gap: 12 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  why: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.moveDeep },
  sub: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.ink, marginTop: 4 },
  ing: { flexDirection: 'row', gap: 8, borderBottomWidth: 1, borderBottomColor: '#F0EAE1', paddingVertical: 6 },
  body: { fontFamily: fonts.body, fontSize: 15, lineHeight: 21, color: colors.ink },
});
