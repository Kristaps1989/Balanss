import { and, eq } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

import { tips, weeklyQuestions } from '../db/schema';
import { badRequest, notFound, parse } from '../errors';
import { getOrCreateTip, getWeeklyQuestion, nextTip } from '../services/copy';
import { toTip, toWeeklyQuestion } from '../services/day';
import { userToday } from '../services/quota';
import { getUser } from '../services/users';
import { DateQuery } from './schemas';

export const copyRoutes: FastifyPluginAsync = async (app) => {
  const { db } = app.deps;

  app.get('/tips/today', async (req) => {
    const q = parse(DateQuery, req.query);
    const user = await getUser(db, req.userId);
    return getOrCreateTip(app.deps, user, q.date ?? userToday(user, app.deps.now()), req.log);
  });

  app.post('/tips/next', async (req) => {
    const q = parse(DateQuery, req.query);
    const user = await getUser(db, req.userId);
    return nextTip(app.deps, user, q.date ?? userToday(user, app.deps.now()), req.log);
  });

  app.post('/tips/:id/accept', async (req) => {
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const [row] = await db
      .update(tips)
      .set({ accepted: true })
      .where(and(eq(tips.id, id), eq(tips.userId, req.userId)))
      .returning();
    if (!row) throw notFound('Tip');
    return toTip(row);
  });

  app.get('/weekly-question', async (req) => {
    const q = parse(DateQuery, req.query);
    const user = await getUser(db, req.userId);
    return getWeeklyQuestion(app.deps, user, q.date ?? userToday(user, app.deps.now()), req.log);
  });

  app.post('/weekly-question/:id/answer', async (req) => {
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const { optionIndex } = parse(z.object({ optionIndex: z.number().int().min(0) }), req.body);
    const [q] = await db
      .select()
      .from(weeklyQuestions)
      .where(and(eq(weeklyQuestions.id, id), eq(weeklyQuestions.userId, req.userId)));
    if (!q) throw notFound('Weekly question');
    if (optionIndex >= q.options.length) throw badRequest('invalid_option', 'optionIndex is out of range');
    const [row] = await db
      .update(weeklyQuestions)
      .set({ answerIndex: optionIndex, answeredAt: app.deps.now() })
      .where(eq(weeklyQuestions.id, id))
      .returning();
    return toWeeklyQuestion(row!);
  });
};
