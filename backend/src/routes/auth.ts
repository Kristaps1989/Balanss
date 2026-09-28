import { and, eq, gt, isNull } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

import type { MagicLinkResponse } from '../../../shared/api';
import { magicLinks } from '../db/schema';
import { parse, unauthorized } from '../errors';
import { randomToken, sha256 } from '../lib/crypto';
import { findOrCreateUser, issueTokens, logout, MAGIC_LINK_TTL_MS, normalizeEmail, rotateRefreshToken } from '../services/auth';

const TokenBody = z.object({ refreshToken: z.string().min(10).max(200) });

export const authRoutes: FastifyPluginAsync = async (app) => {
  const { db, config } = app.deps;
  const limited = { config: { rateLimit: { max: config.authRateLimitMax, timeWindow: '1 minute' } } };

  app.post('/google', limited, async (req) => {
    const { idToken } = parse(z.object({ idToken: z.string().min(10).max(5000) }), req.body);
    const identity = await app.deps.verifyGoogle(idToken);
    const { user, isNew } = await findOrCreateUser(db, 'google', identity);
    return issueTokens(db, config, user, isNew);
  });

  app.post('/apple', limited, async (req) => {
    const body = parse(z.object({ identityToken: z.string().min(10).max(5000), firstName: z.string().trim().max(60).optional() }), req.body);
    const identity = await app.deps.verifyApple(body.identityToken);
    const { user, isNew } = await findOrCreateUser(db, 'apple', { ...identity, firstName: body.firstName ?? null });
    return issueTokens(db, config, user, isNew);
  });

  app.post('/magic-link', limited, async (req): Promise<MagicLinkResponse> => {
    const { email } = parse(z.object({ email: z.string().trim().toLowerCase().pipe(z.email()).pipe(z.string().max(254)) }), req.body);
    const token = randomToken(32);
    await db.insert(magicLinks).values({
      email: normalizeEmail(email),
      tokenHash: sha256(token),
      expiresAt: new Date(app.deps.now().getTime() + MAGIC_LINK_TTL_MS),
    });
    const q = `token=${encodeURIComponent(token)}`;
    await app.deps.email.sendMagicLink({ to: email, appLink: `${config.appScheme}://auth?${q}`, webLink: `${config.publicWebUrl}/auth?${q}` }, req.log);
    return config.emailProvider === 'console' ? { ok: true, devToken: token } : { ok: true };
  });

  app.post('/magic-link/verify', limited, async (req) => {
    const { token } = parse(z.object({ token: z.string().min(10).max(200) }), req.body);
    const now = app.deps.now();
    // Single use: the conditional update succeeds for exactly one request.
    const [link] = await db
      .update(magicLinks)
      .set({ usedAt: now })
      .where(and(eq(magicLinks.tokenHash, sha256(token)), isNull(magicLinks.usedAt), gt(magicLinks.expiresAt, now)))
      .returning({ email: magicLinks.email });
    if (!link) throw unauthorized('invalid_token', 'The sign-in link is invalid, expired or already used');
    const { user, isNew } = await findOrCreateUser(db, 'email', { sub: link.email, email: link.email, emailVerified: true });
    return issueTokens(db, config, user, isNew);
  });

  app.post('/refresh', limited, async (req) => {
    const { refreshToken } = parse(TokenBody, req.body);
    return rotateRefreshToken(db, config, refreshToken);
  });

  app.post('/logout', limited, async (req) => {
    const { refreshToken } = parse(TokenBody, req.body);
    await logout(db, refreshToken);
    return { ok: true as const };
  });

};
