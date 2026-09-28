import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { api } from '@/api';
import { keys, useDay } from '@/api/hooks';
import { Button } from '@/components/Button';
import { RoundButton } from '@/components/Controls';
import { Sheet } from '@/components/Sheet';
import { formatNumber } from '@/lib/format';
import { useToday } from '@/lib/today';
import { colors, fonts, type } from '@/theme';

/** Weight entry (from Add-Sheet "Svars"). */
export default function WeightSheet() {
  const date = useToday();
  const day = useDay(date);
  const qc = useQueryClient();
  const [kg, setKg] = useState<number | null>(null);
  const value = kg ?? day.data?.lastWeightKg ?? 70;
  const save = useMutation({
    mutationFn: () => api.addWeight(date, value),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.day(date) });
      qc.invalidateQueries({ queryKey: keys.me });
      router.back();
    },
  });
  const step = (d: number) => setKg(Math.round((value + d) * 10) / 10);
  return (
    <Sheet title="Svars">
      <Text style={type.secondary}>Svaru pietiek pierakstīt reizi nedēļā, vienā laikā — piemēram, no rīta.</Text>
      <View style={styles.row}>
        <RoundButton icon="minus" label="Svars: mazāk" onPress={() => step(-0.1)} />
        <View style={{ alignItems: 'center', minWidth: 140 }}>
          <Text style={styles.value} testID="weight-value">
            {formatNumber(value, 1)}
          </Text>
          <Text style={type.caption}>kg</Text>
        </View>
        <RoundButton icon="plus" label="Svars: vairāk" onPress={() => step(0.1)} />
      </View>
      <View style={styles.row}>
        <Button label="−1 kg" size="sm" variant="soft" onPress={() => step(-1)} />
        <Button label="+1 kg" size="sm" variant="soft" onPress={() => step(1)} />
      </View>
      {save.isError && <Text style={styles.error}>Neizdevās saglabāt. Mēģini vēlreiz.</Text>}
      <Button label="Saglabāt" variant="accent" onPress={() => save.mutate()} loading={save.isPending} />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 20 },
  value: { fontFamily: fonts.heading, fontSize: 48, lineHeight: 54, color: colors.ink },
  error: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.accentDeep },
});
