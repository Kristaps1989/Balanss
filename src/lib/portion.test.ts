import { describe, expect, it } from 'vitest';

import { portionMax, valueAt } from './portion';

describe('portion slider', () => {
  it('range comes from the first estimate and is bounded', () => {
    expect(portionMax(180)).toBe(400);
    expect(portionMax(60)).toBe(300);
    expect(portionMax(5_000)).toBe(2000);
    expect(portionMax(Number.NaN)).toBe(300);
  });

  it('a drag can never go past the range (no runaway)', () => {
    const max = portionMax(180);
    let grams = 180;
    // Old bug: max was recomputed from the current grams on every move, so the same
    // finger position kept doubling the value. With a fixed range it settles at max.
    for (let i = 0; i < 20; i++) grams = valueAt(320, 300, 0, max, 5);
    expect(grams).toBe(max);
    expect(valueAt(150, 300, 0, max, 5)).toBe(200);
    expect(valueAt(-40, 300, 0, max, 5)).toBe(0);
    expect(valueAt(10, 0, 0, max, 5)).toBe(0);
  });
});
