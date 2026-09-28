# Balanss API

Node 22 + TypeScript (ESM) backend for the Balanss app. It implements every route in
[`shared/api.ts`](../shared/api.ts) under `/v1` and reuses the pure domain logic in
`shared/` (targets, personality scoring, sleep window/score, nutrition totals, dates).
That logic is imported, not copied.

Stack: Fastify 5, Zod, Drizzle ORM + drizzle-kit on Postgres, `jose` (JWT, Apple JWKS),
`google-auth-library`, `@anthropic-ai/sdk`, `expo-server-sdk`, Vitest.

```
backend/
  src/app.ts            buildApp(deps): plugins, error shape, route registration
  src/server.ts         wires real dependencies and listens; starts the scheduler
  src/scheduler.ts      in-process push scheduler (runSchedulerTick for tests)
  src/db/schema.ts      Drizzle schema (all tables FK-cascade from users)
  src/routes/*.ts       one plugin per area (auth, me, day, meals, health, copy, push, public)
  src/services/*.ts     auth, users, day aggregation, meals, photos, quota, GDPR, e-mail, push
  src/ai/               claude.ts (structured-output call), food.ts, tone.ts (tone engine),
                        fake-food.ts + tone-templates.ts (deterministic fake / fallback)
  src/seed-data.ts      the CLAUDE.md sample user Ilze with 14 days of history
  drizzle/              generated SQL migrations
  evals/tone.eval.ts    LLM-judged tone eval
  test/                 integration tests (fastify.inject against Postgres)
```

## Local development

Requires Node 22 and Postgres 16.

```bash
cd backend
cp .env.example .env        # defaults work for local dev
npm install
npm run migrate             # applies drizzle/ migrations
npm run seed                # (re)creates ilze@piemers.lv with 14 days ending today
npm run dev                 # http://localhost:3000, reloads on change
```

Sign in with a magic link (console e-mail provider prints the link and returns `devToken`):

```bash
curl -s localhost:3000/health
TOKEN=$(curl -s -XPOST localhost:3000/v1/auth/magic-link -H 'content-type: application/json' \
  -d '{"email":"ilze@piemers.lv"}' | node -pe 'JSON.parse(require("fs").readFileSync(0)).devToken')
ACCESS=$(curl -s -XPOST localhost:3000/v1/auth/magic-link/verify -H 'content-type: application/json' \
  -d "{\"token\":\"$TOKEN\"}" | node -pe 'JSON.parse(require("fs").readFileSync(0)).accessToken')
curl -s localhost:3000/v1/days/$(date +%F) -H "authorization: Bearer $ACCESS"
```

For the Android emulator, point the app at `EXPO_PUBLIC_API_URL=http://10.0.2.2:3000/v1`.

### Scripts

| Script | What it does |
|---|---|
| `npm run dev` | `tsx watch src/server.ts` (loads `.env` if present) |
| `npm run build` | `tsup` bundle to `dist/` (`server.js`, `migrate.js`, `seed.js`; `../shared` is inlined) |
| `npm start` | `node dist/server.js` |
| `npm run migrate` / `migrate:prod` | apply migrations (tsx / built) |
| `npm run db:generate` | generate a new migration after editing `src/db/schema.ts` |
| `npm run seed` | idempotent sample user (re-running resets Ilze) |
| `npm test` | Vitest integration tests (needs the test database, see below) |
| `npm run typecheck` / `lint` | `tsc --noEmit` (strict) |
| `npm run eval:tone` | tone-engine eval against the Claude API (needs `ANTHROPIC_API_KEY`; costs money) |

### Tests

Tests run against a real Postgres database (`balanss_test` by default; override with
`TEST_DATABASE_URL`). Each test file migrates once and truncates all tables before each
test; files run sequentially. External services are replaced: fake AI, fake e-mail, fake
push sender, stubbed Google/Apple verifiers, mocked `fetch` for Open Food Facts, and a
mocked Anthropic SDK client for the provider-fallback tests.

```bash
createdb balanss_test   # once
npm test
```

## Environment variables

| Variable | Default | Notes |
|---|---|---|
| `NODE_ENV` | `development` | `production` on Railway. In production `JWT_SECRET` is required and `devToken` is never returned. |
| `PORT` | `3000` | Railway injects it. |
| `HOST` | `0.0.0.0` | |
| `LOG_LEVEL` | `debug` (dev) / `info` (prod) | pino level; `silent` in tests. |
| `DATABASE_URL` | `postgres://balanss:balanss@localhost:5432/balanss` | Railway: `${{Postgres.DATABASE_URL}}`. `sslmode=require` is honoured. |
| `JWT_SECRET` | dev-only constant | **Required in production**, ≥ 32 chars (`openssl rand -base64 48`). Signs HS256 access tokens (15 min) and photo URLs. |
| `PUBLIC_API_URL` | `http://localhost:$PORT` | Absolute base for signed `photoUrl`s and export `downloadUrl`s, e.g. `https://api.balanss.app`. |
| `PUBLIC_WEB_URL` | `https://balanss.app` | Web fallback in the magic-link e-mail: `${PUBLIC_WEB_URL}/auth?token=…`. |
| `APP_SCHEME` | `balanss` | Deep link in the magic-link e-mail: `${APP_SCHEME}://auth?token=…`. |
| `CORS_ORIGINS` | `*` in dev, none in prod | Comma list of allowed web origins (`*` = any). The native app does not need CORS. |
| `GOOGLE_CLIENT_IDS` | – | Comma list of OAuth client IDs accepted as the ID-token audience (Android, iOS, web). Google sign-in returns 503 `provider_not_configured` without it. |
| `APPLE_BUNDLE_IDS` | – | Comma list of accepted Apple audiences (bundle ID, Services ID). |
| `EMAIL_PROVIDER` | `console` | `console` prints the link to stdout (and returns `devToken` outside production); `resend` sends via the Resend HTTP API. |
| `RESEND_API_KEY` | – | Required with `EMAIL_PROVIDER=resend`. |
| `EMAIL_FROM` | `Balanss <noreply@balanss.app>` | Must be a verified Resend sender domain. |
| `AI_PROVIDER` | `anthropic` if `ANTHROPIC_API_KEY` is set, else `fake` | `fake` = deterministic sample analysis, dictionary text parser and Latvian tone templates. |
| `ANTHROPIC_API_KEY` | – | Server-side only; never shipped in the app. |
| `AI_MODEL` | `claude-opus-5-5` | Model for photo analysis, text parsing and tone copy. |
| `STORAGE_DIR` | `./storage` (`/data/storage` in Docker) | Meal photos. Mount a Railway volume at `/data`. |
| `EXPO_ACCESS_TOKEN` | – | Optional Expo push access token (if push security is enabled for the Expo project). |
| `REVENUECAT_WEBHOOK_SECRET` | – | The webhook must send `Authorization: Bearer <secret>`; without it the webhook answers 401. |
| `SCHEDULER` | `on` | `off` disables the in-process push scheduler (e.g. on extra replicas). |
| `RATE_LIMIT_MAX` | `300` | Requests per minute per IP, all routes. |
| `AUTH_RATE_LIMIT_MAX` | `20` | Requests per minute per IP on `/v1/auth/*`. |
| `MIGRATIONS_DIR` | `./drizzle` | Only if migrations live elsewhere. |
| `TEST_DATABASE_URL` | `postgres://balanss:balanss@localhost:5432/balanss_test` | Tests only. |

## Deploying to Railway (EU)

The service builds from the **repository root** because it imports `../shared`.

1. Create a Railway project and pick an **EU region** (e.g. `europe-west4`, Amsterdam) for
   both services below (Project → Settings, or per service → Settings → Region). Health and
   personality data are GDPR special-category data and must stay in the EU.
2. Add **Postgres** (New → Database → PostgreSQL) in the same EU region.
3. Add a service from this GitHub repo. In its Settings:
   - Root directory: `/` (repository root).
   - Config-as-code file path: `backend/railway.json` (it selects `backend/Dockerfile`,
     runs `node dist/migrate.js` as the pre-deploy command, and health-checks `GET /health`).
4. Add a **volume** to the service mounted at `/data` (meal photos live in `/data/storage`).
   The container runs as the non-root `node` user; if the volume is not writable, set
   `RAILWAY_RUN_UID=0` on the service.
5. Variables: `NODE_ENV=production`, `DATABASE_URL=${{Postgres.DATABASE_URL}}`,
   `JWT_SECRET`, `PUBLIC_API_URL` (the service's public domain, `https://…`),
   `PUBLIC_WEB_URL`, `GOOGLE_CLIENT_IDS`, `APPLE_BUNDLE_IDS`, `EMAIL_PROVIDER=resend`,
   `RESEND_API_KEY`, `EMAIL_FROM`, `ANTHROPIC_API_KEY`, `REVENUECAT_WEBHOOK_SECRET`,
   optionally `EXPO_ACCESS_TOKEN`.
6. Generate a public domain (Settings → Networking) and put it in the app's
   `EXPO_PUBLIC_API_URL` as `https://<domain>/v1`.
7. Optional: seed the demo user once with `railway run node dist/seed.js` (or a one-off shell).
8. In RevenueCat, set the webhook URL to `https://<domain>/v1/billing/webhook` with the same
   bearer secret; use our user id as the RevenueCat `app_user_id`.

Local image build (from the repo root): `docker build -f backend/Dockerfile -t balanss-api .`

Scaling note: the scheduler runs in-process. Push dedupe is a database primary key
(`push_log`), so several replicas never double-send, but you can also set `SCHEDULER=off`
on all but one replica.

## Behaviour notes

- **Errors** are always `{ "error": { "code", "message" } }` with stable English codes
  (`validation_error`, `unauthorized`, `invalid_token`, `refresh_token_reused`,
  `consent_required`, `retest_locked`, `quota_exceeded`, `export_unavailable`, …); the app
  localises them.
- **Auth**: magic-link tokens are 32 random bytes, stored as SHA-256, single use, 15 min.
  Access JWTs last 15 min. Refresh tokens last 30 days, are stored hashed, rotate on every
  refresh; presenting a rotated token revokes its whole family. Logout revokes the family.
  Google/Apple sign-in link to an existing account only when the provider verifies the e-mail.
- **Targets** follow `computeTargets(profile)` until the user edits targets by hand
  (`users.targets_edited`).
- **Personality**: without `consent: true` nothing is stored (400 `consent_required`);
  retaking before `retestFrom` (6 months) is 409 `retest_locked`.
- **Days / stats / health** use the user's local date. The time zone comes from the push-token
  registration (`PUT /push/token`); the default is `Europe/Riga`.
- **Photos** are stored under `STORAGE_DIR` with random names and served only through
  HMAC-signed URLs valid for 24 h. The scheduler deletes photos older than 30 days (the meal
  keeps its nutrition data).
- **Quota**: free plan 3 photo analyses per local day (402 `quota_exceeded`); Pro unlimited.
  Pro is set by the RevenueCat webhook (`INITIAL_PURCHASE`, `RENEWAL`, `UNCANCELLATION`,
  `PRODUCT_CHANGE` → pro with expiry; `EXPIRATION` → free).
- **GDPR**: `POST /me/export` returns a single-use link valid 24 h; the download is a JSON
  attachment with all the user's data (push tokens redacted). `DELETE /me` hard-deletes the
  user; every table cascades, magic links for the e-mail and stored photo files are removed.
- **Logging** never includes e-mails, tokens, request bodies or health values: request logs
  carry method, masked URL and status only; pino redacts auth headers and token/e-mail fields.
  AI calls log token usage only.

## AI layer

All AI runs server-side (`src/ai`). Every Claude call (`callStructured` in `claude.ts`):

- model `AI_MODEL` (default `claude-opus-5-5`) with adaptive thinking (the model default);
- `output_config.effort` per route: photo analysis `medium`, text parsing `low`, tone copy `medium`;
- **structured outputs**: `output_config.format` is a JSON schema generated from Zod, and the
  reply is validated with Zod again, then with domain rules (clamped nutrients, alternatives
  only below 0.6 confidence, copy length/emoji/highlight checks);
- **server-side refusal fallback** (`fallbacks: "default"`, beta `server-side-fallback-2026-07-01`),
  plus explicit handling of `stop_reason: "refusal"` and `"max_tokens"`;
- prompt caching on the stable system prompts; token usage logged per call.

If a call throws (network, 5xx, rate limit), is refused, is truncated or breaks the copy
rules, the route answers with the **fake provider's** output instead, so the app never shows
an error for AI copy. `AI_PROVIDER=fake` uses that provider throughout (tests, local dev).

The tone engine (`src/ai/tone.ts`) produces the daily tip (+ highlight), the weekly
question (4 options with replies), push copy (sleep / water / food) and the nutrition-trends
insight in four tones (plan, novelty, gentle, neutral), with golden examples taken from
`prototype/Tone-Compare`, `Notif-*` and `Home`.

`npm run eval:tone` runs 12 fixture days × 4 tones through the engine and grades them with
`claude-sonnet-5-5` for tone adherence, Latvian, safety and length. It is not run in CI.

## Push scheduler

Every 5 minutes (`src/scheduler.ts`), for each user with a push token, in the token's time
zone:

| Kind | When | Condition |
|---|---|---|
| tip (no push) | 05:00 | pre-generates today's tip |
| sleep | window start − `sleepLeadMin` | `reminders.sleepWindow`, window needs ≥ 3 nights; allowed in quiet hours |
| water | low 11/15, mid 10/13/16/19, high every 2 h 9–19 | `reminders.water` and water below the pro-rated target (08:00–21:00) |
| food | 13:30 lunch, 19:30 dinner | `reminders.food` and that meal not logged |

Quiet hours are 22:30–08:00 (only the sleep push is sent). A slot stays due for 30 minutes, and
`push_log (user, kind, local date, slot)` guarantees at most one send.
