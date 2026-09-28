import { randomUUID } from 'node:crypto';

import { and, eq, gt, isNull } from 'drizzle-orm';
import { OAuth2Client } from 'google-auth-library';
import { createRemoteJWKSet, jwtVerify, SignJWT } from 'jose';

import type { AuthTokens } from '../../../shared/api';
import type { Config } from '../config';
import type { Db } from '../db/client';
import { refreshTokens, users, type UserRow } from '../db/schema';
import { AppError, unauthorized } from '../errors';
import { randomToken, sha256 } from '../lib/crypto';
import { newUserValues } from './users';

export const ACCESS_TTL_SEC = 15 * 60;
export const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const MAGIC_LINK_TTL_MS = 15 * 60 * 1000;

const ISSUER = 'balanss-api';
const AUDIENCE = 'balanss-app';

// ---------------------------------------------------------------- identity verifiers

export interface VerifiedIdentity {
  sub: string;
  email: string | null;
  emailVerified: boolean;
  firstName?: string | null;
}

export type IdentityVerifier = (token: string) => Promise<VerifiedIdentity>;

export function googleVerifier(clientIds: string[]): IdentityVerifier {
  const client = new OAuth2Client();
  return async (idToken) => {
    if (!clientIds.length) throw new AppError(503, 'provider_not_configured', 'Google sign-in is not configured');
    let payload;
    try {
      const ticket = await client.verifyIdToken({ idToken, audience: clientIds });
      payload = ticket.getPayload();
    } catch {
      throw unauthorized('invalid_token', 'Google token could not be verified');
    }
    if (!payload?.sub) throw unauthorized('invalid_token', 'Google token has no subject');
    return { sub: payload.sub, email: payload.email ?? null, emailVerified: payload.email_verified === true, firstName: payload.given_name ?? null };
  };
}

export function appleVerifier(bundleIds: string[]): IdentityVerifier {
  const jwks = createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys'));
  return async (identityToken) => {
    if (!bundleIds.length) throw new AppError(503, 'provider_not_configured', 'Apple sign-in is not configured');
    try {
      const { payload } = await jwtVerify(identityToken, jwks, { issuer: 'https://appleid.apple.com', audience: bundleIds });
      if (!payload.sub) throw new Error('no sub');
      const email = typeof payload.email === 'string' ? payload.email : null;
      const verified = payload.email_verified === true || payload.email_verified === 'true';
      return { sub: payload.sub, email, emailVerified: verified };
    } catch {
      throw unauthorized('invalid_token', 'Apple token could not be verified');
    }
  };
}

// ---------------------------------------------------------------- access tokens

export async function signAccessToken(config: Config, userId: string): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TTL_SEC}s`)
    .sign(new TextEncoder().encode(config.jwtSecret));
}

export async function verifyAccessToken(config: Config, token: string): Promise<string> {
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(config.jwtSecret), {
      issuer: ISSUER,
      audience: AUDIENCE,
      algorithms: ['HS256'],
    });
    if (!payload.sub) throw new Error('no sub');
    return payload.sub;
  } catch {
    throw unauthorized('invalid_token', 'Access token is invalid or expired');
  }
}

// ---------------------------------------------------------------- refresh tokens

async function insertRefreshToken(db: Pick<Db, 'insert'>, userId: string, familyId: string): Promise<{ id: string; token: string }> {
  const token = randomToken();
  const [row] = await db
    .insert(refreshTokens)
    .values({ userId, familyId, tokenHash: sha256(token), expiresAt: new Date(Date.now() + REFRESH_TTL_MS) })
    .returning({ id: refreshTokens.id });
  return { id: row!.id, token };
}

export async function issueTokens(db: Db, config: Config, user: Pick<UserRow, 'id' | 'email'>, isNew: boolean): Promise<AuthTokens> {
  const { token } = await insertRefreshToken(db, user.id, randomUUID());
  return {
    accessToken: await signAccessToken(config, user.id),
    refreshToken: token,
    expiresIn: ACCESS_TTL_SEC,
    user: { id: user.id, email: user.email, isNew },
  };
}

async function revokeFamily(db: Db, familyId: string): Promise<void> {
  await db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(refreshTokens.familyId, familyId), isNull(refreshTokens.revokedAt)));
}

/**
 * Rotate a refresh token: the presented token is revoked and replaced by a new
 * one in the same family. Presenting an already-rotated token is treated as
 * theft: the whole family is revoked.
 */
export async function rotateRefreshToken(db: Db, config: Config, presented: string): Promise<AuthTokens> {
  const hash = sha256(presented);
  const [row] = await db.select().from(refreshTokens).where(eq(refreshTokens.tokenHash, hash));
  if (!row) throw unauthorized('invalid_refresh_token', 'Refresh token is invalid');

  if (row.revokedAt) {
    if (row.replacedById) {
      await revokeFamily(db, row.familyId);
      throw unauthorized('refresh_token_reused', 'Refresh token was already used; please sign in again');
    }
    throw unauthorized('invalid_refresh_token', 'Refresh token has been revoked');
  }
  if (row.expiresAt <= new Date()) throw unauthorized('invalid_refresh_token', 'Refresh token has expired');

  return db.transaction(async (tx) => {
    const { id: newId, token } = await insertRefreshToken(tx, row.userId, row.familyId);
    // Conditional update makes concurrent rotations of the same token lose cleanly.
    const updated = await tx
      .update(refreshTokens)
      .set({ revokedAt: new Date(), replacedById: newId })
      .where(and(eq(refreshTokens.id, row.id), isNull(refreshTokens.revokedAt), gt(refreshTokens.expiresAt, new Date())))
      .returning({ id: refreshTokens.id });
    // Throwing inside the transaction also discards the token inserted above.
    if (!updated.length) throw unauthorized('invalid_refresh_token', 'Refresh token was already rotated');
    const [user] = await tx.select({ id: users.id, email: users.email }).from(users).where(eq(users.id, row.userId));
    if (!user) throw unauthorized('invalid_refresh_token', 'User no longer exists');
    return {
      accessToken: await signAccessToken(config, user.id),
      refreshToken: token,
      expiresIn: ACCESS_TTL_SEC,
      user: { id: user.id, email: user.email, isNew: false },
    };
  });
}

/** Logout: revoke every token in the presented token's family. Unknown tokens are ignored. */
export async function logout(db: Db, presented: string): Promise<void> {
  const [row] = await db.select({ familyId: refreshTokens.familyId }).from(refreshTokens).where(eq(refreshTokens.tokenHash, sha256(presented)));
  if (row) await revokeFamily(db, row.familyId);
}

// ---------------------------------------------------------------- users

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

/**
 * Find the user for a verified identity or create one. Links a provider to an
 * existing e-mail account only when the provider vouches for the e-mail.
 */
export async function findOrCreateUser(
  db: Db,
  provider: 'google' | 'apple' | 'email',
  identity: VerifiedIdentity,
): Promise<{ user: UserRow; isNew: boolean }> {
  const subCol = provider === 'google' ? users.googleSub : provider === 'apple' ? users.appleSub : null;
  if (subCol) {
    const [bySub] = await db.select().from(users).where(eq(subCol, identity.sub));
    if (bySub) return { user: bySub, isNew: false };
  }
  const email = identity.email ? normalizeEmail(identity.email) : null;
  if (email && identity.emailVerified) {
    const [byEmail] = await db.select().from(users).where(eq(users.email, email));
    if (byEmail) {
      if (subCol) {
        const [linked] = await db
          .update(users)
          .set(provider === 'google' ? { googleSub: identity.sub } : { appleSub: identity.sub })
          .where(eq(users.id, byEmail.id))
          .returning();
        return { user: linked!, isNew: false };
      }
      return { user: byEmail, isNew: false };
    }
  }
  if (!email) throw new AppError(400, 'email_required', 'The identity provider did not share an e-mail address');
  if (!identity.emailVerified) throw new AppError(400, 'email_unverified', 'The e-mail address is not verified');

  const values = newUserValues(email, {
    firstName: identity.firstName,
    googleSub: provider === 'google' ? identity.sub : undefined,
    appleSub: provider === 'apple' ? identity.sub : undefined,
  });
  const [created] = await db.insert(users).values(values).onConflictDoNothing().returning();
  if (created) return { user: created, isNew: true };
  // Lost a race with a concurrent sign-in for the same e-mail.
  const [existing] = await db.select().from(users).where(eq(users.email, email));
  return { user: existing!, isNew: false };
}
