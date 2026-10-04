import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';

import { api } from '@/api';
import { useMe, useMeMutation } from '@/api/hooks';
import { Button } from '@/components/Button';
import { BackButton, StepHeader } from '@/components/Header';
import { Icon } from '@/components/Icon';
import { Screen } from '@/components/Screen';
import { health } from '@/lib/health';
import { syncHealth, syncProfile } from '@/lib/services';
import { colors, fonts, radius, type } from '@/theme';

/** Pievieno savu pulksteni (prototype: Onb-Device.dc.html). */
export function DevicesScreen({ mode }: { mode: 'onboarding' | 'edit' }) {
  const me = useMe();
  const qc = useQueryClient();
  const avail = useQuery({ queryKey: ['health-availability'], queryFn: () => health.availability() });
  const [state, setState] = useState<'idle' | 'busy' | 'denied' | 'error'>('idle');
  const saveDevices = useMeMutation(api.updateDevices);
  const devices = me.data?.devices;
  const connected = !!devices?.connected && devices.source === health.source;

  const connect = async () => {
    setState('busy');
    try {
      const ok = await health.connect();
      if (!ok) {
        setState('denied');
        return;
      }
      await syncHealth(qc, syncProfile(me.data?.profile), true);
      await me.refetch();
      setState('idle');
    } catch {
      setState('error');
    }
  };

  const disconnect = async () => {
    await saveDevices.mutateAsync({ connected: false });
    health.openSettings();
  };

  const next = () => (mode === 'onboarding' ? router.push('/goals') : router.back());
  const isAndroid = Platform.OS === 'android';
  const hcAvail = avail.data;

  const card = (kind: 'apple' | 'hc') => {
    const mine = (kind === 'hc') === isAndroid && Platform.OS !== 'web';
    const title = kind === 'apple' ? 'Apple Health' : 'Health Connect';
    const sub = kind === 'apple' ? 'iPhone un Apple Watch' : 'Android tālruņiem';
    const iconBg = kind === 'apple' ? '#FCE7EA' : colors.moveSoft;
    const iconFg = kind === 'apple' ? '#C2475E' : '#3F6E57';
    return (
      <View style={[styles.card, !mine && { flexDirection: 'row', alignItems: 'center' }]} key={kind}>
        <View style={styles.cardTop}>
          <View style={[styles.icon, { backgroundColor: iconBg }]}>
            <Icon name={kind === 'apple' ? 'heart' : 'movement'} color={iconFg} size={28} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>{title}</Text>
            <Text style={type.secondary}>{sub}</Text>
          </View>
          {!mine && <Text style={styles.na}>Nav šajā ierīcē</Text>}
        </View>
        {mine &&
          (connected ? (
            <View style={styles.ok}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Icon name="check" color={colors.moveDeep} size={20} />
                <Text style={styles.okTitle}>Savienots</Text>
              </View>
              <Text style={styles.okBody}>{devices?.devices.length ? `Atradām: ${devices.devices.join(', ')}` : 'Dati parādīsies pēc nākamās sinhronizācijas.'}</Text>
              {mode === 'edit' && (
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                  <Button label="Pārvaldīt atļaujas" variant="light" size="sm" onPress={disconnect} />
                  <Button label="Diagnostika" variant="light" size="sm" onPress={() => router.push('/me/health-debug')} />
                </View>
              )}
            </View>
          ) : hcAvail === 'needs_install' ? (
            <View style={{ gap: 8 }}>
              <Text style={type.secondary}>Vispirms instalē vai atjaunini Health Connect lietotni.</Text>
              <Button label="Atvērt Google Play" size="md" onPress={() => health.openSettings()} />
            </View>
          ) : hcAvail === 'unsupported' ? (
            <Text style={type.secondary}>Šī ierīce vēl neatbalsta savienojumu. Datus vari ievadīt manuāli.</Text>
          ) : (
            <View style={{ gap: 8 }}>
              <Button label="Savienot" size="md" onPress={connect} loading={state === 'busy'} testID="connect-health" />
              {state === 'denied' && <Text style={styles.warn}>Atļaujas netika dotas. Vari mēģināt vēlreiz vai turpināt bez pulksteņa.</Text>}
              {state === 'error' && <Text style={styles.warn}>Neizdevās savienot. Mēģini vēlreiz.</Text>}
            </View>
          ))}
      </View>
    );
  };

  return (
    <Screen gap={18} testID="devices">
      {mode === 'onboarding' ? (
        <StepHeader step={3} onBack={() => router.back()} />
      ) : (
        <View style={{ marginLeft: -10 }}>
          <BackButton />
        </View>
      )}
      <View style={{ gap: 6 }}>
        <Text style={styles.h1} accessibilityRole="header">
          Pievieno savu pulksteni
        </Text>
        <Text style={styles.lead}>Viens savienojums — un soļi, pulss un miegs parādīsies paši.</Text>
      </View>
      {isAndroid ? [card('hc'), card('apple')] : [card('apple'), card('hc')]}
      <View style={styles.note}>
        <Icon name="watch" color={colors.caption} size={22} />
        <Text style={[type.secondary, { flex: 1, lineHeight: 21 }]}>
          Polar, Garmin, Oura, Withings un citas ierīces pienāk caur to automātiski — atsevišķi nekas nav jāsavieno.
        </Text>
      </View>
      <View style={{ flexGrow: 1 }} />
      <View style={{ gap: 6 }}>
        <Button label={mode === 'onboarding' ? 'Tālāk' : 'Gatavs'} onPress={next} testID="devices-next" />
        {mode === 'onboarding' && !connected && <Button label="Vēlāk — ievadīšu manuāli" variant="ghost" size="md" onPress={next} testID="devices-later" />}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  h1: { fontFamily: fonts.heading, fontSize: 28, lineHeight: 32, color: colors.ink },
  lead: { ...type.body, color: colors.text2 },
  card: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.optionBorder, borderRadius: radius.card, padding: 18, gap: 14 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 14, flex: 1 },
  icon: { width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontFamily: fonts.bodyBold, fontSize: 18, color: colors.ink },
  na: { fontFamily: fonts.bodySemi, fontSize: 13, color: colors.caption },
  ok: { borderRadius: 16, backgroundColor: '#EAF3EE', paddingVertical: 12, paddingHorizontal: 14, gap: 6 },
  okTitle: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.moveDeep },
  okBody: { fontFamily: fonts.body, fontSize: 14, color: '#3D4B43' },
  warn: { fontFamily: fonts.body, fontSize: 14, color: colors.accentDeep },
  note: { flexDirection: 'row', gap: 12, paddingTop: 4, paddingHorizontal: 4 },
});
