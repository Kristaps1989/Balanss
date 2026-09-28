import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { api, type WorkoutType } from '@/api';
import { keys } from '@/api/hooks';
import { Button } from '@/components/Button';
import { StepperCard } from '@/components/Controls';
import { Sheet } from '@/components/Sheet';
import { useToday } from '@/lib/today';
import { colors, fonts } from '@/theme';

export const WORKOUT_LABEL: Record<WorkoutType, string> = {
  walk: 'Pastaiga',
  nordic_walk: 'Nūjošana',
  run: 'Skriešana',
  bike: 'Riteņbraukšana',
  yoga: 'Joga',
  strength: 'Spēka treniņš',
  swim: 'Peldēšana',
  other: 'Cits',
};

const TYPES: WorkoutType[] = ['walk', 'nordic_walk', 'run', 'bike', 'yoga', 'strength', 'swim', 'other'];

/** Manual activity (Add-Sheet "Aktivitāte — ja pulkstenis to neredzēja"). */
export default function ActivitySheet() {
  const date = useToday();
  const qc = useQueryClient();
  const [kind, setKind] = useState<WorkoutType>('walk');
  const [minutes, setMinutes] = useState(30);
  const [ago, setAgo] = useState(0);
  const save = useMutation({
    mutationFn: () => {
      const start = new Date(Date.now() - (ago * 60 + minutes) * 60000);
      return api.createActivity({ type: kind, startedAt: start.toISOString(), durationMin: minutes });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.movement(date) });
      qc.invalidateQueries({ queryKey: keys.day(date) });
      router.back();
    },
  });
  return (
    <Sheet title="Pievienot aktivitāti" scroll>
      <View style={styles.chips} accessibilityRole="radiogroup">
        {TYPES.map((t) => {
          const on = t === kind;
          return (
            <Pressable
              key={t}
              onPress={() => setKind(t)}
              accessibilityRole="radio"
              aria-checked={on}
              style={[styles.chip, { backgroundColor: on ? colors.ink : colors.chip }]}>
              <Text style={[styles.chipText, { color: on ? colors.white : colors.ink }]}>{WORKOUT_LABEL[t]}</Text>
            </Pressable>
          );
        })}
      </View>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <StepperCard
          label="Ilgums"
          value={String(minutes)}
          unit="min"
          onDec={() => setMinutes((m) => Math.max(5, m - 5))}
          onInc={() => setMinutes((m) => Math.min(600, m + 5))}
        />
        <StepperCard
          label="Beidzās pirms"
          value={String(ago)}
          unit="h"
          onDec={() => setAgo((a) => Math.max(0, a - 1))}
          onInc={() => setAgo((a) => Math.min(23, a + 1))}
        />
      </View>
      {save.isError && <Text style={styles.error}>Neizdevās saglabāt. Mēģini vēlreiz.</Text>}
      <Button label="Saglabāt" variant="accent" onPress={() => save.mutate()} loading={save.isPending} />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { height: 44, paddingHorizontal: 16, borderRadius: 22, justifyContent: 'center' },
  chipText: { fontFamily: fonts.bodySemi, fontSize: 14 },
  error: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.accentDeep },
});
