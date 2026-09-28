import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router, type Href } from 'expo-router';
import type { ReactNode } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { api, type Reminders } from '@/api';
import { useMe, useMeMutation } from '@/api/hooks';
import { Card } from '@/components/Card';
import { confirm } from '@/components/Confirm';
import { Segmented, Toggle } from '@/components/Controls';
import { BackButton } from '@/components/Header';
import { Icon } from '@/components/Icon';
import { Screen } from '@/components/Screen';
import { ErrorState, Loading } from '@/components/States';
import { TraitBars } from '@/components/TraitBars';
import { signOutProviders } from '@/lib/auth';
import { duration, formatNumber, litres, monthYear } from '@/lib/format';
import { colors, fonts, radius, type } from '@/theme';

const REMINDERS: { key: keyof Pick<Reminders, 'water' | 'food' | 'move' | 'sleepWindow'>; label: string }[] = [
  { key: 'water', label: 'Ūdens' },
  { key: 'food', label: 'Maltīšu ieraksti' },
  { key: 'move', label: 'Kustība' },
  { key: 'sleepWindow', label: 'Miega logs' },
];

const GOAL_LABEL = { health: 'veselība', fit: 'forma', weight: 'svars', routine: 'rutīna' } as const;

/** Es (prototype: Me.dc.html). */
export default function MeScreen() {
  const qc = useQueryClient();
  const me = useMe();
  const setTone = useMeMutation(api.setTone);
  const reminders = useMeMutation(api.updateReminders);
  const deletePersonality = useMeMutation(api.deletePersonality);
  const exportData = useMutation({ mutationFn: api.exportData, onSuccess: (r) => Linking.openURL(r.downloadUrl) });
  const logout = useMutation({
    mutationFn: async () => {
      await signOutProviders();
      await api.logout();
    },
    onSuccess: () => qc.clear(),
  });
  const del = useMutation({ mutationFn: api.deleteAccount, onSuccess: () => qc.clear() });

  if (me.isPending) return <Loading />;
  if (!me.data) return <ErrorState onRetry={() => me.refetch()} />;
  const m = me.data;
  const p = m.profile;
  const pers = m.personality;
  const canRetest = !pers || new Date(pers.retestFrom) <= new Date();
  const weightGoal =
    p.goals.includes('weight') && p.goalWeightKg ? `Vēlamais svars ${formatNumber(p.goalWeightKg)} kg` : null;
  const goalText = [weightGoal, ...p.goals.filter((g) => g !== 'weight').map((g) => GOAL_LABEL[g])].filter(Boolean).join(' · ') || '—';
  const sourceName = m.devices.source === 'health_connect' ? 'Health Connect' : m.devices.source === 'apple_health' ? 'Apple Health' : null;

  return (
    <Screen testID="me">
      <View style={{ marginLeft: -10, marginBottom: -6 }}>
        <BackButton />
      </View>
      <Pressable onPress={() => router.push('/me/basics')} accessibilityRole="button" accessibilityLabel="Labot profilu" style={styles.head}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{(p.firstName || '?').charAt(0).toUpperCase()}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.name}>{p.firstName || 'Profils'}</Text>
          <Text style={type.secondary}>
            {p.age} gadi · {p.heightCm} cm · {formatNumber(p.weightKg, Number.isInteger(p.weightKg) ? 0 : 1)} kg
          </Text>
        </View>
        <Icon name="edit" color={colors.caption} size={20} />
      </Pressable>

      <Card style={styles.card}>
        <View style={styles.cardHead}>
          <Text style={type.section}>Personības profils</Text>
          {pers && <Text style={type.caption}>{pers.styleName}</Text>}
        </View>
        {pers ? (
          <>
            <Pressable onPress={() => router.push('/me/personality')} accessibilityRole="button" accessibilityLabel="Skatīt personības profilu">
              <TraitBars personality={pers} short />
            </Pressable>
            <Pressable onPress={() => router.push('/me/tone')} accessibilityRole="button" style={styles.toneLink}>
              <Text style={styles.toneLinkText}>Tie paši dati, cits tonis</Text>
              <Icon name="chevron" color="#6E3A1F" size={20} />
            </Pressable>
            <View style={styles.rowToggle}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>Atgriezties uz neitrālu toni</Text>
                <Text style={type.secondary}>Ieteikumi bez personības pielāgojuma</Text>
              </View>
              <Toggle
                value={m.tonePreference === 'neutral'}
                onChange={(v) => setTone.mutate(v ? 'neutral' : 'auto')}
                label="Neitrāls tonis"
                testID="neutral-toggle"
              />
            </View>
            {canRetest ? (
              <Pressable onPress={() => router.push('/me/personality-test')} accessibilityRole="button" style={styles.inline}>
                <Icon name="clock" color={colors.accentText} size={18} />
                <Text style={[type.link]}>Atkārtot testu</Text>
              </Pressable>
            ) : (
              <View style={styles.inline}>
                <Icon name="clock" color={colors.caption} size={18} />
                <Text style={type.caption}>Atkārtot testu varēsi no {monthYear(pers.retestFrom)}</Text>
              </View>
            )}
          </>
        ) : (
          <>
            <Text style={type.secondary}>Profila nav — ieteikumi ir neitrālā tonī. 2 minūtes, 20 apgalvojumi, un tie pielāgosies tev.</Text>
            <Pressable
              onPress={async () => {
                const ok = await confirm({
                  title: 'Uzzināt savu stilu?',
                  message: 'Atļauju izmantot rezultātu ieteikumu pielāgošanai. To var mainīt vai dzēst jebkurā brīdī. Šis nav klīnisks vai diagnostisks tests.',
                  confirmLabel: 'Piekrītu, sākt',
                });
                if (ok) router.push('/me/personality-test');
              }}
              accessibilityRole="button"
              style={styles.toneLink}>
              <Text style={styles.toneLinkText}>Uzzināt savu stilu</Text>
              <Icon name="chevron" color="#6E3A1F" size={20} />
            </Pressable>
          </>
        )}
      </Card>

      <Section title="Mērķi" onPress={() => router.push('/me/goals')} actionLabel="Labot">
        <KV k="Mērķi" v={goalText} />
        <KV k="Enerģija" v={`${formatNumber(m.targets.kcal)} kcal`} />
        <KV k="Olbaltumvielas" v={`${m.targets.proteinG} g`} />
        <KV k="Ūdens · soļi · miegs" v={`${litres(m.targets.waterMl)} · ${formatNumber(m.targets.steps)} · ${duration(m.targets.sleepMin)}`} />
      </Section>

      <Section title="Ierīces">
        <Pressable onPress={() => router.push('/me/devices')} accessibilityRole="button" style={styles.device}>
          <View style={[styles.devIcon, { backgroundColor: m.devices.source === 'apple_health' ? '#FCE7EA' : colors.moveSoft }]}>
            <Icon name={m.devices.source === 'apple_health' ? 'heart' : 'movement'} color={m.devices.source === 'apple_health' ? '#C2475E' : colors.moveDeep} size={22} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitleBold}>{sourceName ?? 'Nav savienots'}</Text>
            <Text style={type.secondary}>{m.devices.devices.length ? m.devices.devices.join(' · ') : 'Pievieno pulksteni vai telefonu'}</Text>
          </View>
          <Text style={[styles.status, { color: m.devices.connected ? colors.moveDeep : colors.accentText }]}>
            {m.devices.connected ? 'Sinhronizēts' : 'Savienot'}
          </Text>
        </Pressable>
      </Section>

      <Section title="Atgādinājumi">
        {REMINDERS.map((r) => (
          <View key={r.key} style={styles.line}>
            <Text style={styles.rowTitle}>{r.label}</Text>
            <Toggle value={m.reminders[r.key]} onChange={(v) => reminders.mutate({ [r.key]: v })} label={r.label} testID={`reminder-${r.key}`} />
          </View>
        ))}
        <View style={[styles.lineTop, { paddingTop: 10, paddingBottom: 12, gap: 8 }]}>
          <Text style={styles.rowTitle}>Cik bieži</Text>
          <Segmented
            options={[
              { value: 'low', label: 'Reti' },
              { value: 'mid', label: 'Vidēji' },
              { value: 'high', label: 'Bieži' },
            ]}
            value={m.reminders.frequency}
            onChange={(f) => reminders.mutate({ frequency: f })}
          />
        </View>
      </Section>

      <Section title="Privātums un dati">
        <Row label={exportData.isPending ? 'Sagatavoju…' : exportData.isSuccess ? 'Eksports gatavs — lejupielāde atvērta' : 'Eksportēt manus datus'} icon="download" onPress={() => exportData.mutate()} />
        {pers && (
          <Row
            label="Dzēst personības profilu"
            icon="trash"
            onPress={async () => {
              if (
                await confirm({
                  title: 'Dzēst personības profilu?',
                  message: 'Testa atbildes un rezultāts tiks izdzēsti. Ieteikumi būs neitrālā tonī.',
                  confirmLabel: 'Dzēst profilu',
                  destructive: true,
                })
              )
                deletePersonality.mutate();
            }}
          />
        )}
        <Row
          label="Dzēst visus datus un kontu"
          icon="trash"
          danger
          onPress={async () => {
            if (
              await confirm({
                title: 'Dzēst visus datus un kontu?',
                message: 'Neatgriezeniski izdzēsīsim profilu, maltītes, veselības datus, personības profilu un kontu. To nevarēs atsaukt.',
                confirmLabel: 'Dzēst visu',
                destructive: true,
              })
            )
              del.mutate();
          }}
        />
      </Section>

      <Section title="Konts">
        <KV k="E-pasts" v={m.email} />
        <KV k="Plāns" v={m.plan === 'pro' ? 'Pro' : 'Bezmaksas'} />
        <Row label="Iziet no konta" icon="logout" onPress={() => logout.mutate()} />
      </Section>

      {m.plan !== 'pro' && (
        <Pressable onPress={() => router.push('/me/pro')} accessibilityRole="button" style={styles.pro} testID="pro-banner">
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={styles.proTitle}>Balanss Pro</Text>
            <Text style={styles.proText}>Neierobežotas foto analīzes, nedēļas kopsavilkums un receptes</Text>
          </View>
          <Icon name="chevron" color={colors.white} size={22} />
        </Pressable>
      )}
    </Screen>
  );
}

function Section({ title, children, onPress, actionLabel }: { title: string; children: ReactNode; onPress?: () => void; actionLabel?: string }) {
  return (
    <Card style={styles.section}>
      <View style={styles.sectionHead}>
        <Text style={type.section}>{title}</Text>
        {onPress && (
          <Pressable onPress={onPress} accessibilityRole="button" hitSlop={8} style={{ paddingVertical: 8, paddingLeft: 12 }}>
            <Text style={type.link}>{actionLabel}</Text>
          </Pressable>
        )}
      </View>
      {children}
    </Card>
  );
}

function KV({ k, v }: { k: string; v: string }) {
  return (
    <View style={styles.line}>
      <Text style={styles.k}>{k}</Text>
      <Text style={styles.v}>{v}</Text>
    </View>
  );
}

function Row({ label, icon, onPress, danger, href }: { label: string; icon: 'download' | 'trash' | 'logout'; onPress?: () => void; danger?: boolean; href?: Href }) {
  return (
    <Pressable
      onPress={onPress ?? (href ? () => router.push(href) : undefined)}
      accessibilityRole="button"
      style={({ pressed }) => [styles.line, { minHeight: 52 }, pressed && { opacity: 0.7 }]}>
      <Text style={[styles.rowTitle, danger && { color: colors.accentDeep, fontFamily: fonts.bodySemi }]}>{label}</Text>
      <Icon name={icon} color={danger ? colors.accentDeep : colors.caption} size={20} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatar: { width: 60, height: 60, borderRadius: 30, backgroundColor: colors.avatar, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: fonts.heading, fontSize: 24, color: colors.ink },
  name: { fontFamily: fonts.heading, fontSize: 28, lineHeight: 32, color: colors.ink },
  card: { padding: 18, gap: 14 },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' },
  toneLink: {
    minHeight: 52,
    borderRadius: 16,
    backgroundColor: colors.accentSoft,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  toneLinkText: { fontFamily: fonts.bodyBold, fontSize: 15, color: '#6E3A1F' },
  rowToggle: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowTitle: { fontFamily: fonts.body, fontSize: 15, color: colors.ink, flexShrink: 1 },
  rowTitleBold: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.ink },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 32 },
  section: { paddingVertical: 6, paddingHorizontal: 18, borderRadius: radius.card },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 12, paddingBottom: 4 },
  line: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 48, borderTopWidth: 1, borderTopColor: '#F0EAE1', gap: 12 },
  lineTop: { borderTopWidth: 1, borderTopColor: '#F0EAE1' },
  k: { fontFamily: fonts.body, fontSize: 15, color: colors.text2 },
  v: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.ink, flexShrink: 1, textAlign: 'right' },
  device: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60, borderTopWidth: 1, borderTopColor: '#F0EAE1' },
  devIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  status: { fontFamily: fonts.bodySemi, fontSize: 13 },
  pro: { borderRadius: radius.card, backgroundColor: colors.ink, padding: 18, flexDirection: 'row', alignItems: 'center', gap: 14 },
  proTitle: { fontFamily: fonts.heading, fontSize: 19, color: colors.white },
  proText: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: '#E4DDD3' },
});
