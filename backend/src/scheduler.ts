import { and, eq, inArray } from 'drizzle-orm';
import type { FastifyBaseLogger } from 'fastify';

import type { ReminderFrequency } from '../../shared/api';
import { hmToMin } from '../../shared/dates';
import { copyAiFor } from './ai';
import type { PushKind } from './ai/tone';
import type { AppDeps } from './deps';
import { meals, pushLog, pushTokens, users, type UserRow } from './db/schema';
import { getOrCreateTip } from './services/copy';
import { buildToneInput, nightsUpTo, waterFor, windowFor } from './services/day';
import { cleanupOldPhotos } from './services/photos';
import { getPersonality } from './services/users';
import { localNow, type LocalNow } from './lib/time';

/**
 * In-process scheduler (no Redis): every 5 minutes, for each user with a push
 * token, work out what is due in their local time zone and send it once.
 * Dedupe is the push_log primary key (user, kind, local date, slot), claimed
 * before sending, so overlapping ticks or instances never double-send.
 */

export const TICK_MS = 5 * 60 * 1000;
/** A slot stays due for this long after its time, so a late or skipped tick still fires it. */
export const DUE_WINDOW_MIN = 30;
export const QUIET_START = 22 * 60 + 30;
export const QUIET_END = 8 * 60;
export const TIP_SLOT = '05:00';

export const WATER_SLOTS: Record<ReminderFrequency, string[]> = {
  low: ['11:00', '15:00'],
  mid: ['10:00', '13:00', '16:00', '19:00'],
  high: ['09:00', '11:00', '13:00', '15:00', '17:00', '19:00'],
};
export const FOOD_SLOTS: { slot: string; meal: 'lunch' | 'dinner' }[] = [
  { slot: '13:30', meal: 'lunch' },
  { slot: '19:30', meal: 'dinner' },
];

/** The water day runs 08:00–21:00; by `minutes` this share of the target should be in. */
export function waterShareBy(minutes: number): number {
  return Math.max(0, Math.min(1, (minutes - 8 * 60) / (21 * 60 - 8 * 60)));
}

export const isQuiet = (minutes: number) => minutes >= QUIET_START || minutes < QUIET_END;

const isDue = (local: LocalNow, slotMin: number) => (((local.minutes - slotMin) % 1440) + 1440) % 1440 < DUE_WINDOW_MIN;

export interface SentPush {
  userId: string;
  kind: PushKind;
  slot: string;
  title: string;
  body: string;
}

export interface TickResult {
  pushes: SentPush[];
  tipsGenerated: string[];
  photosDeleted: number;
}

async function claim(deps: AppDeps, userId: string, kind: string, localDate: string, slot: string): Promise<boolean> {
  const rows = await deps.db.insert(pushLog).values({ userId, kind, localDate, slot }).onConflictDoNothing().returning({ slot: pushLog.slot });
  return rows.length > 0;
}

async function sendPush(
  deps: AppDeps,
  log: FastifyBaseLogger,
  user: UserRow,
  tokens: string[],
  kind: PushKind,
  local: LocalNow,
  slot: string,
  meal?: 'lunch' | 'dinner',
): Promise<SentPush | null> {
  if (!(await claim(deps, user.id, kind, local.date, slot))) return null;
  const personality = await getPersonality(deps.db, user.id);
  const input = await buildToneInput(deps.db, deps.config, user, personality, local.date, local.hm, [], deps.now());
  const copy = await copyAiFor(deps.ai, user).tone.pushCopy(kind, input, meal, log);
  try {
    const results = await deps.push.send(tokens.map((to) => ({ to, title: copy.title, body: copy.body, data: { kind, date: local.date } })));
    const invalid = results.filter((r) => r.invalidToken).map((r) => r.token);
    if (invalid.length) await deps.db.delete(pushTokens).where(inArray(pushTokens.token, invalid));
  } catch (err) {
    log.warn({ push: { kind, reason: err instanceof Error ? err.message : 'unknown' } }, 'push send failed');
  }
  return { userId: user.id, kind, slot, ...copy };
}

async function tickUser(deps: AppDeps, log: FastifyBaseLogger, user: UserRow, tokens: { token: string; timezone: string }[], now: Date, result: TickResult) {
  const tz = tokens[0]?.timezone ?? user.timezone;
  const local = localNow(tz, now);
  const list = tokens.map((t) => t.token);
  const r = user.reminders;

  // Pre-generate today's tip so Home opens instantly.
  if (isDue(local, hmToMin(TIP_SLOT)) && (await claim(deps, user.id, 'tip', local.date, TIP_SLOT))) {
    await getOrCreateTip(deps, user, local.date, log);
    result.tipsGenerated.push(user.id);
  }

  // Wind-down before the sleep window (allowed during quiet hours).
  if (r.sleepWindow) {
    const window = windowFor(await nightsUpTo(deps.db, user.id, local.date, 14));
    if (window) {
      const slotMin = hmToMin(window.start) - r.sleepLeadMin;
      if (isDue(local, slotMin)) {
        const sent = await sendPush(deps, log, user, list, 'sleep', local, window.start);
        if (sent) result.pushes.push(sent);
      }
    }
  }

  if (isQuiet(local.minutes)) return;

  if (r.water) {
    for (const slot of WATER_SLOTS[r.frequency]) {
      if (!isDue(local, hmToMin(slot)) || isQuiet(hmToMin(slot))) continue;
      const ml = await waterFor(deps.db, user.id, local.date);
      if (ml >= user.targets.waterMl * waterShareBy(local.minutes)) continue;
      const sent = await sendPush(deps, log, user, list, 'water', local, slot);
      if (sent) result.pushes.push(sent);
    }
  }

  if (r.food) {
    for (const { slot, meal } of FOOD_SLOTS) {
      if (!isDue(local, hmToMin(slot))) continue;
      const [logged] = await deps.db
        .select({ id: meals.id })
        .from(meals)
        .where(and(eq(meals.userId, user.id), eq(meals.date, local.date), eq(meals.type, meal)))
        .limit(1);
      if (logged) continue;
      const sent = await sendPush(deps, log, user, list, 'food', local, slot, meal);
      if (sent) result.pushes.push(sent);
    }
  }
}

export async function runSchedulerTick(deps: AppDeps, log: FastifyBaseLogger, now: Date = deps.now()): Promise<TickResult> {
  const result: TickResult = { pushes: [], tipsGenerated: [], photosDeleted: 0 };
  const rows = await deps.db
    .select({ user: users, token: pushTokens.token, timezone: pushTokens.timezone, updatedAt: pushTokens.updatedAt })
    .from(pushTokens)
    .innerJoin(users, eq(users.id, pushTokens.userId));
  const byUser = new Map<string, { user: UserRow; tokens: { token: string; timezone: string; updatedAt: Date }[] }>();
  for (const row of rows) {
    const entry = byUser.get(row.user.id) ?? { user: row.user, tokens: [] };
    entry.tokens.push({ token: row.token, timezone: row.timezone, updatedAt: row.updatedAt });
    byUser.set(row.user.id, entry);
  }
  for (const { user, tokens } of byUser.values()) {
    tokens.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
    try {
      await tickUser(deps, log, user, tokens, now, result);
    } catch (err) {
      log.error({ scheduler: { reason: err instanceof Error ? err.message : 'unknown' } }, 'scheduler failed for a user');
    }
  }
  try {
    result.photosDeleted = await cleanupOldPhotos(deps.db, deps.config, now);
  } catch (err) {
    log.error({ scheduler: { reason: err instanceof Error ? err.message : 'unknown' } }, 'photo cleanup failed');
  }
  return result;
}

/** Starts the 5-minute loop; returns a stop function. */
export function startScheduler(deps: AppDeps, log: FastifyBaseLogger): () => void {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const r = await runSchedulerTick(deps, log);
      if (r.pushes.length || r.tipsGenerated.length || r.photosDeleted)
        log.info({ scheduler: { pushes: r.pushes.length, tips: r.tipsGenerated.length, photosDeleted: r.photosDeleted } }, 'scheduler tick');
    } catch (err) {
      log.error({ scheduler: { reason: err instanceof Error ? err.message : 'unknown' } }, 'scheduler tick failed');
    } finally {
      running = false;
    }
  };
  const timer = setInterval(() => void tick(), TICK_MS);
  timer.unref();
  void tick();
  return () => clearInterval(timer);
}
