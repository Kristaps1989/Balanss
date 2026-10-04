import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Share, StyleSheet, Text, View } from 'react-native';

import { useMe, useMovement } from '@/api/hooks';
import { Button } from '@/components/Button';
import { BackButton } from '@/components/Header';
import { Screen } from '@/components/Screen';
import { Loading } from '@/components/States';
import { formatNumber } from '@/lib/format';
import { health } from '@/lib/health';
import { syncHealth, syncProfile } from '@/lib/services';
import { useToday } from '@/lib/today';
import { colors, fonts, radius, type } from '@/theme';

/**
 * Health Connect diagnostics: syncs now, then shows what the store holds per app and device
 * next to what Balanss saved. For support when steps don't match the watch app.
 */
export default function HealthDebug() {
  const date = useToday();
  const qc = useQueryClient();
  const me = useMe();
  const mv = useMovement(date);
  const report = useQuery({
    queryKey: ['health-diagnostics'],
    queryFn: async () => {
      await syncHealth(qc, syncProfile(me.data?.profile), true);
      return health.diagnostics();
    },
    staleTime: 0,
    gcTime: 0,
  });
  const text = [
    `Balanss ${date}`,
    `Saglabāts serverī šodien: ${mv.data ? formatNumber(mv.data.today.steps.value) : '…'} soļi`,
    `Pēdējā sinhronizācija: ${me.data?.devices.lastSyncAt ? new Date(me.data.devices.lastSyncAt).toLocaleString('lv-LV') : '—'}`,
    '',
    report.data ?? '',
  ].join('\n');

  return (
    <Screen gap={16}>
      <View style={{ marginLeft: -10 }}>
        <BackButton />
      </View>
      <Text style={type.h2} accessibilityRole="header">
        Health Connect diagnostika
      </Text>
      <Text style={type.secondary}>Kas Health Connect ir ierakstīts par šodienu un vakardienu — pa lietotnēm un ierīcēm. Nosūti šo tekstu, ja soļi nesakrīt ar pulksteņa lietotni.</Text>
      {report.isPending ? (
        <Loading label="Sinhronizēju un lasu Health Connect…" />
      ) : (
        <View style={styles.box}>
          <Text style={styles.mono} selectable>
            {report.isError ? `Neizdevās nolasīt: ${String(report.error)}` : text}
          </Text>
        </View>
      )}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Button label="Atjaunot" variant="light" size="md" onPress={() => report.refetch()} disabled={report.isFetching} style={{ flex: 1 }} />
        <Button label="Nosūtīt" icon="arrowRight" size="md" onPress={() => Share.share({ message: text })} disabled={!report.data} style={{ flex: 1 }} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  box: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, borderRadius: radius.option, padding: 14 },
  mono: { fontFamily: fonts.body, fontSize: 13, lineHeight: 19, color: colors.ink },
});
