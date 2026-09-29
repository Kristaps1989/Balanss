import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { Me } from '../../shared/api';
import { SAMPLE_ANSWERS } from '../../shared/personality';
import { personalities } from '../src/db/schema';
import { authed, db, loginByEmail, makeApp, resetDb, type TestContext } from './helpers';

let ctx: TestContext;
let call: ReturnType<typeof authed>;

beforeAll(async () => {
  ctx = await makeApp();
});
afterAll(() => ctx.app.close());
beforeEach(async () => {
  await resetDb();
  const t = await loginByEmail(ctx.app, 'ilze@example.lv');
  call = authed(ctx.app, t.accessToken);
});

const ilzeBasics = {
  firstName: 'Ilze',
  age: 34,
  heightCm: 168,
  weightKg: 71,
  sex: 'f',
  activity: 'light',
  goals: ['weight', 'routine'],
  weightDirection: 'down',
  goalWeightKg: 66,
};

describe('profile and targets', () => {
  it('PUT /me/profile recomputes targets from the profile', async () => {
    const res = await call({ method: 'PUT', url: '/v1/me/profile', payload: ilzeBasics });
    expect(res.statusCode).toBe(200);
    const me = res.json() as Me;
    expect(me.profile).toEqual(ilzeBasics);
    expect(me.targets).toEqual({ kcal: 1750, proteinG: 110, carbsG: 190, fatG: 60, fibreG: 25, waterMl: 2300, steps: 8000, sleepMin: 450 });
  });

  it('stops recomputing once targets were edited manually', async () => {
    await call({ method: 'PUT', url: '/v1/me/profile', payload: ilzeBasics });
    const t = await call({ method: 'PUT', url: '/v1/me/targets', payload: { steps: 9000, waterMl: 2500 } });
    expect(t.json().targets).toMatchObject({ kcal: 1750, steps: 9000, waterMl: 2500 });
    const p = await call({ method: 'PUT', url: '/v1/me/profile', payload: { weightKg: 80 } });
    expect(p.json().profile.weightKg).toBe(80);
    expect(p.json().targets).toMatchObject({ kcal: 1750, steps: 9000 });
  });

  it('validates the profile', async () => {
    const res = await call({ method: 'PUT', url: '/v1/me/profile', payload: { age: 5 } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('validation_error');
    const extra = await call({ method: 'PUT', url: '/v1/me/profile', payload: { admin: true } });
    expect(extra.statusCode).toBe(400);
  });

  it('updates tone preference, reminders, devices and onboarding', async () => {
    expect((await call({ method: 'PUT', url: '/v1/me/tone', payload: { preference: 'gentle' } })).json().tone).toBe('gentle');
    const r = await call({ method: 'PUT', url: '/v1/me/reminders', payload: { frequency: 'high', sleepLeadMin: 60 } });
    expect(r.json().reminders).toMatchObject({ frequency: 'high', sleepLeadMin: 60, water: true });
    expect((await call({ method: 'PUT', url: '/v1/me/reminders', payload: { sleepLeadMin: 50 } })).statusCode).toBe(400);
    const d = await call({ method: 'PUT', url: '/v1/me/devices', payload: { source: 'health_connect', connected: true, devices: ['Polar H10'] } });
    expect(d.json().devices).toMatchObject({ source: 'health_connect', connected: true, devices: ['Polar H10'], lastSyncAt: null });
    const o = await call({ method: 'POST', url: '/v1/me/onboarding/complete' });
    expect(o.json().onboardingDone).toBe(true);
  });
});

describe('personality', () => {
  it('stores nothing without consent', async () => {
    const res = await call({ method: 'POST', url: '/v1/me/personality', payload: { consent: false, answers: SAMPLE_ANSWERS } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('consent_required');
    expect(await db.select().from(personalities)).toHaveLength(0);
  });

  it('rejects invalid answers', async () => {
    const res = await call({ method: 'POST', url: '/v1/me/personality', payload: { consent: true, answers: [1, 2, 3] } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('invalid_answers');
    const bad = await call({ method: 'POST', url: '/v1/me/personality', payload: { consent: true, answers: SAMPLE_ANSWERS.map(() => 6) } });
    expect(bad.json().error.code).toBe('invalid_answers');
  });

  it('scores, stores and derives the tone; locks the retest; deletes', async () => {
    await call({ method: 'PUT', url: '/v1/me/profile', payload: ilzeBasics });
    const res = await call({ method: 'POST', url: '/v1/me/personality', payload: { consent: true, answers: SAMPLE_ANSWERS } });
    expect(res.statusCode).toBe(200);
    const me = res.json() as Me;
    expect(me.personality).toMatchObject({
      consent: true,
      levels: { openness: 'medium', conscientiousness: 'high', extraversion: 'low', agreeableness: 'high', emotionalStability: 'low' },
      styleName: 'Plānotāja ar maigu pieeju',
    });
    expect(me.personality!.styleDescription).toContain('konkrēti');
    expect(me.tone).toBe('plan');
    const tested = new Date(me.personality!.testedAt);
    const expected = new Date(tested);
    expected.setMonth(expected.getMonth() + 6);
    expect(me.personality!.retestFrom).toBe(expected.toISOString().slice(0, 10));
    const [stored] = await db.select().from(personalities);
    expect(stored!.answers).toEqual(SAMPLE_ANSWERS);

    const again = await call({ method: 'POST', url: '/v1/me/personality', payload: { consent: true, answers: SAMPLE_ANSWERS } });
    expect(again.statusCode).toBe(409);
    expect(again.json().error.code).toBe('retest_locked');

    // Neutral override wins over the profile.
    expect((await call({ method: 'PUT', url: '/v1/me/tone', payload: { preference: 'neutral' } })).json().tone).toBe('neutral');
    await call({ method: 'PUT', url: '/v1/me/tone', payload: { preference: 'auto' } });

    const del = await call({ method: 'DELETE', url: '/v1/me/personality' });
    expect(del.json().personality).toBeNull();
    expect(del.json().tone).toBe('neutral');
    expect(await db.select().from(personalities)).toHaveLength(0);
  });

  it('uses the masculine style name for men', async () => {
    await call({ method: 'PUT', url: '/v1/me/profile', payload: { ...ilzeBasics, firstName: 'Jānis', sex: 'm' } });
    const res = await call({ method: 'POST', url: '/v1/me/personality', payload: { consent: true, answers: SAMPLE_ANSWERS } });
    expect(res.json().personality.styleName).toBe('Plānotājs ar maigu pieeju');
  });
});
