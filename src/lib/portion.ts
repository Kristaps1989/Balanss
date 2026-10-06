/** Grams the portion slider can reach, fixed from the first estimate: 2 × estimate, 300–2 000 g, in 50 g steps. */
export const PORTION_MIN_MAX = 300;
export const PORTION_MAX_MAX = 2000;

export function portionMax(estimateGrams: number): number {
  const g = Number.isFinite(estimateGrams) ? Math.max(0, estimateGrams) : 0;
  return Math.min(PORTION_MAX_MAX, Math.max(PORTION_MIN_MAX, Math.ceil((g * 2) / 50) * 50));
}

/** Value at a horizontal position on the track, snapped to `step` and clamped to [min, max]. */
export function valueAt(x: number, width: number, min: number, max: number, step: number): number {
  const ratio = width > 0 ? Math.max(0, Math.min(1, x / width)) : 0;
  const v = Math.round((min + ratio * (max - min)) / step) * step;
  return Math.max(min, Math.min(max, v));
}
