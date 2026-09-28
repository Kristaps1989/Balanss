import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { api } from '@/api';
import { Button } from '@/components/Button';
import { Loading } from '@/components/States';
import { colors, space, type } from '@/theme';

/** Magic-link landing: balanss://auth?token=… (or /auth?token=… on web). */
export default function AuthLink() {
  const { token } = useLocalSearchParams<{ token?: string }>();
  const [failed, setFailed] = useState(false);
  const done = useRef(false);
  useEffect(() => {
    if (!token || done.current) return;
    done.current = true;
    api
      .verifyMagicLink(token)
      .then(() => router.replace('/'))
      .catch(() => setFailed(true));
  }, [token]);
  if (!token || failed) {
    return (
      <View style={styles.root}>
        <Text style={type.h2}>Saite vairs nav derīga</Text>
        <Text style={type.secondary}>Pieslēgšanās saite der 15 minūtes un tikai vienu reizi. Pieprasi jaunu.</Text>
        <Button label="Uz pieslēgšanos" onPress={() => router.replace('/login')} />
      </View>
    );
  }
  return <Loading label="Pieslēdzos…" />;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, justifyContent: 'center', padding: space.xxl, gap: space.md },
});
