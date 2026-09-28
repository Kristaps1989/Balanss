import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { getTableName, sql } from 'drizzle-orm';
import { PgTable } from 'drizzle-orm/pg-core';
import type { FastifyInstance, InjectOptions } from 'fastify';
import { vi } from 'vitest';

import type { AuthTokens } from '../../shared/api';
import { fakeAi, type AiService } from '../src/ai';
import { buildApp } from '../src/app';
import { loadConfig, type Config } from '../src/config';
import { createDb, type Db } from '../src/db/client';
import { runMigrations } from '../src/db/migrate';
import * as schema from '../src/db/schema';
import type { AppDeps } from '../src/deps';
import { unauthorized } from '../src/errors';
import type { IdentityVerifier } from '../src/services/auth';
import type { EmailSender, MagicLinkEmail } from '../src/services/email';
import type { PushMessage, PushSender } from '../src/services/push';

const { db, pool } = createDb(process.env.DATABASE_URL!);
let migrated: Promise<void> | null = null;

export { db, pool };

export async function resetDb(): Promise<void> {
  migrated ??= runMigrations(db);
  await migrated;
  const tables = (Object.values(schema) as unknown[])
    .filter((t): t is PgTable => t instanceof PgTable)
    .map((t) => `"${getTableName(t)}"`);
  await db.execute(sql.raw(`TRUNCATE ${tables.join(', ')} CASCADE`));
}

export class FakeEmail implements EmailSender {
  readonly kind = 'fake' as const;
  sent: MagicLinkEmail[] = [];
  async sendMagicLink(mail: MagicLinkEmail) {
    this.sent.push(mail);
  }
}

export class FakePush implements PushSender {
  sent: PushMessage[] = [];
  async send(messages: PushMessage[]) {
    this.sent.push(...messages);
    return messages.map((m) => ({ token: m.to, ok: true }));
  }
}

/** Test tokens look like "sub|email" ("sub|" for none); "bad" fails verification. */
export const stubVerifier: IdentityVerifier = async (token) => {
  if (token.startsWith('bad')) throw unauthorized('invalid_token', 'bad token');
  const [sub, email, first] = token.split('|');
  return { sub: sub!, email: email || null, emailVerified: true, firstName: first ?? null };
};

export interface TestContext {
  app: FastifyInstance;
  deps: AppDeps;
  email: FakeEmail;
  push: FakePush;
  config: Config;
  fetch: ReturnType<typeof vi.fn>;
}

export async function makeApp(overrides: { config?: Partial<Config>; ai?: AiService; now?: () => Date } = {}): Promise<TestContext> {
  const config = loadConfig(process.env, {
    emailProvider: 'console',
    aiProvider: 'fake',
    storageDir: mkdtempSync(path.join(tmpdir(), 'balanss-test-')),
    scheduler: false,
    rateLimitMax: 100_000,
    authRateLimitMax: 100_000,
    revenuecatWebhookSecret: 'rc-test-secret',
    publicApiUrl: 'http://api.test',
    logLevel: 'silent',
    ...overrides.config,
  });
  const email = new FakeEmail();
  const push = new FakePush();
  const fetchMock = vi.fn();
  const deps: AppDeps = {
    config,
    db,
    ai: overrides.ai ?? fakeAi(),
    email,
    push,
    verifyGoogle: stubVerifier,
    verifyApple: stubVerifier,
    fetch: fetchMock as unknown as typeof fetch,
    now: overrides.now ?? (() => new Date()),
  };
  const app = await buildApp(deps);
  await app.ready();
  return { app, deps, email, push, config, fetch: fetchMock };
}

export async function loginByEmail(app: FastifyInstance, email: string): Promise<AuthTokens> {
  const res = await app.inject({ method: 'POST', url: '/v1/auth/magic-link', payload: { email } });
  const { devToken } = res.json() as { devToken: string };
  const verify = await app.inject({ method: 'POST', url: '/v1/auth/magic-link/verify', payload: { token: devToken } });
  return verify.json() as AuthTokens;
}

/** inject() with a bearer token. */
export function authed(app: FastifyInstance, token: string) {
  return (opts: InjectOptions) => app.inject({ ...opts, headers: { ...(opts.headers ?? {}), authorization: `Bearer ${token}` } });
}

/** A tiny JPEG header — enough for the signature check; the fake AI never decodes it. */
export const JPEG_BASE64 = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, 1)]).toString('base64');
