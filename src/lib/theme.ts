import { useEffect } from 'react';
import { useColorScheme } from 'react-native';
import { create } from 'zustand';

import { setThemeName, type ThemeName } from '@/theme';

import { secureStore } from './storage';

/** Izskats: dark is the default; "Kā tālrunī" follows the phone's setting. */
export type ThemePref = 'dark' | 'light' | 'system';
export const THEME_PREFS: { value: ThemePref; label: string }[] = [
  { value: 'dark', label: 'Tumšs' },
  { value: 'light', label: 'Gaišs' },
  { value: 'system', label: 'Kā tālrunī' },
];

const KEY = 'balanss.theme';

interface ThemeState {
  pref: ThemePref;
  loaded: boolean;
  /** Where to go after the app tree remounts for a switch (the screen the switch was made on). */
  returnTo: string | null;
  setPref: (pref: ThemePref, returnTo?: string) => void;
  clearReturn: () => void;
}

export const useThemeStore = create<ThemeState>((set) => ({
  pref: 'dark',
  loaded: false,
  returnTo: null,
  setPref: (pref, returnTo) => {
    set({ pref, returnTo: returnTo ?? null });
    secureStore.set(KEY, pref).catch(() => undefined);
  },
  clearReturn: () => set({ returnTo: null }),
}));

export function resolveTheme(pref: ThemePref, system: string | null | undefined): ThemeName {
  if (pref === 'system') return system === 'light' ? 'light' : 'dark';
  return pref;
}

/**
 * Loads the saved preference once and returns the active theme, or null until
 * it is known. The module-level theme is set before children render, so every
 * style read in this render already uses the new palette.
 */
export function useActiveTheme(): ThemeName | null {
  const system = useColorScheme();
  const { pref, loaded } = useThemeStore();
  useEffect(() => {
    if (loaded) return;
    secureStore
      .get(KEY)
      .catch(() => null)
      .then((v) => useThemeStore.setState({ loaded: true, ...(v === 'dark' || v === 'light' || v === 'system' ? { pref: v } : {}) }));
  }, [loaded]);
  if (!loaded) return null;
  const name = resolveTheme(pref, system);
  setThemeName(name);
  return name;
}
