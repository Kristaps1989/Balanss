import { create } from 'zustand';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius, space, type } from '@/theme';

import { Button } from './Button';

interface ConfirmRequest {
  title: string;
  message?: string;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  resolve: (ok: boolean) => void;
}

const useConfirmStore = create<{ req: ConfirmRequest | null; set: (r: ConfirmRequest | null) => void }>((set) => ({
  req: null,
  set: (req) => set({ req }),
}));

/** Cross-platform confirm dialog (Alert.alert does nothing on web). */
export function confirm(opts: Omit<ConfirmRequest, 'resolve'>): Promise<boolean> {
  return new Promise((resolve) => useConfirmStore.getState().set({ ...opts, resolve }));
}

export function ConfirmHost() {
  const req = useConfirmStore((s) => s.req);
  const set = useConfirmStore((s) => s.set);
  const done = (ok: boolean) => {
    req?.resolve(ok);
    set(null);
  };
  return (
    <Modal visible={!!req} transparent animationType="fade" onRequestClose={() => done(false)}>
      <View style={styles.root}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => done(false)} accessibilityLabel="Atcelt" />
        <View style={styles.card} accessibilityViewIsModal accessibilityRole="alert">
          <Text style={type.h2}>{req?.title}</Text>
          {req?.message ? <Text style={[type.secondary, { fontSize: 15, lineHeight: 22 }]}>{req.message}</Text> : null}
          <View style={{ gap: 10, marginTop: space.sm }}>
            <Button label={req?.confirmLabel ?? 'Labi'} variant={req?.destructive ? 'accent' : 'dark'} onPress={() => done(true)} size="md" />
            <Button label={req?.cancelLabel ?? 'Atcelt'} variant="light" onPress={() => done(false)} size="md" />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.scrim, alignItems: 'center', justifyContent: 'center', padding: space.screen },
  card: { width: '100%', maxWidth: 420, backgroundColor: colors.card, borderRadius: radius.card, padding: space.xxl, gap: space.md },
});
