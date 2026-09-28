/** Runtime configuration, read once from the environment. Every variable is documented in README.md. */

export type EmailProvider = 'console' | 'resend';
export type AiProviderName = 'anthropic' | 'fake';

export interface Config {
  nodeEnv: string;
  port: number;
  host: string;
  logLevel: string;
  databaseUrl: string;
  jwtSecret: string;
  publicApiUrl: string;
  publicWebUrl: string;
  appScheme: string;
  /** '*' allows every origin (dev only). */
  corsOrigins: string[] | '*';
  googleClientIds: string[];
  appleBundleIds: string[];
  emailProvider: EmailProvider;
  emailFrom: string;
  resendApiKey: string | null;
  storageDir: string;
  aiProvider: AiProviderName;
  aiModel: string;
  anthropicApiKey: string | null;
  revenuecatWebhookSecret: string | null;
  scheduler: boolean;
  rateLimitMax: number;
  authRateLimitMax: number;
  freeAnalysesPerDay: number;
  defaultTimezone: string;
}

const list = (v: string | undefined) =>
  (v ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

const DEV_JWT_SECRET = 'dev-only-jwt-secret-change-me-0123456789abcdef';

export function loadConfig(env: NodeJS.ProcessEnv = process.env, overrides: Partial<Config> = {}): Config {
  const nodeEnv = env.NODE_ENV ?? 'development';
  const production = nodeEnv === 'production';
  const port = Number(env.PORT ?? 3000);

  const jwtSecret = env.JWT_SECRET ?? (production ? '' : DEV_JWT_SECRET);
  if (jwtSecret.length < 32) throw new Error('JWT_SECRET must be set to at least 32 characters');

  const cors = env.CORS_ORIGINS?.trim();
  const corsOrigins: string[] | '*' = cors ? (cors === '*' ? '*' : list(cors)) : production ? [] : '*';

  const anthropicApiKey = env.ANTHROPIC_API_KEY?.trim() || null;
  const aiProvider = (env.AI_PROVIDER as AiProviderName | undefined) ?? (anthropicApiKey ? 'anthropic' : 'fake');
  if (aiProvider !== 'anthropic' && aiProvider !== 'fake') throw new Error('AI_PROVIDER must be anthropic or fake');

  const emailProvider = (env.EMAIL_PROVIDER as EmailProvider | undefined) ?? 'console';
  if (emailProvider !== 'console' && emailProvider !== 'resend') throw new Error('EMAIL_PROVIDER must be console or resend');
  if (emailProvider === 'resend' && !env.RESEND_API_KEY) throw new Error('RESEND_API_KEY is required with EMAIL_PROVIDER=resend');

  const databaseUrl = env.DATABASE_URL ?? 'postgres://balanss:balanss@localhost:5432/balanss';

  return {
    nodeEnv,
    port,
    host: env.HOST ?? '0.0.0.0',
    logLevel: env.LOG_LEVEL ?? (production ? 'info' : 'debug'),
    databaseUrl,
    jwtSecret,
    publicApiUrl: (env.PUBLIC_API_URL ?? `http://localhost:${port}`).replace(/\/$/, ''),
    publicWebUrl: (env.PUBLIC_WEB_URL ?? 'https://balanss.app').replace(/\/$/, ''),
    appScheme: env.APP_SCHEME || 'balanss',
    corsOrigins,
    googleClientIds: list(env.GOOGLE_CLIENT_IDS),
    appleBundleIds: list(env.APPLE_BUNDLE_IDS),
    emailProvider,
    emailFrom: env.EMAIL_FROM ?? 'Balanss <noreply@balanss.app>',
    resendApiKey: env.RESEND_API_KEY ?? null,
    storageDir: env.STORAGE_DIR ?? './storage',
    aiProvider,
    aiModel: env.AI_MODEL || 'claude-opus-5-5',
    anthropicApiKey,
    revenuecatWebhookSecret: env.REVENUECAT_WEBHOOK_SECRET ?? null,
    scheduler: (env.SCHEDULER ?? 'on') !== 'off',
    rateLimitMax: Number(env.RATE_LIMIT_MAX ?? 300),
    authRateLimitMax: Number(env.AUTH_RATE_LIMIT_MAX ?? 20),
    freeAnalysesPerDay: 3,
    defaultTimezone: env.DEFAULT_TIMEZONE ?? 'Europe/Riga',
    ...overrides,
  };
}
