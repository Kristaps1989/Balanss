import Anthropic from '@anthropic-ai/sdk';
import pino from 'pino';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { anthropicAi } from '../src/ai';
import type { ClaudeClient } from '../src/ai/claude';
import { fakeAnalyzeMeal, fakeParseText } from '../src/ai/fake-food';
import { fakeTip } from '../src/ai/tone-templates';
import type { ToneInput } from '../src/ai/tone';
import { EMPTY_HISTORY } from '../src/ai/tone-types';
import { authed, JPEG_BASE64, loginByEmail, makeApp, resetDb, type TestContext } from './helpers';

const log = pino({ level: 'silent' });
const create = vi.fn();
const client = { beta: { messages: { create } } } as unknown as ClaudeClient;
const ai = anthropicAi(client, 'claude-opus-5-5');

function reply(json: unknown, stop_reason = 'end_turn') {
  return {
    id: 'msg_test',
    type: 'message',
    role: 'assistant',
    model: 'claude-opus-5-5',
    stop_reason,
    stop_details: stop_reason === 'refusal' ? { type: 'refusal', category: null, explanation: null } : null,
    content: json === undefined ? [] : [{ type: 'text', text: typeof json === 'string' ? json : JSON.stringify(json) }],
    usage: { input_tokens: 1200, output_tokens: 300, cache_read_input_tokens: 1000, cache_creation_input_tokens: 0, iterations: [] },
  };
}

const input: ToneInput = {
  date: '2026-09-27',
  sex: 'f',
  tone: 'plan',
  modifiers: { softer: true, social: false, warm: true },
  nutrition: {
    kcal: { value: 1480, target: 1750 },
    proteinG: { value: 68, target: 110 },
    carbsG: { value: 160, target: 190 },
    fatG: { value: 52, target: 60 },
    fibreG: { value: 18, target: 25 },
    waterMl: { value: 1200, target: 2300 },
  },
  mealsLogged: ['breakfast', 'lunch', 'snack'],
  steps: { value: 6430, target: 8000 },
  sleep: { totalMin: 400, targetMin: 450, bedtime: '23:48', window: { start: '23:00', end: '23:30', basedOnNights: 14 } },
  week: { avgKcal: 1715, avgProteinG: 89, avgSteps: 7796, nightsInWindow: 2 },
  care: false,
  findings: [],
  history: EMPTY_HISTORY,
  preferences: { diet: 'any', avoid: [] },
};

beforeEach(() => create.mockReset());

describe('Anthropic provider request shape', () => {
  it('sends structured output, effort, server-side fallback and a cached system prompt', async () => {
    create.mockResolvedValueOnce(
      reply({
        items: [
          {
            name: 'Griķi, vārīti',
            grams: 180.4,
            per100g: { kcal: 92, proteinG: 3.4, carbsG: 20, fatG: 0.6, fibreG: 2.7 },
            confidence: 0.9,
            alternatives: [{ label: 'Rīsi', grams: 180, per100g: { kcal: 130, proteinG: 2.7, carbsG: 28, fatG: 0.3, fibreG: 0.4 } }],
            portionLabel: '',
          },
          {
            name: 'Mērce',
            grams: 40,
            per100g: { kcal: 320, proteinG: 1, carbsG: 6, fatG: 33, fibreG: 0 },
            confidence: 1.4,
            alternatives: [],
            portionLabel: null,
          },
        ],
      }),
    );
    const items = await ai.food.analyzeMeal(JPEG_BASE64, 'image/jpeg', log);
    // Re-validated: grams rounded, confidence clamped, alternatives dropped for confident items.
    expect(items[0]).toMatchObject({ name: 'Griķi, vārīti', grams: 180, confidence: 0.9, alternatives: [], portionLabel: null });
    expect(items[1]!.confidence).toBe(1);

    const params = create.mock.calls[0]![0];
    expect(params.model).toBe('claude-opus-5-5');
    expect(params.betas).toEqual(['server-side-fallback-2026-07-01']);
    expect(params.fallbacks).toBe('default');
    expect(params.thinking).toBeUndefined(); // adaptive thinking is the model default
    expect(params.output_config.effort).toBe('medium');
    expect(params.output_config.format.type).toBe('json_schema');
    expect(params.output_config.format.schema.properties.items).toBeTruthy();
    expect(params.system[0].cache_control).toEqual({ type: 'ephemeral' });
    expect(params.messages[0].content[0]).toMatchObject({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg' } });
  });

  it('uses low effort for parse-text and medium for tone copy', async () => {
    create.mockResolvedValueOnce(reply({ items: [] }));
    await ai.food.parseText('ābols', log);
    expect(create.mock.calls[0]![0].output_config.effort).toBe('low');
    create.mockResolvedValueOnce(reply({ angle: 'protein', body: 'Šodien trūkst 42 g olbaltumvielu. Plāns: biezpiens vakariņās (+18 g).', highlight: '42 g' }));
    const tip = await ai.tone.tip(input, [], log);
    expect(tip).toMatchObject({ angle: 'protein', body: 'Šodien trūkst 42 g olbaltumvielu. Plāns: biezpiens vakariņās (+18 g).', highlight: '42 g', aiGenerated: true });
    expect(create.mock.calls[1]![0].output_config.effort).toBe('medium');
    expect(create.mock.calls[1]![0].messages[0].content).toContain('"tone":"plan"');
  });
});

describe('fallback to the fake provider', () => {
  it('on thrown errors (network, 5xx)', async () => {
    create.mockRejectedValueOnce(new Anthropic.APIConnectionError({ message: 'connection reset' }));
    expect(await ai.food.analyzeMeal(JPEG_BASE64, 'image/jpeg', log)).toEqual(fakeAnalyzeMeal());
    create.mockRejectedValueOnce(new Error('boom'));
    expect(await ai.food.parseText('2 olas un maize', log)).toEqual(fakeParseText('2 olas un maize'));
    create.mockRejectedValueOnce(new Error('boom'));
    expect(await ai.tone.tip(input, [], log)).toEqual(fakeTip(input, []));
  });

  it('on stop_reason refusal and max_tokens', async () => {
    create.mockResolvedValueOnce(reply(undefined, 'refusal'));
    expect(await ai.food.analyzeMeal(JPEG_BASE64, 'image/jpeg', log)).toEqual(fakeAnalyzeMeal());
    create.mockResolvedValueOnce(reply('{"items": [', 'max_tokens'));
    expect(await ai.food.analyzeMeal(JPEG_BASE64, 'image/jpeg', log)).toEqual(fakeAnalyzeMeal());
  });

  it('on output that breaks the copy rules', async () => {
    create.mockResolvedValueOnce(reply({ angle: 'overall', body: 'Lieliski! 🎉 Turpini tā.', highlight: null }));
    expect((await ai.tone.tip(input, [], log)).body).toBe(fakeTip(input, []).body);
    create.mockResolvedValueOnce(reply({ question: 'Kā gāja?', options: [{ label: 'Labi', reply: 'Super.' }] }));
    const q = await ai.tone.weeklyQuestion(input, log);
    expect(q.options).toHaveLength(4);
    create.mockResolvedValueOnce(reply({ title: 'Ūdens', body: 'x'.repeat(200) }));
    expect((await ai.tone.pushCopy('water', input, undefined, log)).title).toBe('Ūdens: 1,2 no 2,3 l');
  });

  it('drops a highlight that is not in the body', async () => {
    create.mockResolvedValueOnce(reply({ angle: 'protein', body: 'Olbaltumvielas: 68 no 110 g.', highlight: '42 g' }));
    expect((await ai.tone.tip(input, [], log)).highlight).toBeNull();
  });
});

describe('through the HTTP API', () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await makeApp({ ai });
  });
  afterAll(() => ctx.app.close());

  it('POST /meals/analyze still answers when Claude fails', async () => {
    await resetDb();
    create.mockRejectedValue(new Anthropic.APIConnectionError({ message: 'down' }));
    const call = authed(ctx.app, (await loginByEmail(ctx.app, 'ai@example.lv')).accessToken);
    const res = await call({
      method: 'POST',
      url: '/v1/meals/analyze',
      payload: { imageBase64: JPEG_BASE64, mediaType: 'image/jpeg', takenAt: '2026-09-27T13:05:00+03:00' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().items).toHaveLength(4);
    expect(create).toHaveBeenCalled();
    create.mockReset();
  });
});
