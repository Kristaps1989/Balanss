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
                        analysis.ts (deterministic pattern findings), insights.ts (weekly summary),
                        recipes.ts + recipes-data.ts (meal ideas, preference blacklist, curated list),
                        safety.ts (ethics gate for all AI copy), fake-food.ts, tone-templates.ts,
                        question-templates.ts, food-ideas.ts (deterministic fake / fallback)
  src/seed-data.ts      sample users: Ilze (28 days of history) and Marta (care mode)
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
npm run seed                # (re)creates ilze@piemers.lv (28 days + today) and care@piemers.lv
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

For the Android emulator, point the app at `EXPO_PUBLIC_API_URL=http://10.0.2.2:3000`.

### Scripts

| Script | What it does |
|---|---|
| `npm run dev` | `tsx watch src/server.ts` (loads `.env` if present) |
| `npm run build` | `tsup` bundle to `dist/` (`server.js`, `migrate.js`, `seed.js`; `../shared` is inlined) |
| `npm start` | `node dist/server.js` |
| `npm run migrate` / `migrate:prod` | apply migrations (tsx / built) |
| `npm run db:generate` | generate a new migration after editing `src/db/schema.ts` |
| `npm run seed` | idempotent sample users (re-running resets Ilze and Marta) |
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
| `PUBLIC_API_URL` | `https://$RAILWAY_PUBLIC_DOMAIN`, else `http://localhost:$PORT` | Absolute base for signed `photoUrl`s, export `downloadUrl`s and the magic-link page `/auth/open`. |
| `PUBLIC_WEB_URL` | `https://balanss.app` | Public website (reserved). The magic-link e-mail links to `${PUBLIC_API_URL}/auth/open?token=…`, which opens the app. |
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
   `JWT_SECRET`, `PUBLIC_API_URL` (optional on Railway),
   `PUBLIC_WEB_URL`, `GOOGLE_CLIENT_IDS`, `APPLE_BUNDLE_IDS`, `EMAIL_PROVIDER=resend`,
   `RESEND_API_KEY`, `EMAIL_FROM`, `ANTHROPIC_API_KEY`, `REVENUECAT_WEBHOOK_SECRET`,
   optionally `EXPO_ACCESS_TOKEN`.
6. Generate a public domain (Settings → Networking) with the same target port as `PORT`.
   The app's default is `https://balanss-production.up.railway.app`; for another domain set
   `EXPO_PUBLIC_API_URL=https://<domain>` (no `/v1` — the app adds it). Step-by-step: docs/RAILWAY.md.
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
  `consent_required`, `retest_locked`, `quota_exceeded`, `export_unavailable`, `pro_required`,
  `target_below_floor`, `goal_below_healthy`, `weight_loss_not_allowed`, …); the app
  localises them.
- **Auth**: magic-link tokens are 32 random bytes, stored as SHA-256, single use, 15 min.
  Access JWTs last 15 min. Refresh tokens last 30 days, are stored hashed, rotate on every
  refresh; presenting a rotated token revokes its whole family. Logout revokes the family.
  Google/Apple sign-in link to an existing account only when the provider verifies the e-mail.
- **Targets** follow `computeTargets(profile)` until the user edits targets by hand
  (`users.targets_edited`).
- **Safety floors** (`shared/safety.ts`): `PUT /me/targets` rejects energy below
  `KCAL_FLOOR[sex]` (400 `target_below_floor`); `PUT /me/profile` rejects, whenever the goal is
  set or changed, a weight-loss goal below BMI 18,5 (`goal_below_healthy`) and any weight-loss
  goal for under-18s or at BMI ≤ 18,5 (`weight_loss_not_allowed`).
- **Care mode**: `Me.care` and `Day.care` come from `careStatus()` over the 7 complete days
  before the date (energy + meals logged per day) and the weights of the last 42 days. While
  active, findings that invite "eat less" are dropped, templates switch to regular meals, rest
  and gentle movement, and Claude gets `care: true` plus the care-mode rules.
- **Personality**: without `consent: true` nothing is stored (400 `consent_required`);
  retaking before `retestFrom` (6 months) is 409 `retest_locked`.
- **Days / stats / health** use the user's local date. The time zone comes from the push-token
  registration (`PUT /push/token`); the default is `Europe/Riga`.
- **Photos** are stored under `STORAGE_DIR` with random names and served only through
  HMAC-signed URLs valid for 24 h. The scheduler deletes photos older than 30 days (the meal
  keeps its nutrition data).
- **Quota**: free plan 3 photo analyses per local day (402 `quota_exceeded`); Pro unlimited.
  The weekly summary and recipes are Pro-only (402 `pro_required`).
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
- `output_config.effort` per route: photo analysis `medium`, text parsing `low`, tone copy, weekly summary and recipes `medium`;
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
`claude-sonnet-5-5` for tone adherence, Latvian, safety and length, then 4 ethics fixtures
(care-mode user, low-intake day, over-target day, a user who keeps dismissing protein tips)
× 4 tones for restriction, compensation, shame / body talk, medical content, care mode,
respect for history, autonomy and Latvian. It is not run in CI.

### Analysis, memory and ethics

- **Findings** (`src/ai/analysis.ts`) are computed deterministically from the 28 complete days
  before the request date: `protein_gap`, `fibre_low`, `water_low`, `weekend_shift`,
  `breakfast_skipped`, `short_sleep_low_steps` (nights shorter than target − 30 min),
  `bedtime_irregular`, `bedtime_in_window`, `steps_trend`, `logging_gaps` and the positive
  `consistency`. Each has a minimum-data guard and a factual Latvian `fact` with the real
  numbers; they are sorted by `strength`. The AI never finds patterns itself; it only phrases
  questions, summaries and tips around these facts.
- **Memory** (`services/analysis.ts` `buildHistory`): the last 4 weekly questions with the chosen
  option label and, per angle, how tips of the last 14 days were received (accepted, dismissed
  via "Cits ieteikums" → `POST /tips/next`, reported via `POST /tips/:id/report`). Tip angles are
  ranked down when dismissed or reported and up when accepted; an angle reported today is never
  used again that day. The weekly question skips last week's topic.
- **What Claude sees**: numbers, short labels, our own finding facts, the history above, food
  preferences, the care flag, tone + modifiers and sex (grammar only). Never the name, e-mail or
  personality scores.
- **Ethics gate** (`src/ai/safety.ts`): every tip, push, question, option reply, insight,
  summary text and recipe text goes through `copyViolation` and `mentionsKcalBelow` from
  `shared/safety.ts` plus length / emoji / markup checks and backend rules (restriction,
  "diet food" framing, compensation, body talk; in care mode any deficit or weight-loss content).
  A violation logs the reason only (`safety:<reason>`) and the reviewed templates are used.
  The system prompt spells out the same rules (autonomy, no guilt or body talk, no
  compensation, no restriction or skipped meals, no medical or supplement claims, no weight
  promises, strict food preferences, honesty about incomplete data, care mode with at most one
  gentle mention of the family doctor). `test/ethics.test.ts` renders every template for a
  matrix of tones × sex × care × preferences × days and requires all of it to pass the gate.
- **Weekly summary** (`GET /insights/weekly`, Pro): headline, 2–3 observations (at least one
  positive when there is one), one small optional suggestion and one reflection question,
  cached per user, week and request date (`weekly_summaries`).
- **Recipes** (`GET /recipes`, Pro): 3 ideas for the next meal slot by local time (the next
  unlogged main meal), focused on the largest relative gap (protein or fibre, never energy),
  ≤ 40 min, Latvian-shop ingredients. Preferences are strict: Claude's recipes are checked
  against a keyword blacklist per diet and avoid-group, violating ones are dropped and the set
  is topped up from 17 curated recipes. Sets are cached per user, date, slot and preference set
  (`recipes`); `POST /recipes/:id/log` logs one serving as a single `manual` meal item.

## Privacy

- Health and personality data are GDPR special-category data. The backend sends Claude only
  what the copy needs: numbers, short labels and our own computed facts — never the name,
  e-mail, personality answers or scores.
- **AI personalisation off** (`PUT /me/ai { "enabled": false }`, `Me.aiPersonalization`): no
  personal data goes to the AI for tips, weekly questions, pushes, trends insights, weekly
  summaries or recipes; all of them come from the built-in templates and curated recipes,
  still personalised locally with the user's numbers (`aiGenerated: false`).
- **Photo analysis and text parsing still use Claude** with AI personalisation off, because
  the user explicitly starts them for that one photo or sentence; nothing else about the user
  is attached to those requests.
- Tip reports store only the reason code; logs never contain copy, prompts or responses.

## Seed data

`npm run seed` (and the tests) create:

- **Ilze** (`ilze@piemers.lv`, the CLAUDE.md sample user): today's exact sample day (1 480 kcal,
  protein 68 g, carbs 160 g, fat 52 g, fibre 18 g, water 1 200 ml, 6 430 steps, sleep 6 h 40 min,
  window 23:00–23:30) plus 28 days of history shaped so the analysis finds real patterns:
  4 light, low-protein dinners in the last 14 days, weekends ~ +18 % energy, breakfast not
  logged on 2 days, 3 short nights (6 h) followed by fewer steps, bedtime in the window on 3 of
  the last 7 nights, the water target reached on 5 of the last 7 days and steps up ~11 % week on
  week. Last week's weekly question (bedtime) is answered ("Telefons vai seriāli"); a protein
  tip was accepted, a steps tip dismissed and a water tip accepted.
- **Marta** (`care@piemers.lv`, free plan, onboarding done): ~650–770 kcal on each of the last
  7 days, so `care.active` is true with reason `low_intake`.

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
