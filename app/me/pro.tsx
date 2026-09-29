import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useMe } from '@/api/hooks';
import { Button } from '@/components/Button';
import { IconButton } from '@/components/Header';
import { Icon } from '@/components/Icon';
import { Screen } from '@/components/Screen';
import { billingAvailable, loadOffers, purchase, restore, type PlanId } from '@/lib/billing';
import { colors, fonts, radius, type } from '@/theme';

/** Balanss Pro (prototype: Pro.dc.html). */
export default function Pro() {
  const me = useMe();
  const userId = me.data?.id ?? '';
  const offers = useQuery({ queryKey: ['offers', userId], queryFn: () => loadOffers(userId), enabled: !!userId });
  const [plan, setPlan] = useState<PlanId>('year');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const price = (id: PlanId) => offers.data?.find((o) => o.id === id)?.price ?? (id === 'year' ? '€49/gadā' : '€5,99/mēn.');
  const isPro = me.data?.plan === 'pro';

  const buy = async () => {
    setBusy(true);
    setMsg(null);
    try {
      if (await purchase(userId, plan)) {
        setMsg('Paldies! Pro aktivizēsies pēc brīža.');
        // The webhook updates the plan server-side; poll briefly.
        for (let i = 0; i < 5; i++) {
          await new Promise((r) => setTimeout(r, 2000));
          const r = await me.refetch();
          if (r.data?.plan === 'pro') break;
        }
      }
    } catch {
      setMsg('Neizdevās pabeigt pirkumu. Nauda netika noņemta — mēģini vēlreiz.');
    } finally {
      setBusy(false);
    }
  };

  const plans: { id: PlanId; name: string; sub: string }[] = [
    { id: 'year', name: 'Gada', sub: '≈ €4,08 mēnesī · ietaupi 32%' },
    { id: 'month', name: 'Mēneša', sub: 'Maksā pa mēnesim' },
  ];

  return (
    <Screen gap={16} testID="pro">
      <View style={{ alignItems: 'flex-end' }}>
        <IconButton icon="close" label="Aizvērt" bg="#EDE6DB" size={20} onPress={() => router.back()} />
      </View>
      <View style={{ gap: 8 }}>
        <Text style={styles.h1} accessibilityRole="header">
          Balanss Pro
        </Text>
        <Text style={[type.secondary, { fontSize: 16, lineHeight: 23 }]}>
          Bezmaksas versija ir pilnvērtīga. Pro — ja gribi fotografēt katru maltīti un saņemt vairāk ideju.
        </Text>
      </View>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={[styles.col, { backgroundColor: colors.white, borderColor: colors.border, borderWidth: 1 }]}>
          <Text style={[styles.colTitle, { color: colors.text2 }]}>Bezmaksas</Text>
          {['3 foto analīzes dienā', 'Ierīču sinhronizācija', 'Ieteikumi tavā stilā'].map((t) => (
            <Feature key={t} text={t} color={colors.moveDeep} />
          ))}
        </View>
        <View style={[styles.col, { backgroundColor: colors.accentSoft, borderColor: colors.accent, borderWidth: 1.5 }]}>
          <Text style={[styles.colTitle, { color: colors.accentDeep }]}>Pro</Text>
          {['Foto bez limita', 'Nedēļas AI kopsavilkums', 'Receptes tavam mērķim'].map((t) => (
            <Feature key={t} text={t} color={colors.accentText} />
          ))}
        </View>
      </View>
      {isPro ? (
        <View style={styles.active}>
          <Icon name="check" color={colors.moveDeep} />
          <Text style={styles.activeText}>Tev ir Balanss Pro. Paldies!</Text>
        </View>
      ) : (
        <View style={{ gap: 10 }} accessibilityRole="radiogroup" accessibilityLabel="Plāns">
          {plans.map((p) => {
            const on = plan === p.id;
            return (
              <Pressable
                key={p.id}
                onPress={() => setPlan(p.id)}
                accessibilityRole="radio"
                aria-checked={on}
                style={[styles.plan, { borderColor: on ? colors.accent : colors.inputBorder }]}>
                <View style={[styles.radio, { borderColor: on ? colors.accent : colors.inputBorder, backgroundColor: on ? colors.accent : colors.white }]} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={styles.planName}>{p.name}</Text>
                  <Text style={type.secondary}>{p.sub}</Text>
                </View>
                <Text style={styles.price}>{price(p.id)}</Text>
              </Pressable>
            );
          })}
        </View>
      )}
      <View style={{ flexGrow: 1 }} />
      {!isPro && (
        <View style={{ gap: 6 }}>
          {msg && <Text style={styles.msg}>{msg}</Text>}
          <Button
            label={billingAvailable ? (plan === 'year' ? 'Turpināt ar gada plānu' : 'Turpināt ar mēneša plānu') : 'Maksājumi drīzumā'}
            onPress={buy}
            loading={busy}
            disabled={!billingAvailable}
          />
          <Button label="Varbūt vēlāk" variant="ghost" size="md" onPress={() => router.back()} />
          {billingAvailable && <Button label="Atjaunot pirkumus" variant="ghost" size="sm" onPress={() => restore(userId).then(() => me.refetch())} />}
          <Text style={[type.caption, { textAlign: 'center' }]}>Atcelt var jebkurā brīdī iestatījumos.</Text>
        </View>
      )}
    </Screen>
  );
}

function Feature({ text, color }: { text: string; color: string }) {
  return (
    <View style={{ flexDirection: 'row', gap: 6 }}>
      <Icon name="check" color={color} size={18} />
      <Text style={styles.feature}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  h1: { fontFamily: fonts.heading, fontSize: 32, lineHeight: 36, color: colors.ink },
  col: { flex: 1, borderRadius: radius.option, padding: 14, gap: 10 },
  colTitle: { fontFamily: fonts.bodyBold, fontSize: 14 },
  feature: { flex: 1, fontFamily: fonts.body, fontSize: 14, lineHeight: 19, color: colors.ink },
  plan: { minHeight: 68, borderRadius: radius.option, paddingVertical: 12, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: colors.white, borderWidth: 1.5 },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2 },
  planName: { fontFamily: fonts.bodyBold, fontSize: 16, color: colors.ink },
  price: { fontFamily: fonts.heading, fontSize: 18, color: colors.ink },
  msg: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.text2, textAlign: 'center' },
  active: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 16, backgroundColor: '#EAF3EE', padding: 14 },
  activeText: { fontFamily: fonts.bodySemi, fontSize: 15, color: colors.moveDeep },
});
