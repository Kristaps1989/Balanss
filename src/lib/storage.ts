import { Platform } from 'react-native';

/**
 * Small key-value store for secrets (auth tokens).
 * Native: expo-secure-store (Keystore / Keychain). Web: localStorage.
 */
type Store = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
};

function webStore(): Store {
  const ls = () => {
    try {
      return globalThis.localStorage;
    } catch {
      return undefined;
    }
  };
  return {
    async get(k) {
      return ls()?.getItem(k) ?? null;
    },
    async set(k, v) {
      ls()?.setItem(k, v);
    },
    async remove(k) {
      ls()?.removeItem(k);
    },
  };
}

function nativeStore(): Store {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const SecureStore = require('expo-secure-store') as typeof import('expo-secure-store');
  return {
    get: (k) => SecureStore.getItemAsync(k),
    set: (k, v) => SecureStore.setItemAsync(k, v),
    remove: (k) => SecureStore.deleteItemAsync(k),
  };
}

export const secureStore: Store = Platform.OS === 'web' ? webStore() : nativeStore();
