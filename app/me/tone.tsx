import { Pressable, StyleSheet, Text, View } from 'react-native';

import { api, type TonePreference } from '@/api';
import { useMe, useMeMutation } from '@/api/hooks';
import { BackButton } from '@/components/Header';
import { Icon } from '@/components/Icon';
import { Screen } from '@/components/Screen';
import { Loading } from '@/components/States';
import { selectTone } from '@shared/personality';
import { colors, fonts, radius, type } from '@/theme';

/** Reference copy from prototype/Tone-Compare.dc.html. */
const TONES: { value: Exclude<TonePreference, 'auto'>; title: string; chip: [string, string]; tip: string; water: string }[] = [
  {
    value: 'plan',
    title: 'Plāns un skaitļi',
    chip: [colors.sleepSoft, '#2E3B66'],
    tip: 'Šodien trūkst 42 g olbaltumvielu. Plāns: biezpiens brokastīs (+18 g), vista pusdienās (+30 g).',
    water: 'Ūdens: 1,2 no 2,3 l. Viena glāze tagad — un līdz 16:00 būsi pie 1,7 l.',
  },
  {
    value: 'novelty',
    title: 'Dažādība un jaunais',
    chip: ['#F6E7CF', '#5E420F'],
    tip: 'Ideja šodienai: izmēģini jaunu recepti — lēcu zupu ar ciedru riekstiem.',
    water: 'Pamēģini ūdeni ar gurķi un piparmētru — tā pati glāze, cita garša.',
  },
  {
    value: 'gentle',
    title: 'Maigi, bez spiediena',
    chip: [colors.moveSoft, '#24503B'],
    tip: 'Miegs bija īsāks, tas ir normāli. Šodien — bez spiediena.',
    water: 'Ja ērti, iedzer malku ūdens. Nekas nav nokavēts.',
  },
  {
    value: 'neutral',
    title: 'Neitrāli',
    chip: [colors.chip, colors.ink],
    tip: 'Olbaltumvielām šodien vēl 42 g. Der jogurts, biezpiens vai pākšaugi.',
    water: 'Ūdens: 1,2 no 2,3 l.',
  },
];

/** "Tie paši dati, cits tonis": choose how tips are written. */
export default function TonePicker() {
  const me = useMe();
  const setTone = useMeMutation(api.setTone);
  if (!me.data) return <Loading />;
  const pref = me.data.tonePreference;
  const auto = selectTone(me.data.personality?.levels ?? null);
  const choose = (v: TonePreference) => setTone.mutate(v);
  return (
    <Screen testID="tone">
      <View style={{ marginLeft: -10 }}>
        <BackButton />
      </View>
      <View style={{ gap: 6 }}>
        <Text style={styles.h1} accessibilityRole="header">
          Tie paši dati, cits tonis
        </Text>
        <Text style={[type.secondary, { fontSize: 16, lineHeight: 22 }]}>
          Viena diena: 1 480 kcal, 68 g olbaltumvielu, 1,2 l ūdens. Izvēlies, kā ar tevi runāt.
        </Text>
      </View>
      {me.data.personality && (
        <Option selected={pref === 'auto'} onPress={() => choose('auto')} title="Pēc mana profila" hint={`Tagad: ${TONES.find((t) => t.value === auto)?.title}`} />
      )}
      {TONES.map((t) => (
        <Pressable
          key={t.value}
          onPress={() => choose(t.value)}
          accessibilityRole="radio"
          accessibilityState={{ checked: pref === t.value }}
          style={[styles.card, { borderColor: pref === t.value ? colors.accent : colors.border, borderWidth: pref === t.value ? 1.5 : 1 }]}>
          <View style={styles.cardHead}>
            <View style={[styles.chip, { backgroundColor: t.chip[0] }]}>
              <Text style={[styles.chipText, { color: t.chip[1] }]}>{t.title}</Text>
            </View>
            {pref === t.value && <Icon name="check" color={colors.accent} size={20} strokeWidth={2.6} />}
          </View>
          <Text style={styles.label}>Dienas ieteikums</Text>
          <Text style={styles.body}>{t.tip}</Text>
          <Text style={styles.label}>Ūdens atgādinājums</Text>
          <Text style={styles.body}>{t.water}</Text>
        </Pressable>
      ))}
    </Screen>
  );
}

function Option({ selected, onPress, title, hint }: { selected: boolean; onPress: () => void; title: string; hint: string }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      style={[styles.card, { flexDirection: 'row', alignItems: 'center', borderColor: selected ? colors.accent : colors.border, borderWidth: selected ? 1.5 : 1 }]}>
      <View style={{ flex: 1 }}>
        <Text style={type.bodySemi}>{title}</Text>
        <Text style={type.secondary}>{hint}</Text>
      </View>
      {selected && <Icon name="check" color={colors.accent} size={20} strokeWidth={2.6} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  h1: { fontFamily: fonts.heading, fontSize: 28, lineHeight: 32, color: colors.ink },
  card: { backgroundColor: colors.card, borderRadius: radius.card, padding: 18, gap: 6 },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  chip: { height: 28, paddingHorizontal: 12, borderRadius: 14, justifyContent: 'center' },
  chipText: { fontFamily: fonts.bodyBold, fontSize: 13 },
  label: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.caption, textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 4 },
  body: { fontFamily: fonts.body, fontSize: 15, lineHeight: 21, color: colors.ink },
});
