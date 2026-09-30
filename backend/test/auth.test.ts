import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { AuthTokens } from '../../shared/api';
import { loadConfig } from '../src/config';
import { magicLinks, refreshTokens } from '../src/db/schema';
import { authed, db, loginByEmail, makeApp, resetDb, type TestContext } from './helpers';

let ctx: TestContext;
beforeAll(async () => {
  ctx = await makeApp();
});
afterAll(() => ctx.app.close());
beforeEach(resetDb);

const post = (url: string, payload: unknown) => ctx.app.inject({ method: 'POST', url, payload: payload as object });

describe('magic link', () => {
  it('sends a Latvian-app deep link and returns devToken in console mode', async () => {
    const res = await post('/v1/auth/magic-link', { email: 'Anna@Example.LV ' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(body.devToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(ctx.email.sent.at(-1)!.appLink).toBe(`balanss://auth?token=${body.devToken}`);
    expect(ctx.email.sent.at(-1)!.webLink).toMatch(/^http.+\/auth\/open\?token=/);
    // The https page hands the token to the app (mail apps don't open balanss:// links).
    const open = await ctx.app.inject({ method: 'GET', url: `/auth/open?token=${body.devToken}` });
    expect(open.statusCode).toBe(200);
    expect(open.body).toContain(`intent://auth?token=${body.devToken}#Intent;scheme=balanss;package=lv.balanss.app;end`);
    expect(open.headers['content-security-policy']).toContain("default-src 'none'");
    const bad = await ctx.app.inject({ method: 'GET', url: '/auth/open?token=%22%3E%3Cscript%3E' });
    expect(bad.statusCode).toBe(400);
    expect(bad.body).not.toContain('<script>');
    // Stored hashed, never in plain text.
    const rows = await db.select().from(magicLinks);
    expect(rows[0]!.email).toBe('anna@example.lv');
    expect(rows[0]!.tokenHash).not.toBe(body.devToken);
  });

  it('logs in, creates the user with defaults once, and is single use', async () => {
    const first = await loginByEmail(ctx.app, 'anna@example.lv');
    expect(first.user.isNew).toBe(true);
    expect(first.expiresIn).toBe(900);
    const me = await authed(ctx.app, first.accessToken)({ method: 'GET', url: '/v1/me' });
    expect(me.statusCode).toBe(200);
    expect(me.json().targets.steps).toBe(8000);
    expect(me.json().tone).toBe('neutral');

    const second = await loginByEmail(ctx.app, 'ANNA@example.lv');
    expect(second.user.isNew).toBe(false);
    expect(second.user.id).toBe(first.user.id);

    const { devToken } = (await post('/v1/auth/magic-link', { email: 'anna@example.lv' })).json();
    expect((await post('/v1/auth/magic-link/verify', { token: devToken })).statusCode).toBe(200);
    const reuse = await post('/v1/auth/magic-link/verify', { token: devToken });
    expect(reuse.statusCode).toBe(401);
    expect(reuse.json()).toEqual({ error: { code: 'invalid_token', message: expect.any(String) } });
  });

  it('rejects expired links', async () => {
    const { devToken } = (await post('/v1/auth/magic-link', { email: 'old@example.lv' })).json();
    await db.update(magicLinks).set({ expiresAt: new Date(Date.now() - 1000) });
    expect((await post('/v1/auth/magic-link/verify', { token: devToken })).statusCode).toBe(401);
  });

  it('never returns devToken in production', async () => {
    const prod = await makeApp({ config: { nodeEnv: 'production' } });
    const res = await prod.app.inject({ method: 'POST', url: '/v1/auth/magic-link', payload: { email: 'p@example.lv' } });
    expect(res.json()).toEqual({ ok: true });
    expect(prod.email.sent).toHaveLength(1);
    await prod.app.close();
  });

  it('validates the e-mail', async () => {
    const res = await post('/v1/auth/magic-link', { email: 'not-an-email' });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('validation_error');
  });
});

describe('refresh tokens', () => {
  it('rotates on every refresh', async () => {
    const t0 = await loginByEmail(ctx.app, 'rot@example.lv');
    const r1 = await post('/v1/auth/refresh', { refreshToken: t0.refreshToken });
    expect(r1.statusCode).toBe(200);
    const t1 = r1.json() as AuthTokens;
    expect(t1.refreshToken).not.toBe(t0.refreshToken);
    expect(t1.user.isNew).toBe(false);
    const r2 = await post('/v1/auth/refresh', { refreshToken: t1.refreshToken });
    expect(r2.statusCode).toBe(200);
  });

  it('detects reuse of a rotated token and revokes the whole family', async () => {
    const t0 = await loginByEmail(ctx.app, 'reuse@example.lv');
    const t1 = (await post('/v1/auth/refresh', { refreshToken: t0.refreshToken })).json() as AuthTokens;
    const replay = await post('/v1/auth/refresh', { refreshToken: t0.refreshToken });
    expect(replay.statusCode).toBe(401);
    expect(replay.json().error.code).toBe('refresh_token_reused');
    // The legitimate newer token is revoked too.
    const after = await post('/v1/auth/refresh', { refreshToken: t1.refreshToken });
    expect(after.statusCode).toBe(401);
    const live = await db.select().from(refreshTokens).where(eq(refreshTokens.userId, t0.user.id));
    expect(live.every((r) => r.revokedAt)).toBe(true);
  });

  it('logout revokes the refresh token', async () => {
    const t0 = await loginByEmail(ctx.app, 'bye@example.lv');
    const out = await post('/v1/auth/logout', { refreshToken: t0.refreshToken });
    expect(out.json()).toEqual({ ok: true });
    const res = await post('/v1/auth/refresh', { refreshToken: t0.refreshToken });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('invalid_refresh_token');
  });

  it('rejects unknown refresh tokens', async () => {
    expect((await post('/v1/auth/refresh', { refreshToken: 'x'.repeat(43) })).statusCode).toBe(401);
  });
});

describe('Google and Apple', () => {
  it('signs in with Google and links to the existing e-mail account', async () => {
    const byEmail = await loginByEmail(ctx.app, 'maris@example.lv');
    const res = await post('/v1/auth/google', { idToken: 'g-123-subject|maris@example.lv|Māris' });
    expect(res.statusCode).toBe(200);
    expect(res.json().user).toEqual({ id: byEmail.user.id, email: 'maris@example.lv', isNew: false });
    // Next time the Google subject alone finds the account.
    const again = await post('/v1/auth/google', { idToken: 'g-123-subject||' });
    expect(again.json().user.id).toBe(byEmail.user.id);
  });

  it('creates a new user from Apple with the given first name', async () => {
    const res = await post('/v1/auth/apple', { identityToken: 'a-999|liga@privaterelay.appleid.com', firstName: 'Līga' });
    expect(res.statusCode).toBe(200);
    const tokens = res.json() as AuthTokens;
    expect(tokens.user.isNew).toBe(true);
    const me = await authed(ctx.app, tokens.accessToken)({ method: 'GET', url: '/v1/me' });
    expect(me.json().profile.firstName).toBe('Līga');
  });

  it('rejects tokens the verifier refuses', async () => {
    const res = await post('/v1/auth/google', { idToken: 'bad-token-xyz' });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('invalid_token');
  });

  it('requires an e-mail for a brand-new account', async () => {
    const res = await post('/v1/auth/apple', { identityToken: 'a-555-subject|' });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('email_required');
  });
});

describe('protected routes', () => {
  const routes: [string, string][] = [
    ['GET', '/v1/me'],
    ['PUT', '/v1/me/profile'],
    ['GET', '/v1/days/2026-09-28'],
    ['POST', '/v1/water'],
    ['POST', '/v1/meals'],
    ['POST', '/v1/meals/analyze'],
    ['GET', '/v1/favourites'],
    ['GET', '/v1/stats/nutrition'],
    ['POST', '/v1/health/sync'],
    ['GET', '/v1/health/movement'],
    ['GET', '/v1/tips/today'],
    ['GET', '/v1/weekly-question'],
    ['PUT', '/v1/push/token'],
    ['DELETE', '/v1/me'],
    ['POST', '/v1/me/export'],
  ];
  it.each(routes)('%s %s requires a bearer token', async (method, url) => {
    const res = await ctx.app.inject({ method: method as 'GET', url });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('unauthorized');
  });

  it('rejects a forged access token', async () => {
    const res = await authed(ctx.app, 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.bad')({ method: 'GET', url: '/v1/me' });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('invalid_token');
  });

  it('serves /health without auth', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: true, db: true, email: 'fake' });
    expect(JSON.stringify(res.json())).not.toMatch(/key|secret/i);
  });

  it('returns the error shape for unknown routes', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/v1/nope' });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('not_found');
  });
});

describe('config on Railway', () => {
  const base = { NODE_ENV: 'production', JWT_SECRET: 'x'.repeat(32) };
  it('fails fast without DATABASE_URL in production', () => {
    expect(() => loadConfig(base)).toThrow(/DATABASE_URL/);
  });
  it('derives PUBLIC_API_URL from RAILWAY_PUBLIC_DOMAIN', () => {
    const c = loadConfig({ ...base, DATABASE_URL: 'postgres://x', RAILWAY_PUBLIC_DOMAIN: 'balanss-production.up.railway.app' });
    expect(c.publicApiUrl).toBe('https://balanss-production.up.railway.app');
    expect(loadConfig({ ...base, DATABASE_URL: 'postgres://x', RAILWAY_PUBLIC_DOMAIN: 'a.b', PUBLIC_API_URL: 'https://api.x/' }).publicApiUrl).toBe('https://api.x');
  });
});
