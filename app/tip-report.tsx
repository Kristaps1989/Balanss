import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { api, type TipReportReason } from '@/api';
import { keys } from '@/api/hooks';
import { Icon } from '@/components/Icon';
import { Sheet } from '@/components/Sheet';
import { colors, fonts, radius, type } from '@/theme';

const REASONS: { value: TipReportReason; label: string; hint: string }[] = [
  { value: 'not_relevant', label: 'Man neder', hint: 'Neatbilst manai dienai vai paradumiem' },
  { value: 'wrong_data', label: 'Dati nav pareizi', hint: 'Skaitļi neatbilst tam, ko ierakstīju' },
  { value: 'inappropriate', label: 'Nepiemērots vai nepatīkams', hint: 'Tonis vai saturs mani neliek justies labi' },
  { value: 'other', label: 'Cits iemesls', hint: '' },
];

/** "Ziņot par ieteikumu": hides the tip, stores the reason for review and teaches the AI to avoid it. */
export default function TipReport() {
  const { id, date } = useLocalSearchParams<{ id: string; date: string }>();
  const qc = useQueryClient();
  const report = useMutation({
    mutationFn: (reason: TipReportReason) => api.reportTip(id, reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.tip(date) });
      qc.invalidateQueries({ queryKey: keys.day(date) });
      router.back();
    },
  });
  return (
    <Sheet title="Ziņot par ieteikumu">
      <Text style={type.secondary}>Paldies — šo ieteikumu paslēpsim, un nākamie ņems to vērā. Atbildes palīdz padarīt ieteikumus drošākus.</Text>
      <View style={{ gap: 8 }}>
        {REASONS.map((r) => (
          <Pressable
            key={r.value}
            onPress={() => report.mutate(r.value)}
            disabled={report.isPending}
            accessibilityRole="button"
            style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.bg }]}>
            <View style={{ flex: 1 }}>
              <Text style={type.bodySemi}>{r.label}</Text>
              {r.hint ? <Text style={type.caption}>{r.hint}</Text> : null}
            </View>
            <Icon name="chevron" color={colors.caption} size={18} />
          </Pressable>
        ))}
      </View>
      {report.isError && <Text style={styles.error}>Neizdevās nosūtīt. Mēģini vēlreiz.</Text>}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  row: { minHeight: 60, borderRadius: radius.option, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 10 },
  error: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.accentDeep },
});
