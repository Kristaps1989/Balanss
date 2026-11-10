/**
 * Colour palettes. "Premium wellness", not medical: warm near-black (dark) or
 * cream (light), forest green brand, lime and coral accents, one colour per
 * nutrient. Never red for "over target".
 *
 * Both palettes have exactly the same keys; screens only use the semantic
 * names (`colors.card`, `colors.protein`, ...), never raw hex values.
 * Contrast is checked in palettes.test.ts (text 4.5:1, charts 3:1).
 */
export const dark = {
  bg: '#121513',
  card: '#1C201D',
  border: '#2A2F2B',

  ink: '#F2F1EC',
  text2: '#B8BCB6',
  caption: '#A2A79F',

  /** Brand: forest green, lifted to mint so it reads on near-black. */
  accent: '#6CCB94',
  accentText: '#7FD3A2',
  commit: '#6CCB94',
  onAccent: '#0E1A13',
  accentSoft: '#1F2E25',
  accentDeep: '#A8E3C0',

  lime: '#CFE884',
  onLime: '#1A2410',
  limeDeep: '#3D4C12',
  coral: '#F29468',

  kcal: '#6CCB94',
  protein: '#F29468',
  carbs: '#EDC060',
  fat: '#C29BDB',
  fibre: '#A3C96B',
  calcium: '#7FA8F2',
  steps: '#5CC6B4',
  water: '#5FBFE3',
  waterSoft: '#1B3039',

  sleepDeep: '#7486D6',
  sleepRem: '#9AA9EC',
  sleepLight: '#C9D1F5',
  sleepWindow: '#1C2340',

  white: '#FFFFFF',
  /** Text and icons on an `ink` fill (selected chips, badges). */
  onInk: '#121513',

  tipText: '#1A2410',
  kcalTrack: '#26302A',
  proteinTrack: '#3A2A25',
  carbsTrack: '#3A3322',
  fatTrack: '#33293A',
  fibreTrack: '#2C3324',
  calciumTrack: '#25304A',
  stepsTrack: '#203330',
  moveSoft: '#1D2E28',
  moveDeep: '#8FDCC0',
  waterDeep: '#9ED8EE',
  waterFill: '#3E7FA0',
  sleepSoft: '#232A42',
  avatar: '#262B27',
  chip: '#262B27',
  neutralSoft: '#232824',
  handle: '#3A403B',
  navBorder: '#262B27',
  scrim: 'rgba(0,0,0,0.6)',
  inputBorder: '#3A403B',
  optionBorder: '#2D332E',
  toggleOff: '#454B46',
  boxBorder: '#7A807A',
  muted: '#8A908A',
  barMuted: '#3A403B',
  track: '#272C28',
  /** Device brand tints (Apple Health heart). */
  healthSoft: '#3A2629',
  health: '#F28C9B',
  /** Quiet amber for the care card and other "notice" surfaces (never alarm red). */
  noticeSoft: '#332B1C',
  notice: '#EDC060',
  /** Hairline between rows (cards themselves have no border). */
  divider: '#262B27',
  onInk2: '#3A403B',
  sleepInk: '#DDE2FA',
  sleepText2: '#AEB7DE',
  sleepWindowText: '#C9D1EA',
  sleepWindowBar: '#3A4670',
  /** Warm peach: the sleep window and the scan line while a photo is analysed. */
  glow: '#F5B48F',
  shadow: '#000000',
} as const;

export type Palette = { readonly [K in keyof typeof dark]: string };

export const light: Palette = {
  bg: '#F6F2EA',
  card: '#FFFFFF',
  border: '#ECE6DA',

  ink: '#1F2420',
  text2: '#525852',
  caption: '#636963',

  accent: '#2F6B4F',
  accentText: '#2A6148',
  commit: '#2F6B4F',
  onAccent: '#FFFFFF',
  accentSoft: '#E3EFE6',
  accentDeep: '#1F4A36',

  lime: '#D6EE8A',
  onLime: '#1E2A12',
  limeDeep: '#3D4C12',
  coral: '#D16B3A',

  kcal: '#3C8A63',
  protein: '#D16B3A',
  carbs: '#B07A12',
  fat: '#8E6BA8',
  fibre: '#5F8B3A',
  calcium: '#4E73C7',
  steps: '#2A8576',
  water: '#2F86B0',
  waterSoft: '#E1F0F7',

  sleepDeep: '#3A4B7E',
  sleepRem: '#7F90C8',
  sleepLight: '#B9C4E6',
  sleepWindow: '#232B45',

  white: '#FFFFFF',
  onInk: '#FFFFFF',

  tipText: '#1E2A12',
  kcalTrack: '#E3EEE7',
  proteinTrack: '#F8E3DA',
  carbsTrack: '#F4E9CF',
  fatTrack: '#ECE3F2',
  fibreTrack: '#E5EEDB',
  calciumTrack: '#E1E8F7',
  stepsTrack: '#DCEEEA',
  moveSoft: '#E3F0EA',
  moveDeep: '#245E46',
  waterDeep: '#1D5878',
  waterFill: '#9CCBE4',
  sleepSoft: '#EEF0F8',
  avatar: '#E6E0D3',
  chip: '#EFEAE0',
  neutralSoft: '#F0ECE3',
  handle: '#D9D2C5',
  navBorder: '#E9E3D8',
  scrim: 'rgba(20,24,20,0.45)',
  inputBorder: '#DED7CA',
  optionBorder: '#E8E2D6',
  toggleOff: '#D3CCBF',
  boxBorder: '#AEA79B',
  muted: '#878C86',
  barMuted: '#D9D3C6',
  track: '#EEEAE1',
  healthSoft: '#FCE7EA',
  health: '#A8364C',
  noticeSoft: '#F6E7CF',
  notice: '#7A5410',
  divider: '#F0EAE1',
  onInk2: '#D9D4CB',
  sleepInk: '#1F2A4D',
  sleepText2: '#414B6E',
  sleepWindowText: '#C9D1EA',
  sleepWindowBar: '#3A4670',
  glow: '#F5B48F',
  shadow: '#000000',
};

export const palettes = { dark, light } as const;
export type ThemeName = keyof typeof palettes;
