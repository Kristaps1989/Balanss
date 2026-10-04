import pino from 'pino';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { LeisureResponse, Pantry, Tip } from '../../shared/api';
import { anthropicAi } from '../src/ai';
import type { ClaudeClient } from '../src/ai/claude';
import { claudeLeisureEngine, validateListings, type LeisureQuery, type RawListing } from '../src/ai/leisure';
import { fakeTip, pantryPicks } from '../src/ai/tone-templates';
import type { ToneInput } from '../src/ai/tone-types';
import { EMPTY_HISTORY } from '../src/ai/tone-types';
import { leisureWindow } from '../src/services/leisure';
import { authed, JPEG_BASE64, loginByEmail, makeApp, resetDb, type TestContext } from './helpers';

const log = pino({ level: 'silent' });
// Friday 2 October 2026, 18:00 in Riga (UTC+3).
const NOW = new Date('2026-10-02T15:00:00Z');
const at = (min: number) => new Date(NOW.getTime() + min * 60_000).toISOString();

describe('leisure window', () => {
  it('"today" runs from now + 30 min to 03:00 next morning', () => {
    const w = leisureWindow('Europe/Riga', NOW, 'today');
    expect(w.earliest.toISOString()).toBe('2026-10-02T15:30:00.000Z');
    expect(w.windowEnd.toISOString()).toBe('2026-10-03T00:00:00.000Z'); // 03:00 Riga next morning: late screenings still count as tonight
    expect(w.localDate).toBe('2026-10-02');
  });
  it('"weekend" on a Friday starts on Saturday and ends Sunday night', () => {
    const w = leisureWindow('Europe/Riga', NOW, 'weekend');
    expect(w.earliest.toISOString()).toBe('2026-10-02T21:00:00.000Z'); // Sat 00:00 Riga
    expect(w.windowEnd.toISOString()).toBe('2026-10-04T21:00:00.000Z'); // Sun 24:00 Riga
  });
  it('"weekend" on a Saturday starts now + 30 min', () => {
    const sat = new Date('2026-10-03T09:00:00Z');
    const w = leisureWindow('Europe/Riga', sat, 'weekend');
    expect(w.earliest.toISOString()).toBe('2026-10-03T09:30:00.000Z');
    expect(w.windowEnd.toISOString()).toBe('2026-10-04T21:00:00.000Z');
  });
});

const cinemaQ: LeisureQuery = {
  kind: 'movie',
  genre: 'comedy',
  where: 'cinema',
  when: 'today',
  city: 'Rīga',
  now: NOW,
  ...leisureWindow('Europe/Riga', NOW, 'today'),
};
const item = (over: Partial<RawListing>): RawListing => ({
  title: 'Filma',
  subtitle: null,
  description: 'Apraksts.',
  startsAt: at(120),
  venue: 'Kino',
  url: 'https://kino.lv/filma/a-2026',
  provider: 'cinema',
  ...over,
});

describe('validateListings', () => {
  const urls = new Set(['https://www.kino.lv/filma/a-2026/', 'https://go3.lv/movies/f-1']);
  it('keeps a screening later today with a link the search returned', () => {
    const out = validateListings([item({})], cinemaQ, urls);
    expect(out).toHaveLength(1);
    expect(out[0]!.url).toBe('https://www.kino.lv/filma/a-2026/'); // the search's own URL, not the model's copy
  });
  it('drops screenings that started, start within 30 min, or fall after 03:00', () => {
    expect(validateListings([item({ startsAt: at(-5) }), item({ startsAt: at(20) }), item({ startsAt: at(10 * 60) })], cinemaQ, urls)).toHaveLength(0); // 04:00 Riga: past the 03:00 cut-off
  });
  it('drops links the search never returned, and items without time', () => {
    expect(validateListings([item({ url: 'https://made-up.lv/x' }), item({ startsAt: null }), item({ startsAt: 'rīt vakarā' })], cinemaQ, urls)).toHaveLength(0);
  });
  it('Go3 items need a go3.lv link; books need neither link nor time', () => {
    const go3: LeisureQuery = { ...cinemaQ, where: 'go3', when: null };
    expect(validateListings([item({ url: 'https://go3.lv/movies/f-1', startsAt: null }), item({ url: 'https://www.kino.lv/filma/a-2026', startsAt: null })], go3, urls)).toHaveLength(1);
    const book: LeisureQuery = { ...cinemaQ, kind: 'book', where: null, when: null };
    expect(validateListings([item({ url: null, startsAt: null, provider: 'book' })], book, urls)).toHaveLength(1);
  });
  it('drops unsuitable events (gambling, alcohol-focused)', () => {
    expect(validateListings([item({ title: 'Vīna degustācija' }), item({ venue: 'Casino Riga' })], cinemaQ, urls)).toHaveLength(0);
  });
});

describe('Claude leisure engine (stubbed client)', () => {
  const create = vi.fn();
  const client = { beta: { messages: { create } } } as unknown as ClaudeClient;
  beforeEach(() => create.mockReset());
  const usage = { input_tokens: 900, output_tokens: 200, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, iterations: [] };

  it('searches with location + web_search, resumes a paused turn, extracts, then validates', async () => {
    create
      .mockResolvedValueOnce({
        model: 'claude-opus-5-5',
        stop_reason: 'pause_turn',
        content: [{ type: 'web_search_tool_result', tool_use_id: 't1', content: [{ type: 'web_search_result', url: 'https://kino.lv/filma/a-2026', title: 'Kino', encrypted_content: 'x', page_age: null }] }],
        usage,
      })
      .mockResolvedValueOnce({
        model: 'claude-opus-5-5',
        stop_reason: 'end_turn',
        content: [{ type: 'text', text: 'Komēdija "A" Kino, 20:00, https://kino.lv/filma/a-2026', citations: [] }],
        usage,
      })
      .mockResolvedValueOnce({
        model: 'claude-opus-5-5',
        stop_reason: 'end_turn',
        stop_details: null,
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              items: [item({ title: 'A', url: 'https://kino.lv/filma/a-2026' }), item({ title: 'B', url: 'https://invented.lv/b' }), item({ title: 'C', startsAt: at(-30) })],
            }),
          },
        ],
        usage,
      });
    const res = await claudeLeisureEngine(client, 'claude-opus-5-5').suggest(cinemaQ, log);
    expect(res.live).toBe(true);
    expect(res.items.map((i) => i.title)).toEqual(['A']);

    const first = create.mock.calls[0]![0];
    expect(first.tools[0]).toMatchObject({ type: 'web_search_20260209', name: 'web_search', user_location: { type: 'approximate', city: 'Rīga', country: 'LV', timezone: 'Europe/Riga' } });
    expect(first.fallbacks).toBe('default');
    // The paused turn is sent back as-is to resume (no extra "continue" message).
    const second = create.mock.calls[1]![0];
    expect(second.messages).toHaveLength(2);
    expect(second.messages[1].role).toBe('assistant');
    // Extraction is a structured-output call that sees the search URLs.
    const third = create.mock.calls[2]![0];
    expect(third.output_config.format).toBeDefined();
    expect(JSON.stringify(third.messages)).toContain('https://kino.lv/filma/a-2026');
  });

  it('falls back to timeless ideas (never invented events) when search fails', async () => {
    create.mockRejectedValueOnce(new Error('network'));
    const res = await anthropicAi(client, 'claude-opus-5-5').leisure.suggest({ ...cinemaQ, kind: 'event', genre: 'concert', where: null }, log);
    expect(res.live).toBe(false);
    expect(res.note).toMatch(/neizdevās/);
    expect(res.items.every((i) => i.startsAt === null && i.provider === 'idea')).toBe(true);
  });
});

describe('pantry-aware tip templates', () => {
  const base: ToneInput = {
    date: '2026-10-02',
    sex: 'f',
    tone: 'plan',
    modifiers: { softer: false, social: false, warm: false },
    nutrition: {
      kcal: { value: 900, target: 1750 },
      proteinG: { value: 30, target: 110 },
      carbsG: { value: 100, target: 190 },
      fatG: { value: 30, target: 60 },
      fibreG: { value: 6, target: 25 },
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
    pantry: ['olas', 'piens', 'auzu pārslas', 'āboli'],
    likedFoods: [],
  };
  it('uses only what is at home', () => {
    const tip = fakeTip(base);
    expect(tip.angle).toBe('protein');
    expect(tip.body).toContain('olas');
    expect(tip.body).toMatch(/mājās/);
  });
  it('respects diet: a vegan pantry pick never includes eggs or dairy', () => {
    expect(pantryPicks({ ...base, preferences: { diet: 'vegan', avoid: [] }, pantry: ['olas', 'jogurts', 'lēcas'] }, 'protein')).toEqual(['lēcas']);
  });
  it('skips food angles nothing at home fits instead of naming products to buy', () => {
    const tip = fakeTip({ ...base, pantry: ['kafija', 'cukurs'] });
    expect(tip.angle).not.toBe('protein');
    expect(tip.angle).not.toBe('fibre');
  });
  it('without a pantry, novelty ideas stay optional ("ja tas ir mājās")', () => {
    const tip = fakeTip({ ...base, tone: 'novelty', pantry: null });
    expect(tip.body).toContain('ja tas ir mājās');
  });
});

describe('pantry and leisure routes', () => {
  let ctx: TestContext;
  let now = NOW;
  beforeAll(async () => {
    ctx = await makeApp({ now: () => now });
  });
  afterAll(() => ctx.app.close());
  beforeEach(async () => {
    now = NOW;
    await resetDb();
  });

  async function user() {
    const t = await loginByEmail(ctx.app, 'ilze@example.lv');
    return authed(ctx.app, t.accessToken);
  }

  it('saves the pantry, scans a photo without saving, and refreshes the tip from it', async () => {
    const call = await user();
    expect(((await call({ method: 'GET', url: '/v1/pantry' })).json() as Pantry).fresh).toBe(false);

    const scan = await call({ method: 'POST', url: '/v1/pantry/scan', payload: { imageBase64: JPEG_BASE64 } });
    expect(scan.statusCode).toBe(200);
    expect(scan.json().items).toContain('olas');
    expect(((await call({ method: 'GET', url: '/v1/pantry' })).json() as Pantry).items).toEqual([]); // not stored by the scan

    const saved = (await call({ method: 'PUT', url: '/v1/pantry', payload: { items: [' Olas ', 'olas', 'Auzu pārslas'] } })).json() as Pantry;
    expect(saved).toMatchObject({ items: ['olas', 'auzu pārslas'], fresh: true });

    const before = (await call({ method: 'GET', url: '/v1/tips/today?date=2026-10-02' })).json() as Tip;
    const after = (await call({ method: 'POST', url: '/v1/tips/refresh?date=2026-10-02' })).json() as Tip;
    expect(after.id).not.toBe(before.id);
    expect(after.body).toMatch(/olas|auzu pārslas/);

    // Three days later the list is no longer "fresh".
    now = new Date(NOW.getTime() + 3 * 86_400_000 + 60_000);
    expect(((await call({ method: 'GET', url: '/v1/pantry' })).json() as Pantry).fresh).toBe(false);
  });

  it('needs a city, then returns only future screenings with links from the search', async () => {
    const call = await user();
    const body = { kind: 'movie', genre: 'comedy', where: 'cinema' };
    const noCity = await call({ method: 'POST', url: '/v1/leisure/suggest', payload: body });
    expect(noCity.json().error.code).toBe('city_required');

    expect((await call({ method: 'PUT', url: '/v1/me/city', payload: { city: 'Rīga' } })).json().leisureCity).toBe('Rīga');
    expect((await call({ method: 'PUT', url: '/v1/me/city', payload: { city: 'Atlantīda' } })).statusCode).toBe(400);

    const res = (await call({ method: 'POST', url: '/v1/leisure/suggest', payload: body })).json() as LeisureResponse;
    expect(res.city).toBe('Rīga');
    expect(res.live).toBe(true);
    expect(res.items.map((i) => i.title)).toEqual(['Vakara seanss: Komēdija']); // not the one that started, not in 10 min, not the invented link
    expect(new Date(res.items[0]!.startsAt!).getTime()).toBeGreaterThan(NOW.getTime() + 30 * 60_000);

    // 100 min later the cached 20:00 screening starts in 20 min: it is dropped and a new search runs.
    now = new Date(NOW.getTime() + 100 * 60_000);
    const later = (await call({ method: 'POST', url: '/v1/leisure/suggest', payload: body })).json() as LeisureResponse;
    expect(later.items.some((i) => i.startsAt === res.items[0]!.startsAt)).toBe(false);
    expect(later.items.every((i) => new Date(i.startsAt!).getTime() >= now.getTime() + 30 * 60_000)).toBe(true);
  });

  it('Go3 shows only go3.lv item pages; curated books link to a title search', async () => {
    const call = await user();
    await call({ method: 'PUT', url: '/v1/me/city', payload: { city: 'Liepāja' } });
    const go3 = (await call({ method: 'POST', url: '/v1/leisure/suggest', payload: { kind: 'movie', genre: 'drama', where: 'go3' } })).json() as LeisureResponse;
    expect(go3.items).toHaveLength(2); // not the non-Go3 link, not the go3.lv homepage
    expect(go3.items.every((i) => i.url?.startsWith('https://go3.lv/'))).toBe(true);

    const books = (await call({ method: 'POST', url: '/v1/leisure/suggest', payload: { kind: 'book', genre: 'latvian' } })).json() as LeisureResponse;
    expect(books.items.map((i) => i.title)).toContain('Mātes piens');
    expect(books.items.every((i) => i.url?.includes('tbm=bks') && i.startsAt === null)).toBe(true);
  });

  it('validates genre and limits live searches per day', async () => {
    const call = await user();
    await call({ method: 'PUT', url: '/v1/me/city', payload: { city: 'Rīga' } });
    expect((await call({ method: 'POST', url: '/v1/leisure/suggest', payload: { kind: 'book', genre: 'comedy' } })).statusCode).toBe(400);
    let last = 200;
    for (let i = 0; i < 16; i++) {
      // Books are never cached (not live), so every request counts.
      last = (await call({ method: 'POST', url: '/v1/leisure/suggest', payload: { kind: 'book', genre: 'novel' } })).statusCode;
    }
    expect(last).toBe(429);
  });
});
