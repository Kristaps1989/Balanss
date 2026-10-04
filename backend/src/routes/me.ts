import { eq } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

import type { Profile } from '../../../shared/api';
import { toISODate } from '../../../shared/dates';
import { LEISURE_CITIES } from '../../../shared/leisure';
import { levelsFromScores, retestFrom, scoreAnswers, styleDescription, styleName, validateAnswers } from '../../../shared/personality';
import { KCAL_FLOOR, minGoalWeight, weightLossAllowed } from '../../../shared/safety';
import { computeTargets } from '../../../shared/targets';
import { personalities, users } from '../db/schema';
import { AppError, badRequest, parse } from '../errors';
import { createExportToken, deleteAccount } from '../services/gdpr';
import { getQuota } from '../services/quota';
import { getPersonality, getUser, loadMe } from '../services/users';
import { DevicesPatch, PreferencesPatch, ProfilePatch, RemindersPatch, TargetsPatch, ToneStyle } from './schemas';

export const meRoutes: FastifyPluginAsync = async (app) => {
  const { db, config } = app.deps;
  const touch = () => ({ updatedAt: app.deps.now() });
  const me = (userId: string) => loadMe(db, userId, app.deps.now());

  app.get('/me', async (req) => me(req.userId));

  app.put('/me/profile', async (req) => {
    const patch = parse(ProfilePatch, req.body);
    const user = await getUser(db, req.userId);
    const profile: Profile = { ...user.profile, ...patch };
    if (!profile.goals.includes('weight')) {
      profile.weightDirection = null;
      profile.goalWeightKg = null;
    }
    // Safety floors for a weight-loss goal, checked whenever the goal itself is set or changed.
    const goalTouched = patch.goals !== undefined || patch.weightDirection !== undefined || patch.goalWeightKg !== undefined;
    if (goalTouched && profile.goals.includes('weight') && profile.weightDirection === 'down') {
      if (!weightLossAllowed(profile)) {
        throw badRequest('weight_loss_not_allowed', 'A weight-loss goal is not offered under 18 or at a BMI of 18.5 or lower');
      }
      if (profile.goalWeightKg !== null && profile.goalWeightKg < minGoalWeight(profile.heightCm)) {
        throw badRequest('goal_below_healthy', `The goal weight must be at least ${minGoalWeight(profile.heightCm)} kg for this height`);
      }
    }
    // Targets follow the profile until the user edits them by hand.
    const targets = user.targetsEdited ? user.targets : computeTargets(profile);
    await db.update(users).set({ profile, targets, ...touch() }).where(eq(users.id, user.id));
    return me(user.id);
  });

  app.put('/me/targets', async (req) => {
    const patch = parse(TargetsPatch, req.body);
    const user = await getUser(db, req.userId);
    const floor = KCAL_FLOOR[user.profile.sex];
    if (patch.kcal !== undefined && patch.kcal < floor) {
      throw badRequest('target_below_floor', `The energy target must be at least ${floor} kcal`);
    }
    await db
      .update(users)
      .set({ targets: { ...user.targets, ...patch }, targetsEdited: true, ...touch() })
      .where(eq(users.id, user.id));
    return me(user.id);
  });

  app.put('/me/tone', async (req) => {
    const { preference } = parse(z.object({ preference: z.union([z.literal('auto'), ToneStyle]) }), req.body);
    await db.update(users).set({ tonePreference: preference, ...touch() }).where(eq(users.id, req.userId));
    return me(req.userId);
  });

  app.put('/me/reminders', async (req) => {
    const patch = parse(RemindersPatch, req.body);
    const user = await getUser(db, req.userId);
    await db.update(users).set({ reminders: { ...user.reminders, ...patch }, ...touch() }).where(eq(users.id, user.id));
    return me(user.id);
  });

  app.put('/me/devices', async (req) => {
    const patch = parse(DevicesPatch, req.body);
    const user = await getUser(db, req.userId);
    await db.update(users).set({ devices: { ...user.devices, ...patch }, ...touch() }).where(eq(users.id, user.id));
    return me(user.id);
  });

  app.put('/me/preferences', async (req) => {
    const patch = parse(PreferencesPatch, req.body);
    const user = await getUser(db, req.userId);
    const preferences = { ...user.preferences, ...patch };
    preferences.avoid = [...new Set(preferences.avoid)].sort();
    await db.update(users).set({ preferences, ...touch() }).where(eq(users.id, user.id));
    return me(user.id);
  });

  // City for free-time suggestions (picked from the list; no GPS).
  app.put('/me/city', async (req) => {
    const { city } = parse(z.object({ city: z.enum(LEISURE_CITIES) }).strict(), req.body);
    await db.update(users).set({ leisureCity: city, ...touch() }).where(eq(users.id, req.userId));
    return me(req.userId);
  });

  // AI personalisation on/off: off means no personal data goes to the AI for copy (templates instead).
  app.put('/me/ai', async (req) => {
    const { enabled } = parse(z.object({ enabled: z.boolean() }).strict(), req.body);
    await db.update(users).set({ aiPersonalization: enabled, ...touch() }).where(eq(users.id, req.userId));
    return me(req.userId);
  });

  app.post('/me/onboarding/complete', async (req) => {
    await db.update(users).set({ onboardingDone: true, ...touch() }).where(eq(users.id, req.userId));
    return me(req.userId);
  });

  app.post('/me/personality', async (req) => {
    const body = parse(z.object({ consent: z.boolean(), answers: z.array(z.unknown()) }), req.body);
    // Special-category data: without explicit consent nothing is stored.
    if (!body.consent) throw badRequest('consent_required', 'Consent is required to store the personality profile');
    if (!validateAnswers(body.answers)) throw badRequest('invalid_answers', 'answers must be 20 integers from 1 to 5');
    const user = await getUser(db, req.userId);
    const existing = await getPersonality(db, user.id);
    const now = app.deps.now();
    const today = toISODate(now);
    if (existing && existing.retestFrom > today) {
      throw new AppError(409, 'retest_locked', `The test can be retaken from ${existing.retestFrom}`);
    }
    const scores = scoreAnswers(body.answers);
    const levels = levelsFromScores(scores);
    const values = {
      answers: body.answers,
      scores,
      levels,
      styleName: styleName(levels, user.profile.sex),
      styleDescription: styleDescription(levels),
      testedAt: now,
      retestFrom: toISODate(retestFrom(now)),
    };
    await db
      .insert(personalities)
      .values({ userId: user.id, ...values })
      .onConflictDoUpdate({ target: personalities.userId, set: values });
    return me(user.id);
  });

  app.delete('/me/personality', async (req) => {
    await db.delete(personalities).where(eq(personalities.userId, req.userId));
    return me(req.userId);
  });

  app.post('/me/export', async (req) => createExportToken(db, config, req.userId, app.deps.now()));

  app.delete('/me', async (req) => {
    await deleteAccount(db, config, req.userId);
    return { ok: true as const };
  });

  app.get('/me/quota', async (req) => {
    const user = await getUser(db, req.userId);
    return getQuota(db, user, config.freeAnalysesPerDay, app.deps.now());
  });

};
