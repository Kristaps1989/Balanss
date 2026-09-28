import { eq } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

import { pushTokens, users } from '../db/schema';
import { parse } from '../errors';
import { isValidTimezone } from '../lib/time';

export const pushRoutes: FastifyPluginAsync = async (app) => {
  const { db } = app.deps;

  app.put('/push/token', async (req) => {
    const body = parse(
      z.object({
        token: z.string().min(10).max(300),
        platform: z.enum(['android', 'ios', 'web']),
        timezone: z.string().max(64).refine(isValidTimezone, 'unknown IANA time zone'),
      }),
      req.body,
    );
    const now = app.deps.now();
    // A token belongs to one device; re-registering moves it to the signed-in user.
    await db
      .insert(pushTokens)
      .values({ userId: req.userId, token: body.token, platform: body.platform, timezone: body.timezone })
      .onConflictDoUpdate({
        target: pushTokens.token,
        set: { userId: req.userId, platform: body.platform, timezone: body.timezone, updatedAt: now },
      });
    await db.update(users).set({ timezone: body.timezone, updatedAt: now }).where(eq(users.id, req.userId));
    return { ok: true as const };
  });
};
