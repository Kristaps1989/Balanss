/**
 * Railway infrastructure as code: the whole production setup in one file.
 * Every push to main that changes this file is applied by .github/workflows/railway.yml,
 * so the database, links (variable references), volume, domain and region can't drift.
 *
 *   railway config plan    # preview the difference against the live project
 *   railway config apply   # apply it (prompts before anything destructive)
 *
 * Secrets are never in this file: `preserve()` keeps the value set once in the Railway
 * dashboard (Variables). Anything removed from this file is removed on Railway, so add
 * new variables here, not only in the dashboard. Steps: docs/RAILWAY.md.
 */
import { defineRailway, github, postgres, preserve, project, service, volume } from 'railway/iac';

/** EU West (Amsterdam): health data stays in the EU (GDPR). */
const REGION = 'europe-west4-drams3a';
const DOMAIN = 'balanss-production.up.railway.app';
const PORT = 8081;

export default defineRailway(() => {
  const db = postgres('Postgres', { region: REGION });
  const data = volume('balanss-data', { region: REGION }); // meal photos

  const api = service('Balanss', {
    // "Wait for CI": deploy a commit only after GitHub Actions is green on it.
    source: github('Kristaps1989/Balanss', { branch: 'main', checkSuites: true }),
    build: {
      builder: 'DOCKERFILE',
      dockerfilePath: 'backend/Dockerfile',
      watchPatterns: ['backend/**', 'shared/**'],
    },
    preDeploy: 'node dist/migrate.js',
    healthcheck: '/health',
    healthcheckTimeout: 60,
    deploy: { restartPolicyType: 'ON_FAILURE', restartPolicyMaxRetries: 5 },
    regions: { [REGION]: 1 },
    networking: { serviceDomains: { [DOMAIN]: { port: PORT } } },
    volumeMounts: { '/data': data },
    env: {
      NODE_ENV: 'production',
      PORT: String(PORT),
      DATABASE_URL: db.env.DATABASE_URL,
      STORAGE_DIR: '/data/storage',
      // Railway mounts volumes as root; the container runs as the `node` user.
      RAILWAY_RUN_UID: '0',
      EMAIL_PROVIDER: 'resend',
      EMAIL_FROM: 'Balanss <onboarding@resend.dev>',
      // Set once in the dashboard, kept on every apply:
      JWT_SECRET: preserve(),
      ANTHROPIC_API_KEY: preserve(),
      RESEND_API_KEY: preserve(),
      GOOGLE_CLIENT_IDS: preserve(),
      REVENUECAT_WEBHOOK_SECRET: preserve(),
      EXPO_ACCESS_TOKEN: preserve(),
    },
  });

  return project('Balanss', { environments: ['production'], resources: [db, api, data] });
});
