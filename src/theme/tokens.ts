/**
 * Design tokens copied from the hi-fi prototype (see CLAUDE.md).
 * Never use red for "over target".
 */
export const colors = {
  bg: '#F7F3EE',
  card: '#FFFFFF',
  border: '#EFE8DE',

  ink: '#26231F',
  text2: '#5E5850',
  caption: '#6F685E',

  accent: '#D9693C',
  accentText: '#A9502A',
  commit: '#B9532A',
  accentSoft: '#FBEBE1',

  protein: '#56679A',
  carbs: '#C08A2E',
  fat: '#9A6F8F',
  fibre: '#5E8C74',
  steps: '#5E8C74',
  water: '#4F8DB8',
  waterSoft: '#E3F0F8',

  sleepDeep: '#3A4B7E',
  sleepRem: '#8494C6',
  sleepLight: '#C3CCE7',
  sleepWindow: '#26304F',

  white: '#FFFFFF',

  // Secondary tints used in the prototype.
  accentDeep: '#8A3F1F',
  tipText: '#2E2A25',
  kcalTrack: '#F4E2D5',
  proteinTrack: '#DDE2F0',
  carbsTrack: '#F2E4C8',
  fatTrack: '#EADDE6',
  fibreTrack: '#DCEAE1',
  stepsTrack: '#E3EEE7',
  moveSoft: '#E6EFE9',
  moveDeep: '#2F6049',
  waterDeep: '#1F5579',
  waterFill: '#9CC8E6',
  sleepSoft: '#EEF0F8',
  avatar: '#E9E1D5',
  chip: '#F2ECE3',
  neutralSoft: '#F1ECE4',
  handle: '#DDD5C9',
  navBorder: '#ECE5DA',
  scrim: 'rgba(38,35,31,0.42)',
  /** Neutral track behind progress bars and rings. */
  track: '#F1EBE3',
} as const;

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

export const fonts = {
  heading: 'BricolageGrotesque_700Bold',
  headingSemi: 'BricolageGrotesque_600SemiBold',
  body: 'Figtree_400Regular',
  bodyMedium: 'Figtree_500Medium',
  bodySemi: 'Figtree_600SemiBold',
  bodyBold: 'Figtree_700Bold',
} as const;

export const type = {
  display: { fontFamily: fonts.heading, fontSize: 40, lineHeight: 44, color: colors.ink },
  h1: { fontFamily: fonts.heading, fontSize: 30, lineHeight: 36, color: colors.ink, letterSpacing: -0.6 },
  h2: { fontFamily: fonts.heading, fontSize: 22, lineHeight: 28, color: colors.ink },
  /** Card section title (Figtree 17 bold in the prototype). */
  section: { fontFamily: fonts.bodyBold, fontSize: 17, lineHeight: 22, color: colors.ink },
  number: { fontFamily: fonts.heading, fontSize: 26, lineHeight: 32, color: colors.ink, letterSpacing: -0.5 },
  body: { fontFamily: fonts.body, fontSize: 16, lineHeight: 22, color: colors.ink },
  bodySemi: { fontFamily: fonts.bodySemi, fontSize: 16, lineHeight: 22, color: colors.ink },
  label: { fontFamily: fonts.bodySemi, fontSize: 14, lineHeight: 18, color: colors.ink },
  secondary: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: colors.text2 },
  caption: { fontFamily: fonts.body, fontSize: 12, lineHeight: 16, color: colors.caption },
  link: { fontFamily: fonts.bodySemi, fontSize: 14, lineHeight: 18, color: colors.accentText },
} as const;
