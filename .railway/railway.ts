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
/** Railway's own domain: kept so app builds from before the custom domain still work. */
const DOMAIN = 'balanss-production.up.railway.app';
/** Custom domain (CNAME at the zestwell.app DNS provider → the target Railway shows under Networking). */
const API_DOMAIN = 'api.zestwell.app';
/** Public website (backend/src/site), served by the same service. */
const WEB_DOMAIN = 'zestwell.app';
const PORT = 8081;

export default defineRailway(() => {
  const db = postgres('Postgres', { region: REGION });
  // Meal photos. Size pinned to the live 5 GB so an apply never resets it (volumes can only grow).
  const data = volume('balanss-data', { region: REGION, sizeMB: 5000 });

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
    networking: {
      serviceDomains: { [DOMAIN]: { port: PORT } },
      customDomains: { [API_DOMAIN]: { port: PORT }, [WEB_DOMAIN]: { port: PORT } },
    },
    volumeMounts: { '/data': data },
    env: {
      NODE_ENV: 'production',
      PORT: String(PORT),
      DATABASE_URL: db.env.DATABASE_URL,
      STORAGE_DIR: '/data/storage',
      // Railway mounts volumes as root; the container runs as the `node` user.
      RAILWAY_RUN_UID: '0',
      // Links in e-mails, photo URLs and data exports use the custom domain.
      PUBLIC_API_URL: `https://${API_DOMAIN}`,
      PUBLIC_WEB_URL: `https://${WEB_DOMAIN}`,
      EMAIL_PROVIDER: 'resend',
      // zestwell.app is verified in Resend, so mail can go to any address.
      EMAIL_FROM: 'ZestWell <noreply@zestwell.app>',
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
