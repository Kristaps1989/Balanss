import { Pressable, StyleSheet, Text, View } from 'react-native';

import { api, type AvoidFood, type Diet } from '@/api';
import { useMe, useMeMutation } from '@/api/hooks';
import { OptionCard } from '@/components/Controls';
import { BackButton } from '@/components/Header';
import { Icon } from '@/components/Icon';
import { Screen } from '@/components/Screen';
import { Loading } from '@/components/States';
import { colors, fonts, type } from '@/theme';

const DIETS: { value: Diet; label: string; hint: string }[] = [
  { value: 'any', label: 'Ēdu visu', hint: 'Bez ierobežojumiem' },
  { value: 'vegetarian', label: 'Veģetārs', hint: 'Bez gaļas un zivīm' },
  { value: 'pescatarian', label: 'Peskatārs', hint: 'Bez gaļas, zivis der' },
  { value: 'vegan', label: 'Vegāns', hint: 'Bez dzīvnieku produktiem' },
];

const AVOID: { value: AvoidFood; label: string }[] = [
  { value: 'lactose', label: 'Laktoze' },
  { value: 'gluten', label: 'Glutēns' },
  { value: 'nuts', label: 'Rieksti' },
  { value: 'fish', label: 'Zivis' },
  { value: 'eggs', label: 'Olas' },
  { value: 'pork', label: 'Cūkgaļa' },
];

/** Ēšanas paradumi: used by recipes and meal ideas. */
export default function Preferences() {
  const me = useMe();
  const save = useMeMutation(api.updatePreferences);
  if (!me.data) return <Loading />;
  const p = me.data.preferences;
  const toggle = (a: AvoidFood) => save.mutate({ avoid: p.avoid.includes(a) ? p.avoid.filter((x) => x !== a) : [...p.avoid, a] });
  return (
    <Screen testID="preferences">
      <View style={{ marginLeft: -10 }}>
        <BackButton />
      </View>
      <View style={{ gap: 6 }}>
        <Text style={styles.h1} accessibilityRole="header">
          Ēšanas paradumi
        </Text>
        <Text style={type.secondary}>Receptes un idejas ņems to vērā. Tas nav medicīnisks uztura plāns.</Text>
      </View>
      <Text style={styles.label}>Kā tu ēd?</Text>
      <View style={styles.grid}>
        {DIETS.map((d) => (
          <OptionCard key={d.value} selected={p.diet === d.value} onPress={() => save.mutate({ diet: d.value })} style={styles.opt} accessibilityLabel={`${d.label}. ${d.hint}`}>
            <Text style={styles.optLabel}>{d.label}</Text>
            <Text style={type.caption}>{d.hint}</Text>
          </OptionCard>
        ))}
      </View>
      <Text style={styles.label}>Izvairos no</Text>
      <View style={styles.chips}>
        {AVOID.map((a) => {
          const on = p.avoid.includes(a.value);
          return (
            <Pressable
              key={a.value}
              onPress={() => toggle(a.value)}
              accessibilityRole="checkbox"
              aria-checked={on}
              style={[styles.chip, { backgroundColor: on ? colors.ink : colors.chip }]}>
              {on && <Icon name="check" color={colors.white} size={16} strokeWidth={2.6} />}
              <Text style={[styles.chipText, { color: on ? colors.white : colors.ink }]}>{a.label}</Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={type.caption}>Ja tev ir alerģija, vienmēr pārbaudi produktu sastāvu — receptes to neaizstāj.</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  h1: { fontFamily: fonts.heading, fontSize: 28, lineHeight: 32, color: colors.ink },
  label: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.ink },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  opt: { width: '47%', flexGrow: 1, gap: 2 },
  optLabel: { fontFamily: fonts.bodyBold, fontSize: 16, color: colors.ink },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { height: 44, paddingHorizontal: 16, borderRadius: 22, flexDirection: 'row', alignItems: 'center', gap: 6 },
  chipText: { fontFamily: fonts.bodySemi, fontSize: 14 },
});
