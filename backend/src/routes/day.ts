import { and, desc, eq, sql } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

import { insights, users, waterDays, weights } from '../db/schema';
import { parse } from '../errors';
import { buildDay, nutritionSeries, statsFrom, trendsInput } from '../services/day';
import { userToday } from '../services/quota';
import { getPersonality, getUser } from '../services/users';
import { DateStr, DaysQuery } from './schemas';

export const dayRoutes: FastifyPluginAsync = async (app) => {
  const { db, config } = app.deps;

  app.get('/days/:date', async (req) => {
    const { date } = parse(z.object({ date: DateStr }), req.params);
    const user = await getUser(db, req.userId);
    return buildDay(db, config, user, date);
  });

  app.post('/water', async (req) => {
    const { date, ml } = parse(z.object({ date: DateStr, ml: z.number().int().min(-5000).max(5000) }), req.body);
    // Negative ml undoes a glass; the day total never goes below zero.
    const [row] = await db
      .insert(waterDays)
      .values({ userId: req.userId, date, ml: Math.max(0, ml) })
      .onConflictDoUpdate({
        target: [waterDays.userId, waterDays.date],
        set: { ml: sql`greatest(0, ${waterDays.ml} + ${ml})` },
      })
      .returning({ ml: waterDays.ml });
    return { date, waterMl: row!.ml };
  });

  app.post('/weight', async (req) => {
    const { date, kg } = parse(z.object({ date: DateStr, kg: z.number().min(30).max(350) }), req.body);
    const value = Math.round(kg * 10) / 10;
    await db
      .insert(weights)
      .values({ userId: req.userId, date, kg: value })
      .onConflictDoUpdate({ target: [weights.userId, weights.date], set: { kg: value } });
    // The newest weigh-in also becomes the profile weight shown on the Me screen.
    const [latest] = await db.select().from(weights).where(eq(weights.userId, req.userId)).orderBy(desc(weights.date)).limit(1);
    if (latest?.date === date) {
      const user = await getUser(db, req.userId);
      await db
        .update(users)
        .set({ profile: { ...user.profile, weightKg: value } })
        .where(eq(users.id, req.userId));
    }
    return { date, kg: value };
  });

  app.get('/stats/nutrition', async (req) => {
    const q = parse(DaysQuery, req.query);
    const user = await getUser(db, req.userId);
    const date = q.date ?? userToday(user, app.deps.now());
    const series = await nutritionSeries(db, config, user.id, date, q.days);
    const stats = statsFrom(series, user);
    if (!series.some((d) => d.kcal > 0)) return { ...stats, insight: null };

    const kind = `trends:${q.days}`;
    const [cached] = await db
      .select()
      .from(insights)
      .where(and(eq(insights.userId, user.id), eq(insights.date, date), eq(insights.kind, kind)));
    if (cached) return { ...stats, insight: cached.text };

    const personality = await getPersonality(db, user.id);
    const text = await app.deps.ai.tone.trendsInsight(trendsInput(user, personality, stats), req.log);
    await db.insert(insights).values({ userId: user.id, date, kind, text }).onConflictDoNothing();
    return { ...stats, insight: text };
  });
};
