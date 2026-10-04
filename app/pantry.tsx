import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { api, PANTRY_FRESH_DAYS } from '@/api';
import { keys } from '@/api/hooks';
import { Button } from '@/components/Button';
import { Icon } from '@/components/Icon';
import { Sheet } from '@/components/Sheet';
import { preparePhoto } from '@/lib/photo';
import { useToday } from '@/lib/today';
import { colors, fonts, radius, type } from '@/theme';

const split = (text: string) =>
  text
    .split(/[,;\n]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

/**
 * "Kas ir mājās?": what the user has at home, so food tips need no shopping.
 * Typed or from a fridge photo (the AI lists what it sees; nothing is saved until "Saglabāt").
 */
export default function PantrySheet() {
  const params = useLocalSearchParams<{ date?: string }>();
  const today = useToday();
  const date = params.date ?? today;
  const qc = useQueryClient();
  const current = useQuery({ queryKey: ['pantry'], queryFn: api.pantry });
  const [items, setItems] = useState<string[] | null>(null);
  const [text, setText] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const list = items ?? (current.data?.fresh ? current.data.items : []);

  const add = (more: string[]) => {
    setItems([...new Set([...list, ...more])]);
    setText('');
  };

  const scan = useMutation({
    mutationFn: async () => {
      const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9 });
      if (res.canceled || !res.assets[0]) return null;
      const photo = await preparePhoto(res.assets[0].uri, res.assets[0].width);
      return api.scanPantry(photo.base64);
    },
    onSuccess: (r) => {
      if (!r) return;
      if (!r.items.length) return setMessage('Foto neizdevās atpazīt produktus. Pamēģini vēlreiz vai ieraksti tos.');
      add(r.items);
      setMessage(`Atradu ${r.items.length}. Pārbaudi sarakstu un izdzēs, kā nav.`);
    },
    onError: () => setMessage('Neizdevās apstrādāt foto. Pamēģini vēlreiz vai ieraksti produktus.'),
  });

  const save = useMutation({
    mutationFn: async () => {
      const all = [...new Set([...list, ...split(text)])];
      const pantry = await api.savePantry(all);
      qc.setQueryData(['pantry'], pantry);
      return api.refreshTip(date);
    },
    onSuccess: (tip) => {
      qc.setQueryData(keys.tip(date), tip);
      router.back();
    },
    onError: () => setMessage('Neizdevās saglabāt. Mēģini vēlreiz.'),
  });

  return (
    <Sheet title="Kas ir mājās?" scroll>
      <Text style={type.secondary}>
        Ieteikumi izmantos tikai to, kas tev jau ir — bez iepirkšanās. Saraksts derēs {PANTRY_FRESH_DAYS} dienas.
      </Text>

      {list.length > 0 && (
        <View style={styles.chips} testID="pantry-items">
          {list.map((i) => (
            <Pressable
              key={i}
              onPress={() => setItems(list.filter((x) => x !== i))}
              accessibilityRole="button"
              accessibilityLabel={`Noņemt: ${i}`}
              style={styles.item}>
              <Text style={styles.itemText}>{i}</Text>
              <Icon name="close" color={colors.caption} size={16} />
            </Pressable>
          ))}
        </View>
      )}

      <View style={{ gap: 8 }}>
        <TextInput
          value={text}
          onChangeText={setText}
          onSubmitEditing={() => add(split(text))}
          placeholder="Piemēram: olas, piens, auzu pārslas"
          placeholderTextColor={colors.muted}
          accessibilityLabel="Produkti, ar komatu"
          style={styles.input}
          testID="pantry-input"
        />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Button label="Pievienot" variant="light" size="md" onPress={() => add(split(text))} disabled={!split(text).length} style={{ flex: 1 }} testID="pantry-add" />
          <Button
            label={scan.isPending ? 'Skatos…' : 'Foto'}
            icon="camera"
            variant="light"
            size="md"
            onPress={() => scan.mutate()}
            disabled={scan.isPending}
            style={{ flex: 1 }}
            accessibilityLabel="Nofotografēt ledusskapi"
          />
        </View>
      </View>

      {message && (
        <Text style={styles.message} accessibilityLiveRegion="polite">
          {message}
        </Text>
      )}

      <Button
        label="Saglabāt un atjaunot ieteikumu"
        onPress={() => save.mutate()}
        loading={save.isPending}
        disabled={!list.length && !split(text).length}
        testID="pantry-save"
      />
      <Text style={type.caption}>Foto netiek saglabāts; saglabājam tikai produktu nosaukumus.</Text>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  item: {
    minHeight: 44,
    borderRadius: 22,
    paddingLeft: 14,
    paddingRight: 10,
    backgroundColor: colors.chip,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  itemText: { fontFamily: fonts.bodySemi, fontSize: 15, color: colors.ink },
  input: {
    minHeight: 52,
    borderRadius: radius.option,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    paddingHorizontal: 16,
    fontFamily: fonts.body,
    fontSize: 16,
    color: colors.ink,
    backgroundColor: colors.white,
  },
  message: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.accentText },
});
