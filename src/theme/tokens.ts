/**
 * Design tokens: palettes (palettes.ts), radii, spacing and type. Dark is the default theme.
 * Never use red for "over target".
 */
import { palettes, type Palette, type ThemeName } from './palettes';

let current: ThemeName = 'dark';
let version = 0;

/** The active theme. Set once before the first render and again on a switch (the app tree then remounts). */
export function themeName(): ThemeName {
  return current;
}
export function setThemeName(name: ThemeName) {
  if (name === current) return;
  current = name;
  version++;
}

/**
 * Live colour tokens: every read returns the active palette's value, so a
 * screen rendered after a theme switch gets the new colours.
 */
export const colors = Object.defineProperties(
  {},
  Object.fromEntries(Object.keys(palettes.dark).map((k) => [k, { enumerable: true, get: () => palettes[current][k as keyof Palette] }])),
) as Palette;

/**
 * Theme-aware module-level styles: `const styles = themed(() => StyleSheet.create({...}))`.
 * The factory runs once per theme; property reads go to the active theme's copy.
 */
export function themed<T extends object>(factory: () => T): T {
  const cache: Partial<Record<ThemeName, T>> = {};
  const get = () => (cache[current] ??= factory());
  return new Proxy({} as T, {
    get: (_, key) => {
      const target = get();
      const v = Reflect.get(target, key);
      return typeof v === 'function' ? v.bind(target) : v;
    },
    has: (_, key) => Reflect.has(get(), key),
    ownKeys: () => Reflect.ownKeys(get()),
    getOwnPropertyDescriptor: (_, key) => {
      const d = Reflect.getOwnPropertyDescriptor(get(), key);
      return d ? { ...d, configurable: true } : undefined;
    },
  });
}

/** Changes on every theme switch (used as a React key to remount the tree). */
export function themeVersion() {
  return version;
}

export const radius = {
  card: 24,
  pill: 28,
  option: 20,
  sm: 12,
  chip: 20,
  sheet: 28,
} as const;

export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  screen: 20,
  /** Gap between cards on a screen. */
  stack: 14,
  /** Inner padding of cards. */
  card: 18,
} as const;

/** Minimum touch target (px). */
export const hit = 44;

/** Fraunces for headings, Manrope for everything else (numbers included). */
export const fonts = {
  heading: 'Fraunces_600SemiBold',
  headingSemi: 'Fraunces_500Medium',
  number: 'Manrope_700Bold',
  body: 'Manrope_400Regular',
  bodyMedium: 'Manrope_500Medium',
  bodySemi: 'Manrope_600SemiBold',
  bodyBold: 'Manrope_700Bold',
} as const;

export const type = themed(() => ({
  display: { fontFamily: fonts.heading, fontSize: 38, lineHeight: 44, color: colors.ink, letterSpacing: -0.6 },
  h1: { fontFamily: fonts.heading, fontSize: 30, lineHeight: 36, color: colors.ink, letterSpacing: -0.6 },
  h2: { fontFamily: fonts.heading, fontSize: 22, lineHeight: 28, color: colors.ink },
  /** Card section title. */
  section: { fontFamily: fonts.bodyBold, fontSize: 17, lineHeight: 22, color: colors.ink },
  number: { fontFamily: fonts.number, fontSize: 26, lineHeight: 32, color: colors.ink, letterSpacing: -0.5 },
  /** The one main number on a screen. */
  hero: { fontFamily: fonts.number, fontSize: 44, lineHeight: 50, color: colors.ink, letterSpacing: -1 },
  body: { fontFamily: fonts.body, fontSize: 16, lineHeight: 22, color: colors.ink },
  bodySemi: { fontFamily: fonts.bodySemi, fontSize: 16, lineHeight: 22, color: colors.ink },
  label: { fontFamily: fonts.bodySemi, fontSize: 14, lineHeight: 18, color: colors.ink },
  secondary: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: colors.text2 },
  caption: { fontFamily: fonts.body, fontSize: 12, lineHeight: 16, color: colors.caption },
  link: { fontFamily: fonts.bodySemi, fontSize: 14, lineHeight: 18, color: colors.accentText },
} as const));
