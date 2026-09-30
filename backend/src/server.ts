import { createAi } from './ai';
import { buildApp } from './app';
import { loadConfig } from './config';
import { createDb } from './db/client';
import type { AppDeps } from './deps';
import { startScheduler } from './scheduler';
import { appleVerifier, googleVerifier } from './services/auth';
import { createEmailSender } from './services/email';
import { expoPushSender } from './services/push';

async function main() {
  const config = loadConfig();
  const { db, pool } = createDb(config.databaseUrl);
  const deps: AppDeps = {
    config,
    db,
    ai: createAi(config),
    email: createEmailSender(config),
    push: expoPushSender(process.env.EXPO_ACCESS_TOKEN),
    verifyGoogle: googleVerifier(config.googleClientIds),
    verifyApple: appleVerifier(config.appleBundleIds),
    fetch: globalThis.fetch,
    now: () => new Date(),
  };
  const app = await buildApp(deps);
  const stopScheduler = config.scheduler ? startScheduler(deps, app.log) : () => undefined;

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, 'shutting down');
    stopScheduler();
    await app.close();
    await pool.end();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  await app.listen({ port: config.port, host: config.host });
  if (config.nodeEnv === 'production' && config.emailProvider === 'console') {
    app.log.warn('EMAIL_PROVIDER is console: sign-in e-mails are NOT sent. Set EMAIL_PROVIDER=resend and RESEND_API_KEY.');
  }
  if (config.aiProvider === 'fake') app.log.warn('ANTHROPIC_API_KEY is not set: AI copy uses the reviewed templates only.');
  app.log.info({ ai: config.aiProvider, emailProvider: config.emailProvider, scheduler: config.scheduler }, 'balanss api ready');
}

main().catch((err: unknown) => {
  console.error('failed to start', err);
  process.exit(1);
});
