import { eq } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

import { users } from '../db/schema';
import { AppError, notFound, parse, unauthorized } from '../errors';
import { safeEqual } from '../lib/crypto';
import { collectExport, redeemExportToken } from '../services/gdpr';
import { readPhoto, verifyPhotoSignature } from '../services/photos';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PRO_EVENTS = new Set(['INITIAL_PURCHASE', 'RENEWAL', 'UNCANCELLATION', 'PRODUCT_CHANGE']);

/** Routes that authenticate by other means than the bearer access token. */
export const publicRoutes: FastifyPluginAsync = async (app) => {
  const { db, config } = app.deps;

  // Signed, expiring photo URLs (so <Image> can load them without headers).
  app.get('/photos/:key', async (req, reply) => {
    const { key } = parse(z.object({ key: z.string().max(64) }), req.params);
    const q = parse(z.object({ exp: z.string().max(20), sig: z.string().max(100) }), req.query);
    if (!verifyPhotoSignature(config, key, q.exp, q.sig, app.deps.now().getTime())) {
      throw new AppError(403, 'invalid_signature', 'The photo link is invalid or expired');
    }
    const photo = await readPhoto(config, key);
    if (!photo) throw notFound('Photo');
    return reply.header('Content-Type', photo.mediaType).header('Cache-Control', 'private, max-age=3600').send(photo.data);
  });

  // GDPR export download: single use, no auth header (the link is the credential).
  app.get('/exports/:token', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (req, reply) => {
    const { token } = parse(z.object({ token: z.string().min(10).max(200) }), req.params);
    const now = app.deps.now();
    const userId = await redeemExportToken(db, token, now);
    if (!userId) throw new AppError(410, 'export_unavailable', 'The export link is invalid, expired or already used');
    const data = await collectExport(db, userId, now);
    if (!data) throw new AppError(410, 'export_unavailable', 'The account no longer exists');
    const filename = `balanss-dati-${now.toISOString().slice(0, 10)}.json`;
    return reply
      .header('Content-Type', 'application/json; charset=utf-8')
      .header('Content-Disposition', `attachment; filename="${filename}"`)
      .header('Cache-Control', 'no-store')
      .send(JSON.stringify(data, null, 2));
  });

  // RevenueCat → plan. app_user_id is our user id.
  app.post('/billing/webhook', async (req) => {
    const secret = config.revenuecatWebhookSecret;
    const header = req.headers.authorization ?? '';
    if (!secret || !safeEqual(header, `Bearer ${secret}`)) throw unauthorized();
    const body = parse(
      z.object({
        event: z
          .object({
            type: z.string(),
            app_user_id: z.string().optional(),
            original_app_user_id: z.string().optional(),
            aliases: z.array(z.string()).optional(),
            expiration_at_ms: z.number().nullish(),
          })
          .passthrough(),
      }),
      req.body,
    );
    const e = body.event;
    const userId = [e.app_user_id, e.original_app_user_id, ...(e.aliases ?? [])].find((id): id is string => !!id && UUID.test(id));
    if (!userId) return { ok: true as const };
    if (PRO_EVENTS.has(e.type)) {
      await db
        .update(users)
        .set({ plan: 'pro', planExpiresAt: e.expiration_at_ms ? new Date(e.expiration_at_ms) : null, updatedAt: app.deps.now() })
        .where(eq(users.id, userId));
    } else if (e.type === 'EXPIRATION') {
      await db.update(users).set({ plan: 'free', planExpiresAt: null, updatedAt: app.deps.now() }).where(eq(users.id, userId));
    }
    req.log.info({ billing: { type: e.type } }, 'billing event');
    return { ok: true as const };
  });
};
