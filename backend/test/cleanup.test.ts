import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { analysisUsage, exportTokens, magicLinks, pushLog, refreshTokens, users } from '../src/db/schema';
import { cleanupExpired } from '../src/services/cleanup';
import { db, loginByEmail, makeApp, resetDb, type TestContext } from './helpers';

const NOW = new Date('2026-11-11T12:00:00Z');
const ago = (days: number) => new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000);

let ctx: TestContext;
beforeAll(async () => {
  ctx = await makeApp();
});
afterAll(() => ctx.app.close());
beforeEach(async () => {
  await resetDb();
});

describe('cleanupExpired (data minimisation)', () => {
  it('removes expired sign-in/export rows and old counters, keeps everything still useful', async () => {
    await loginByEmail(ctx.app, 'ilze@example.com');
    const [user] = await db.select().from(users);
    const uid = user!.id;
    // Sign-in itself leaves a used magic link and a live refresh token; start from a clean slate.
    await db.delete(magicLinks);
    await db.delete(refreshTokens);

    await db.insert(magicLinks).values([
      { email: 'a@example.com', tokenHash: 'ml-old', expiresAt: ago(3) },
      { email: 'a@example.com', tokenHash: 'ml-used', expiresAt: ago(1.5), usedAt: ago(2) },
      { email: 'a@example.com', tokenHash: 'ml-live', expiresAt: new Date(NOW.getTime() + 10 * 60_000) },
    ]);
    const family = randomUUID();
    await db.insert(refreshTokens).values([
      { userId: uid, familyId: family, tokenHash: 'rt-expired', expiresAt: ago(2) },
      // Revoked but not expired: kept so presenting it again is still detected as reuse.
      { userId: uid, familyId: family, tokenHash: 'rt-revoked', expiresAt: ago(-10), revokedAt: ago(1) },
      { userId: uid, familyId: family, tokenHash: 'rt-live', expiresAt: ago(-20) },
    ]);
    await db.insert(exportTokens).values([
      { tokenHash: 'ex-old', userId: uid, expiresAt: ago(2) },
      { tokenHash: 'ex-live', userId: uid, expiresAt: ago(-0.5) },
    ]);
    await db.insert(pushLog).values([
      { userId: uid, kind: 'water', localDate: '2026-09-01', slot: '1', sentAt: ago(70) },
      { userId: uid, kind: 'water', localDate: '2026-11-10', slot: '1', sentAt: ago(1) },
    ]);
    await db.insert(analysisUsage).values([
      { userId: uid, date: '2026-09-01', count: 3 },
      { userId: uid, date: '2026-11-11', count: 1 },
    ]);

    const result = await cleanupExpired(db, NOW);
    expect(result).toEqual({ magicLinks: 2, refreshTokens: 1, exportTokens: 1, pushLog: 1, usage: 1 });

    expect((await db.select().from(magicLinks)).map((r) => r.tokenHash)).toEqual(['ml-live']);
    expect((await db.select().from(refreshTokens)).map((r) => r.tokenHash).sort()).toEqual(['rt-live', 'rt-revoked']);
    expect((await db.select().from(exportTokens)).map((r) => r.tokenHash)).toEqual(['ex-live']);
    expect((await db.select().from(pushLog)).map((r) => r.localDate)).toEqual(['2026-11-10']);
    expect((await db.select().from(analysisUsage)).map((r) => r.date)).toEqual(['2026-11-11']);

    // Idempotent.
    expect(await cleanupExpired(db, NOW)).toEqual({ magicLinks: 0, refreshTokens: 0, exportTokens: 0, pushLog: 0, usage: 0 });
  });
});
