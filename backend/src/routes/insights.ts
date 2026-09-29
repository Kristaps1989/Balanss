import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

import { parse } from '../errors';
import { getRecipes, getWeeklySummary, logRecipe } from '../services/insights';
import { userToday } from '../services/quota';
import { getUser } from '../services/users';
import { DateQuery, DateStr } from './schemas';

/** AI analysis for Pro: weekly summary and meal ideas (402 pro_required on the free plan). */
export const insightRoutes: FastifyPluginAsync = async (app) => {
  const { db } = app.deps;

  app.get('/insights/weekly', async (req) => {
    const q = parse(DateQuery, req.query);
    const user = await getUser(db, req.userId);
    return getWeeklySummary(app.deps, user, q.date ?? userToday(user, app.deps.now()), req.log);
  });

  app.get('/recipes', async (req) => {
    const q = parse(DateQuery, req.query);
    const user = await getUser(db, req.userId);
    return getRecipes(app.deps, user, q.date ?? userToday(user, app.deps.now()), req.log);
  });

  app.post('/recipes/:id/log', async (req) => {
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const { date } = parse(z.object({ date: DateStr }), req.body);
    const user = await getUser(db, req.userId);
    return logRecipe(app.deps, user, id, date);
  });
};
