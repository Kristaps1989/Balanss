import { describe, expect, it } from 'vitest';

import { itemList, syncedAgo } from './format';

describe('syncedAgo', () => {
  const now = new Date('2026-11-10T18:00:00Z');
  const ago = (min: number) => new Date(now.getTime() - min * 60000).toISOString();
  it('reads naturally in Latvian', () => {
    expect(syncedAgo(ago(0), now)).toBe('tikko');
    expect(syncedAgo(ago(5), now)).toBe('pirms 5 min');
    expect(syncedAgo(ago(180), now)).toBe('pirms 3 h');
    expect(syncedAgo(ago(3 * 24 * 60), now)).toMatch(/^\d\d\.\d\d\.$/);
  });
});

describe('itemList', () => {
  it('lower-cases items after the first, keeping acronyms', () => {
    expect(itemList(['Auzu putra', 'Kafija ar pienu', 'BCAA dzēriens'])).toBe('Auzu putra, kafija ar pienu, BCAA dzēriens');
  });
});
