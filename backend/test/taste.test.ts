import { describe, expect, it } from 'vitest';

import { isItemPage, validateListings, type LeisureQuery, type RawListing } from '../src/ai/leisure';
import { fakePushCopy, fakeTip } from '../src/ai/tone-templates';
import { dayData } from '../src/ai/tone';
import type { ToneInput } from '../src/ai/tone-types';
import { EMPTY_HISTORY } from '../src/ai/tone-types';
import { rankFoods } from '../src/services/taste';

const base: ToneInput = {
  date: '2026-10-05',
  sex: 'f',
  tone: 'plan',
  modifiers: { softer: false, social: false, warm: false },
  nutrition: {
    kcal: { value: 900, target: 1750 },
    proteinG: { value: 30, target: 110 },
    carbsG: { value: 100, target: 190 },
    fatG: { value: 30, target: 60 },
    fibreG: { value: 20, target: 25 },
    waterMl: { value: 2300, target: 2300 },
  },
  mealsLogged: ['breakfast'],
  steps: { value: 9000, target: 8000 },
  sleep: null,
  week: null,
  care: false,
  findings: [],
  history: EMPTY_HISTORY,
  preferences: { diet: 'any', avoid: [] },
  pantry: null,
  likedFoods: ['Biezpiens', 'Olas, vārītas', 'Rupjmaize'],
};

describe('taste profile', () => {
  it('ranks the foods logged most often, favourites counting double, drinks left out', () => {
    expect(rankFoods(['Olas, vārītas', 'Kafija ar pienu', 'olas, vārītas', 'Rupjmaize', 'Ūdens'], ['Auzu putra ar ogām'])).toEqual(['Auzu putra ar ogām', 'Olas, vārītas', 'Rupjmaize']);
    expect(rankFoods(Array.from({ length: 20 }, (_, i) => `Ēdiens ${i}`))).toHaveLength(8);
  });

  it('protein tip names a food the user eats often, respecting diet', () => {
    const tip = fakeTip(base);
    expect(tip.angle).toBe('protein');
    expect(tip.body).toMatch(/biezpiens/i);
    expect(tip.body).toMatch(/ēd bieži/);
    const vegan = fakeTip({ ...base, preferences: { diet: 'vegan', avoid: [] }, likedFoods: ['Biezpiens', 'Lēcu zupa'] });
    expect(vegan.body).not.toMatch(/biezpiens/i);
    expect(vegan.body).toMatch(/lēcu zupa/i);
  });

  it('a known pantry wins over liked foods', () => {
    const tip = fakeTip({ ...base, pantry: ['tofu'] });
    expect(tip.body).toContain('tofu');
    expect(tip.body).not.toMatch(/biezpiens/i);
  });

  it('meal reminders name a concrete option', () => {
    expect(fakePushCopy('food', base, 'dinner').body).toContain('Biezpiens');
    expect(fakePushCopy('food', { ...base, pantry: ['olas'] }, 'lunch').body).toContain('olas');
    expect(fakePushCopy('food', { ...base, likedFoods: [] }, 'lunch').body).toMatch(/biezpiens vai jogurts/);
  });

  it('sends liked foods and the habits note to the AI, as written', () => {
    const d = dayData({ ...base, preferences: { diet: 'any', avoid: [], habits: 'Pirms katras maltītes apēdu dārzeņus' } });
    expect(d.likedFoods).toEqual(['Biezpiens', 'Olas, vārītas', 'Rupjmaize']);
    expect(d.preferences.habits).toBe('Pirms katras maltītes apēdu dārzeņus');
  });
});

describe('deep links', () => {
  it('tells item pages from homepages, listings and search pages', () => {
    expect(isItemPage('https://go3.lv/movies/straume-2024')).toBe(true);
    expect(isItemPage('https://www.forumcinemas.lv/event/304812/')).toBe(true);
    expect(isItemPage('https://www.bilesuparadize.lv/lv/event/12345')).toBe(true);
    expect(isItemPage('https://go3.lv/')).toBe(false);
    expect(isItemPage('https://go3.lv/movies')).toBe(false);
    expect(isItemPage('https://www.janisroze.lv/lv/search?q=matees')).toBe(false);
    expect(isItemPage('https://www.bilesuserviss.lv/lv/pasakumi/')).toBe(false);
  });

  it('drops live listings whose only link is a homepage, keeps curated title search links', () => {
    const now = new Date('2026-10-05T15:00:00Z');
    const q: LeisureQuery = { kind: 'movie', genre: 'drama', where: 'go3', when: null, city: 'Rīga', now, earliest: now, windowEnd: now, localDate: '2026-10-05' };
    const raw: RawListing[] = [
      { title: 'Filma', subtitle: null, description: 'x', startsAt: null, venue: null, url: 'https://go3.lv/', provider: 'go3' },
      { title: 'Filma 2', subtitle: null, description: 'x', startsAt: null, venue: null, url: 'https://go3.lv/movies/filma-2', provider: 'go3' },
    ];
    expect(validateListings(raw, q, new Set(['https://go3.lv/', 'https://go3.lv/movies/filma-2'])).map((i) => i.title)).toEqual(['Filma 2']);
    const book: LeisureQuery = { ...q, kind: 'book', where: null };
    const curated = validateListings([{ title: 'Mātes piens', subtitle: 'Nora Ikstena', description: 'x', startsAt: null, venue: null, url: 'https://www.google.com/search?tbm=bks&q=M%C4%81tes', provider: 'book' }], book, null);
    expect(curated[0]!.url).toContain('tbm=bks');
  });
});
