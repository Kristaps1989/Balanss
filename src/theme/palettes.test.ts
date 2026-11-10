import { describe, expect, it } from 'vitest';

import { palettes, type Palette, type ThemeName } from './palettes';

/** WCAG 2.x relative luminance and contrast ratio. */
function luminance(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}
export function contrast(a: string, b: string) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

type Key = keyof Palette;
/** Text on its surface: 4.5:1 (WCAG AA body text). */
const TEXT: [Key, Key][] = [
  ['ink', 'bg'],
  ['ink', 'card'],
  ['text2', 'bg'],
  ['text2', 'card'],
  ['caption', 'bg'],
  ['caption', 'card'],
  ['accentText', 'bg'],
  ['accentText', 'card'],
  ['onAccent', 'commit'],
  ['onInk', 'ink'],
  ['onLime', 'lime'],
  ['tipText', 'lime'],
  ['accentDeep', 'accentSoft'],
  ['accentDeep', 'card'],
  ['moveDeep', 'moveSoft'],
  ['waterDeep', 'waterSoft'],
  ['notice', 'noticeSoft'],
  ['health', 'healthSoft'],
  ['sleepInk', 'sleepSoft'],
  ['sleepText2', 'sleepSoft'],
  ['sleepWindowText', 'sleepWindow'],
  ['white', 'sleepWindow'],
  ['ink', 'chip'],
];
/** Chart marks, icons and the + button against what they sit on: 3:1 (WCAG non-text). */
const GRAPHIC: [Key, Key][] = [
  ['kcal', 'card'],
  ['protein', 'card'],
  ['carbs', 'card'],
  ['fat', 'card'],
  ['fibre', 'card'],
  ['calcium', 'card'],
  ['steps', 'card'],
  ['water', 'card'],
  ['sleepDeep', 'card'],
  ['accent', 'bg'],
  ['accent', 'card'],
  ['coral', 'card'],
];

describe.each(Object.keys(palettes) as ThemeName[])('%s palette', (name) => {
  const p = palettes[name];

  it('has the same keys as the dark palette', () => {
    expect(Object.keys(p).sort()).toEqual(Object.keys(palettes.dark).sort());
  });

  it.each(TEXT)('text %s on %s ≥ 4.5:1', (fg, bg) => {
    expect(contrast(p[fg], p[bg])).toBeGreaterThanOrEqual(4.5);
  });

  it.each(GRAPHIC)('graphic %s on %s ≥ 3:1', (fg, bg) => {
    expect(contrast(p[fg], p[bg])).toBeGreaterThanOrEqual(3);
  });

  it('never uses red for nutrients (hue of every nutrient colour outside 345°–15°)', () => {
    for (const k of ['kcal', 'protein', 'carbs', 'fat', 'fibre', 'calcium', 'steps', 'water'] as Key[]) {
      const n = parseInt(p[k].slice(1), 16);
      const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255);
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      let h = 0;
      if (max !== min) {
        if (max === r) h = (60 * ((g - b) / (max - min)) + 360) % 360;
        else if (max === g) h = 60 * ((b - r) / (max - min)) + 120;
        else h = 60 * ((r - g) / (max - min)) + 240;
      }
      expect(h > 15 && h < 345, `${k} ${p[k]} hue ${h.toFixed(0)}`).toBe(true);
    }
  });
});
