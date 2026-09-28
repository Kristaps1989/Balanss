import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { api } from '@/api';
import { useQuota } from '@/api/hooks';
import { Button } from '@/components/Button';
import { Icon } from '@/components/Icon';
import { useMealDraft } from '@/lib/mealDraft';
import { preparePhoto } from '@/lib/photo';
import { colors, fonts } from '@/theme';

type Mode = 'barcode' | 'photo';

/** Foto · kamera (prototype: Food-Camera.dc.html). */
export default function CameraScreen() {
  const insets = useSafeAreaInsets();
  const cam = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const params = useLocalSearchParams<{ mode?: string }>();
  const [mode, setMode] = useState<Mode>(params.mode === 'barcode' ? 'barcode' : 'photo');
  const [torch, setTorch] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const scanned = useRef(false);
  const quota = useQuota();
  const startPhoto = useMealDraft((s) => s.startPhoto);
  const startItems = useMealDraft((s) => s.startItems);

  const left = quota.data?.photoAnalysesLeft;
  const limit = quota.data?.photoAnalysesLimit;
  const noneLeft = left === 0;

  const handleUri = async (uri: string, width?: number) => {
    setBusy(true);
    try {
      startPhoto(await preparePhoto(uri, width));
      router.replace('/nutrition/analyzing');
    } catch {
      setMessage('Neizdevās apstrādāt foto. Mēģini vēlreiz.');
    } finally {
      setBusy(false);
    }
  };

  const shoot = async () => {
    if (!cam.current || busy) return;
    const pic = await cam.current.takePictureAsync({ quality: 0.8, skipProcessing: false });
    if (pic) await handleUri(pic.uri, pic.width);
  };

  const pickFromGallery = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9 });
    if (!res.canceled && res.assets[0]) await handleUri(res.assets[0].uri, res.assets[0].width);
  };

  const onBarcode = async (r: BarcodeScanningResult) => {
    if (scanned.current) return;
    scanned.current = true;
    setBusy(true);
    try {
      const { item } = await api.barcode(r.data);
      if (item) {
        startItems([item], 'barcode');
        router.replace('/nutrition/result');
      } else {
        setMessage('Šo produktu neatradām. Pamēģini ar foto vai tekstu.');
        setTimeout(() => (scanned.current = false), 2500);
      }
    } catch {
      setMessage('Neizdevās pārbaudīt svītrkodu.');
      setTimeout(() => (scanned.current = false), 2500);
    } finally {
      setBusy(false);
    }
  };

  const granted = permission?.granted;
  const quotaLabel = limit === null ? 'Pro · foto bez limita' : left !== undefined ? `Šodien atlikušas ${left} no ${limit} analīzēm` : ' ';

  return (
    <View style={styles.root} testID="camera">
      {granted ? (
        <CameraView
          ref={cam}
          style={StyleSheet.absoluteFill}
          facing="back"
          enableTorch={torch}
          barcodeScannerSettings={mode === 'barcode' ? { barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e'] } : undefined}
          onBarcodeScanned={mode === 'barcode' ? onBarcode : undefined}
        />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.noCam]}>
          <Icon name="camera" color={colors.white} size={40} />
          <Text style={styles.noCamText}>
            {permission?.canAskAgain === false
              ? 'Kamerai nav atļaujas. Vari izvēlēties foto no galerijas.'
              : 'Lai nofotografētu maltīti, atļauj piekļuvi kamerai.'}
          </Text>
          {permission?.canAskAgain !== false && <Button label="Atļaut kameru" variant="light" size="md" onPress={requestPermission} />}
        </View>
      )}

      {granted && (
        <View style={styles.frame} pointerEvents="none">
          <View style={[styles.corner, { left: 0, top: 0, borderLeftWidth: 3, borderTopWidth: 3, borderTopLeftRadius: 14 }]} />
          <View style={[styles.corner, { right: 0, top: 0, borderRightWidth: 3, borderTopWidth: 3, borderTopRightRadius: 14 }]} />
          <View style={[styles.corner, { left: 0, bottom: 0, borderLeftWidth: 3, borderBottomWidth: 3, borderBottomLeftRadius: 14 }]} />
          <View style={[styles.corner, { right: 0, bottom: 0, borderRightWidth: 3, borderBottomWidth: 3, borderBottomRightRadius: 14 }]} />
        </View>
      )}

      <View style={[styles.top, { top: insets.top + 12 }]}>
        <RoundDark icon="close" label="Aizvērt" onPress={() => (router.canGoBack() ? router.back() : router.replace('/nutrition'))} />
        {mode === 'photo' ? (
          <View style={styles.pill}>
            <Text style={styles.pillText} testID="quota-label">
              {quotaLabel}
            </Text>
          </View>
        ) : (
          <View />
        )}
        {Platform.OS !== 'web' && granted ? (
          <RoundDark icon="flash" label="Zibspuldze" onPress={() => setTorch((t) => !t)} active={torch} />
        ) : (
          <View style={{ width: 44 }} />
        )}
      </View>

      <View style={[styles.hintWrap, { top: insets.top + 120 }]} pointerEvents="none">
        <View style={styles.hint}>
          <Text style={styles.hintText}>
            {message ?? (mode === 'barcode' ? 'Novieto svītrkodu rāmī' : noneLeft ? 'Šodienas foto analīzes izmantotas' : 'Novieto šķīvi rāmī')}
          </Text>
        </View>
      </View>

      <View style={[styles.bottom, { paddingBottom: Math.max(insets.bottom, 16) + 24 }]}>
        <View style={styles.modes}>
          <ModeTab label="Svītrkods" on={mode === 'barcode'} onPress={() => { setMessage(null); setMode('barcode'); }} />
          <ModeTab label="Foto" on={mode === 'photo'} onPress={() => { setMessage(null); setMode('photo'); }} />
          <ModeTab label="Teksts" on={false} onPress={() => router.replace('/food-add')} />
        </View>
        <View style={styles.controls}>
          <Pressable
            onPress={pickFromGallery}
            disabled={busy || noneLeft || mode !== 'photo'}
            accessibilityRole="button"
            accessibilityLabel="Izvēlēties no galerijas"
            testID="gallery"
            style={({ pressed }) => [styles.gallery, (pressed || busy || noneLeft || mode !== 'photo') && { opacity: 0.5 }]}>
            <Icon name="image" color={colors.white} />
          </Pressable>
          {noneLeft && mode === 'photo' ? (
            <Pressable onPress={() => router.push('/me/pro')} accessibilityRole="button" style={styles.proLink}>
              <Text style={styles.proText}>Pro — foto bez limita</Text>
            </Pressable>
          ) : (
            <Pressable
              onPress={shoot}
              disabled={!granted || busy || mode !== 'photo'}
              accessibilityRole="button"
              accessibilityLabel="Uzņemt foto"
              style={({ pressed }) => [styles.shutter, (pressed || !granted || mode !== 'photo') && { opacity: 0.6 }]}>
              {busy ? <ActivityIndicator color={colors.white} /> : <View style={styles.shutterInner} />}
            </Pressable>
          )}
          <View style={{ width: 52, height: 52 }} />
        </View>
      </View>
    </View>
  );
}

function RoundDark({ icon, label, onPress, active }: { icon: 'close' | 'flash'; label: string; onPress: () => void; active?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={active !== undefined ? { selected: active } : undefined}
      style={[styles.round, active && { backgroundColor: 'rgba(245,180,143,0.6)' }]}>
      <Icon name={icon} color={colors.white} size={20} />
    </Pressable>
  );
}

function ModeTab({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="tab" accessibilityState={{ selected: on }} style={[styles.mode, on && styles.modeOn]}>
      <Text style={[styles.modeText, { color: on ? '#F5B48F' : '#BDB5AA' }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#1D1B19' },
  noCam: { backgroundColor: '#4A4038', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 32, paddingBottom: 220 },
  noCamText: { fontFamily: fonts.bodySemi, fontSize: 16, color: colors.white, textAlign: 'center', lineHeight: 22 },
  frame: { position: 'absolute', alignSelf: 'center', top: '28%', width: 300, height: 300 },
  corner: { position: 'absolute', width: 36, height: 36, borderColor: colors.white },
  top: { position: 'absolute', left: 16, right: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  round: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
  pill: { height: 36, paddingHorizontal: 14, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center' },
  pillText: { fontFamily: fonts.bodySemi, fontSize: 13, color: colors.white },
  hintWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  hint: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.5)', maxWidth: 320 },
  hintText: { fontFamily: fonts.bodySemi, fontSize: 15, color: colors.white, textAlign: 'center' },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: '#1D1B19', paddingTop: 18, paddingHorizontal: 28, gap: 22 },
  modes: { flexDirection: 'row', justifyContent: 'center', gap: 22 },
  mode: { paddingVertical: 6, paddingHorizontal: 4, minHeight: 44, justifyContent: 'center' },
  modeOn: { borderBottomWidth: 2, borderBottomColor: '#F5B48F' },
  modeText: { fontFamily: fonts.bodySemi, fontSize: 14 },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  gallery: { width: 52, height: 52, borderRadius: 14, backgroundColor: '#3A3530', alignItems: 'center', justifyContent: 'center' },
  shutter: { width: 82, height: 82, borderRadius: 41, borderWidth: 4, borderColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  shutterInner: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.white },
  proLink: { height: 56, paddingHorizontal: 18, borderRadius: 28, backgroundColor: colors.accent, justifyContent: 'center' },
  proText: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.white },
});
