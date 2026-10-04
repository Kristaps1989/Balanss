import { and, eq, lt, sql } from 'drizzle-orm';
import type { FastifyBaseLogger } from 'fastify';

import type { LeisureItem, LeisureRequest, LeisureResponse } from '../../../shared/api';
import { LEISURE_DAILY_LIMIT } from '../../../shared/leisure';
import { MIN_LEAD_MIN, needsTime, validateListings, type LeisureQuery, type RawListing } from '../ai/leisure';
import { leisureCache, leisureUsage, type UserRow } from '../db/schema';
import type { AppDeps } from '../deps';
import { AppError, badRequest } from '../errors';
import { localNow } from '../lib/time';

const CACHE_MS = 2 * 3600_000;
const DAY_MIN = 1440;

/**
 * The time window for timed items, in the user's zone: "today" runs to local midnight;
 * "weekend" is Saturday 00:00 to Sunday 24:00 (from now if it is already the weekend).
 * The earliest start is always now + 30 min, so nothing already under way is suggested.
 */
export function leisureWindow(tz: string, now: Date, when: 'today' | 'weekend'): { earliest: Date; windowEnd: Date; localDate: string } {
  const local = localNow(tz, now);
  const plus = (min: number) => new Date(now.getTime() + min * 60_000);
  const earliest = plus(MIN_LEAD_MIN);
  if (when === 'today') return { earliest, windowEnd: plus(DAY_MIN - local.minutes), localDate: local.date };
  const weekend = local.weekday >= 5;
  const saturdayStart = (5 - local.weekday) * DAY_MIN - local.minutes;
  const sundayEnd = (6 - local.weekday) * DAY_MIN + (DAY_MIN - local.minutes);
  return { earliest: weekend ? earliest : plus(Math.max(saturdayStart, MIN_LEAD_MIN)), windowEnd: plus(sundayEnd), localDate: local.date };
}

async function consumeSearch(deps: AppDeps, user: UserRow, date: string): Promise<boolean> {
  const rows = await deps.db
    .insert(leisureUsage)
    .values({ userId: user.id, date, count: 1 })
    .onConflictDoUpdate({
      target: [leisureUsage.userId, leisureUsage.date],
      set: { count: sql`${leisureUsage.count} + 1` },
      setWhere: lt(leisureUsage.count, LEISURE_DAILY_LIMIT),
    })
    .returning({ count: leisureUsage.count });
  return rows.length > 0;
}

const toRaw = (i: LeisureItem): RawListing => ({ ...i });

export async function suggestLeisure(deps: AppDeps, user: UserRow, req: LeisureRequest, log: FastifyBaseLogger): Promise<LeisureResponse> {
  const city = user.leisureCity;
  if (!city) throw badRequest('city_required', 'Choose a city first (PUT /me/city)');
  const now = deps.now();
  const where = req.kind === 'movie' ? (req.where ?? 'any') : null;
  const when = req.kind === 'event' ? (req.when ?? 'today') : req.kind === 'movie' && where === 'cinema' ? 'today' : null;
  const win = leisureWindow(user.timezone, now, when ?? 'today');
  const q: LeisureQuery = { kind: req.kind, genre: req.genre, where, when, city, now, ...win };

  const key = [city, req.kind, req.genre, where ?? '-', when ?? '-', win.localDate].join('|');
  const [cached] = await deps.db.select().from(leisureCache).where(eq(leisureCache.key, key));
  if (cached && now.getTime() - cached.fetchedAt.getTime() < CACHE_MS) {
    // Re-check times against now: a screening found an hour ago may be about to start.
    const items = needsTime(q) ? validateListings(cached.items.map(toRaw), q, null) : cached.items;
    if (items.length) return { items, city, live: true, note: null, generatedAt: cached.fetchedAt.toISOString() };
  }

  if (!(await consumeSearch(deps, user, win.localDate))) {
    throw new AppError(429, 'leisure_limit', `At most ${LEISURE_DAILY_LIMIT} searches a day`);
  }
  const result = await deps.ai.leisure.suggest(q, log);
  if (result.live && result.items.length) {
    await deps.db
      .insert(leisureCache)
      .values({ key, items: result.items, fetchedAt: now })
      .onConflictDoUpdate({ target: leisureCache.key, set: { items: result.items, fetchedAt: now } });
  }
  // Old cache rows are never needed again.
  await deps.db.delete(leisureCache).where(and(lt(leisureCache.fetchedAt, new Date(now.getTime() - CACHE_MS))));
  return { items: result.items, city, live: result.live, note: result.note, generatedAt: now.toISOString() };
}
