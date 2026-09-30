import { router } from 'expo-router';
import { useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { api, ApiError } from '@/api';
import { Logo } from '@/components/Brand';
import { Button } from '@/components/Button';
import { BackButton } from '@/components/Header';
import { Screen } from '@/components/Screen';
import { appleAvailable, googleAvailable, SignInCancelled, signInWithApple, signInWithGoogle } from '@/lib/auth';
import { colors, fonts, type } from '@/theme';

const TERMS_URL = process.env.EXPO_PUBLIC_TERMS_URL ?? 'https://balanss.app/noteikumi';
const PRIVACY_URL = process.env.EXPO_PUBLIC_PRIVACY_URL ?? 'https://balanss.app/privatums';

type Step = 'closed' | 'edit' | 'sent';

/** Sāksim ar kontu (prototype: Onb-Login.dc.html). */
export default function Login() {
  const [step, setStep] = useState<Step>('closed');
  const [email, setEmail] = useState('');
  const [devToken, setDevToken] = useState<string | undefined>();
  const [busy, setBusy] = useState<'google' | 'apple' | 'email' | 'verify' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (kind: 'google' | 'apple' | 'email' | 'verify', fn: () => Promise<unknown>) => {
    setBusy(kind);
    setError(null);
    try {
      await fn();
    } catch (e) {
      if (!(e instanceof SignInCancelled)) {
        setError(
          e instanceof ApiError && e.status === 400
            ? 'Pārbaudi e-pasta adresi.'
            : e instanceof ApiError && e.status === 429
              ? 'Pārāk daudz mēģinājumu. Pamēģini pēc brīža.'
              : e instanceof ApiError && e.status === 0
                ? 'Nevar sasniegt serveri. Pārbaudi interneta savienojumu un mēģini vēlreiz.'
                : e instanceof ApiError && e.status >= 500
                  ? 'Serveris pašlaik nav pieejams. Pamēģini pēc brīža.'
                  : 'Neizdevās pieslēgties. Mēģini vēlreiz.',
        );
      }
    } finally {
      setBusy(null);
    }
  };

  const send = () =>
    run('email', async () => {
      const res = await api.requestMagicLink(email.trim());
      setDevToken(res.devToken);
      setStep('sent');
    });

  return (
    <Screen gap={20} testID="login">
      <View style={{ marginLeft: -10 }}>
        <BackButton onPress={() => (router.canGoBack() ? router.back() : router.replace('/welcome'))} />
      </View>
      <View style={styles.hero}>
        <Logo size={72} />
        <Text style={styles.title} accessibilityRole="header">
          Sāksim ar kontu
        </Text>
        <Text style={styles.sub}>Lai tavi dati ir drošībā un pieejami arī jaunā tālrunī.</Text>
      </View>
      <View style={{ flexGrow: 1, minHeight: 24 }} />
      <View style={{ gap: 12 }}>
        {appleAvailable && (
          <Button label="Turpināt ar Apple" variant="dark" style={{ backgroundColor: '#000' }} loading={busy === 'apple'} onPress={() => run('apple', signInWithApple)} />
        )}
        {googleAvailable && (
          <Button label="Turpināt ar Google" variant="light" loading={busy === 'google'} onPress={() => run('google', signInWithGoogle)} />
        )}
        {(appleAvailable || googleAvailable) && (
          <View style={styles.or}>
            <View style={styles.line} />
            <Text style={type.caption}>vai</Text>
            <View style={styles.line} />
          </View>
        )}
        {step === 'closed' && <Button label="Turpināt ar e-pastu" icon="mail" variant="light" onPress={() => setStep('edit')} testID="email-open" />}
        {step === 'edit' && (
          <View style={{ gap: 8 }}>
            <Text style={styles.label} nativeID="email-label">
              E-pasts
            </Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="vards@piemers.lv"
              placeholderTextColor={colors.muted}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              textContentType="emailAddress"
              autoFocus
              onSubmitEditing={send}
              accessibilityLabelledBy="email-label"
              accessibilityLabel="E-pasts"
              style={styles.input}
              testID="email-input"
            />
            <Button label="Sūtīt pieslēgšanās saiti" size="md" onPress={send} loading={busy === 'email'} disabled={!/.+@.+\..+/.test(email.trim())} testID="email-send" />
          </View>
        )}
        {step === 'sent' && (
          <View style={styles.sent} accessibilityLiveRegion="polite">
            <Text style={styles.sentTitle}>Pārbaudi e-pastu</Text>
            <Text style={styles.sentBody}>Nosūtījām saiti uz {email.trim()}. Parole nav vajadzīga.</Text>
            {devToken ? (
              <Pressable onPress={() => run('verify', () => api.verifyMagicLink(devToken))} accessibilityRole="button" testID="dev-open-link">
                <Text style={styles.sentLink}>{busy === 'verify' ? 'Pieslēdzos…' : 'Atvērt saiti (izstrādes režīms)'}</Text>
              </Pressable>
            ) : (
              <Pressable onPress={() => setStep('edit')} accessibilityRole="button">
                <Text style={styles.sentLink}>Mainīt e-pastu vai sūtīt vēlreiz</Text>
              </Pressable>
            )}
          </View>
        )}
        {error && (
          <Text style={styles.error} accessibilityLiveRegion="assertive">
            {error}
          </Text>
        )}
      </View>
      <Text style={styles.legal}>
        Jau ir konts? Tās pašas pogas tevi pieslēgs.{'\n'}Turpinot tu piekrīti{' '}
        <Text style={styles.legalLink} onPress={() => Linking.openURL(TERMS_URL)} accessibilityRole="link">
          lietošanas noteikumiem
        </Text>{' '}
        un{' '}
        <Text style={styles.legalLink} onPress={() => Linking.openURL(PRIVACY_URL)} accessibilityRole="link">
          privātuma politikai
        </Text>
        .
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', gap: 12, paddingTop: 12 },
  title: { fontFamily: fonts.heading, fontSize: 30, lineHeight: 34, color: colors.ink, textAlign: 'center', marginTop: 4 },
  sub: { fontFamily: fonts.body, fontSize: 16, lineHeight: 23, color: colors.text2, textAlign: 'center', maxWidth: 300 },
  or: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 4 },
  line: { flex: 1, height: 1, backgroundColor: colors.inputBorder },
  label: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.ink },
  input: {
    height: 54,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: colors.accent,
    backgroundColor: colors.white,
    paddingHorizontal: 16,
    fontFamily: fonts.body,
    fontSize: 16,
    color: colors.ink,
  },
  sent: { borderRadius: 18, backgroundColor: '#EAF3EE', paddingVertical: 14, paddingHorizontal: 16, gap: 6 },
  sentTitle: { fontFamily: fonts.bodyBold, fontSize: 15, color: '#24503B' },
  sentBody: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: '#3D4B43' },
  sentLink: { fontFamily: fonts.bodyBold, fontSize: 14, color: '#24503B', paddingTop: 4, minHeight: 32 },
  error: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.accentDeep, textAlign: 'center' },
  legal: { fontFamily: fonts.body, fontSize: 13, lineHeight: 19, color: colors.caption, textAlign: 'center' },
  legalLink: { fontFamily: fonts.bodySemi, color: colors.accentText },
});
