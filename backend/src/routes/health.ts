import { desc, eq, sql } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

import type { HealthSyncResponse } from '../../../shared/api';
import { healthDays, sleepNights, users, weights, workouts } from '../db/schema';
import { parse } from '../errors';
import { movementOverview, sleepOverview, toWorkout, WORKOUT_NAME } from '../services/day';
import { userToday } from '../services/quota';
import { getUser } from '../services/users';
import { DateQuery, DateStr, DaysQuery, HmStr, IsoStr, WorkoutType } from './schemas';

const min = z.number().int().min(0).max(1440);

const SyncBody = z.object({
  source: z.enum(['apple_health', 'health_connect']),
  devices: z.array(z.string().trim().min(1).max(60)).max(10),
  days: z
    .array(
      z.object({
        date: DateStr,
        steps: z.number().int().min(0).max(200_000),
        activeKcal: z.number().min(0).max(20_000),
        restingHr: z.number().int().min(20).max(250).nullable(),
        hrvMs: z.number().min(0).max(500).nullable(),
      }),
    )
    .max(120),
  nights: z
    .array(
      z.object({
        date: DateStr,
        bedtime: HmStr,
        wakeTime: HmStr,
        totalMin: min,
        deepMin: min,
        remMin: min,
        lightMin: min,
        awakeMin: min,
      }),
    )
    .max(120),
  workouts: z
    .array(
      z.object({
        externalId: z.string().min(1).max(200),
        type: WorkoutType,
        startedAt: IsoStr,
        durationMin: z.number().int().min(0).max(1440),
        kcal: z.number().min(0).max(20_000).nullable(),
        avgHr: z.number().int().min(20).max(250).nullable(),
        zones: z.object({ minutes: z.tuple([min, min, min, min, min]) }).nullable(),
        device: z.string().trim().max(60).nullable(),
      }),
    )
    .max(500),
  weights: z.array(z.object({ date: DateStr, kg: z.number().min(30).max(350) })).max(120).optional(),
});

/** Last entry per key wins, so one INSERT … ON CONFLICT never touches a row twice. */
const dedupe = <T>(xs: T[], key: (x: T) => string) => [...new Map(xs.map((x) => [key(x), x])).values()];

export const healthRoutes: FastifyPluginAsync = async (app) => {
  const { db } = app.deps;

  app.post('/health/sync', async (req): Promise<HealthSyncResponse> => {
    const body = parse(SyncBody, req.body);
    const userId = req.userId;
    const now = app.deps.now();
    const days = dedupe(body.days, (d) => d.date);
    const nights = dedupe(body.nights, (n) => n.date);
    const wos = dedupe(body.workouts, (w) => w.externalId);
    const ws = dedupe(body.weights ?? [], (w) => w.date);

    await db.transaction(async (tx) => {
      if (days.length) {
        await tx
          .insert(healthDays)
          .values(days.map((d) => ({ userId, ...d, activeKcal: Math.round(d.activeKcal), source: body.source, updatedAt: now })))
          .onConflictDoUpdate({
            target: [healthDays.userId, healthDays.date],
            set: {
              steps: sql`excluded.steps`,
              activeKcal: sql`excluded.active_kcal`,
              restingHr: sql`excluded.resting_hr`,
              hrvMs: sql`excluded.hrv_ms`,
              source: sql`excluded.source`,
              updatedAt: sql`excluded.updated_at`,
            },
          });
      }
      if (nights.length) {
        await tx
          .insert(sleepNights)
          .values(nights.map((n) => ({ userId, ...n, source: body.source })))
          .onConflictDoUpdate({
            target: [sleepNights.userId, sleepNights.date],
            set: {
              bedtime: sql`excluded.bedtime`,
              wakeTime: sql`excluded.wake_time`,
              totalMin: sql`excluded.total_min`,
              deepMin: sql`excluded.deep_min`,
              remMin: sql`excluded.rem_min`,
              lightMin: sql`excluded.light_min`,
              awakeMin: sql`excluded.awake_min`,
              source: sql`excluded.source`,
            },
          });
      }
      if (wos.length) {
        await tx
          .insert(workouts)
          .values(
            wos.map((w) => ({
              userId,
              externalId: w.externalId,
              type: w.type,
              name: WORKOUT_NAME[w.type],
              startedAt: new Date(w.startedAt),
              durationMin: w.durationMin,
              kcal: w.kcal == null ? null : Math.round(w.kcal),
              avgHr: w.avgHr,
              zones: w.zones,
              device: w.device,
              source: body.source,
            })),
          )
          .onConflictDoUpdate({
            target: [workouts.userId, workouts.externalId],
            set: {
              type: sql`excluded.type`,
              name: sql`excluded.name`,
              startedAt: sql`excluded.started_at`,
              durationMin: sql`excluded.duration_min`,
              kcal: sql`excluded.kcal`,
              avgHr: sql`excluded.avg_hr`,
              zones: sql`excluded.zones`,
              device: sql`excluded.device`,
            },
          });
      }
      if (ws.length) {
        await tx
          .insert(weights)
          .values(ws.map((w) => ({ userId, date: w.date, kg: Math.round(w.kg * 10) / 10 })))
          .onConflictDoUpdate({ target: [weights.userId, weights.date], set: { kg: sql`excluded.kg` } });
      }
      const [user] = await tx.select().from(users).where(eq(users.id, userId));
      const devices = { source: body.source, connected: true, devices: body.devices, lastSyncAt: now.toISOString() };
      const [latestWeight] = await tx.select().from(weights).where(eq(weights.userId, userId)).orderBy(desc(weights.date)).limit(1);
      const profile = latestWeight && ws.length ? { ...user!.profile, weightKg: latestWeight.kg } : user!.profile;
      await tx.update(users).set({ devices, profile, updatedAt: now }).where(eq(users.id, userId));
    });

    return { daysUpserted: days.length, nightsUpserted: nights.length, workoutsUpserted: wos.length, lastSyncAt: now.toISOString() };
  });

  app.get('/health/movement', async (req) => {
    const q = parse(DaysQuery, req.query);
    const user = await getUser(db, req.userId);
    return movementOverview(db, user, q.date ?? userToday(user, app.deps.now()), q.days);
  });

  app.get('/health/sleep', async (req) => {
    const q = parse(DateQuery, req.query);
    const user = await getUser(db, req.userId);
    return sleepOverview(db, user, q.date ?? userToday(user, app.deps.now()));
  });

  app.post('/activities', async (req) => {
    const body = parse(
      z.object({
        type: WorkoutType,
        startedAt: IsoStr,
        durationMin: z.number().int().min(1).max(1440),
        kcal: z.number().min(0).max(20_000).nullish(),
      }),
      req.body,
    );
    const [row] = await db
      .insert(workouts)
      .values({
        userId: req.userId,
        type: body.type,
        name: WORKOUT_NAME[body.type],
        startedAt: new Date(body.startedAt),
        durationMin: body.durationMin,
        kcal: body.kcal == null ? null : Math.round(body.kcal),
        source: 'manual',
      })
      .returning();
    return toWorkout(row!);
  });
};
