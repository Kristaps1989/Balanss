# Balanss — implementation plan to a fully working app

Based on a screen-by-screen read of `prototype/` (28 screens, `canvas.json` order) and the rules in `CLAUDE.md`.
Each task lists the **Claude model to run the task with** in Claude Code and a paste-ready prompt. Where a task adds an AI feature, it also names the **model the backend calls at runtime**.

## How to choose the model for a task

| Model | Use it for | Why |
|---|---|---|
| **Claude Fable 5.1** (`claude-fable-5-1`) | Architecture decisions, the tone engine prompts, security/GDPR review, anything touching auth or data deletion, debugging native (Gradle / Health Connect) problems | Strongest reasoning and long autonomous runs; worth it where a wrong design is expensive to undo |
| **Claude Opus 5.5** (`claude-opus-5-5`) | Default for every feature milestone: screens with logic, backend endpoints, state, tests | Best quality/cost for multi-file coding work |
| **Claude Sonnet 5.5** (`claude-sonnet-5-5`) | Porting a static prototype screen to RN when the data shape already exists, copy changes, small refactors, ESLint/type fixes | Fast and cheap; the prototype gives it an exact target |
| **Claude Haiku 4.5** (`claude-haiku-4-5`) | One-line fixes, renames, formatting, commit messages | Trivial edits only |

Rule of thumb: run the milestone with the model listed, and if it stalls on a bug for more than two attempts, re-run the same prompt with the next model up.

Runtime AI in the backend defaults to **Claude Opus 5.5** with adaptive thinking (the API default). Sonnet 5.5 is a valid cost cut for tone rewrites once quality is verified with an eval; that is a product decision, not a default.

---

## Status

| # | Milestone | Status |
|---|---|---|
| 1 | Scaffold, tokens, tab bar, Šodiena | Done |
| 2 | Nutrition screens | Done |
| 3 | Onboarding + personality test | Done |
| 4 | Movement, Sleep, Me, Pro | Done |
| 5 | Backend (Fastify + Postgres) + auth + app on real API | Done — Railway deploy pending your account |
| 6 | AI: food photo, text parse, 28-day pattern analysis, tips with memory, data-based weekly questions, weekly summary, recipes, ethics filter, care mode | Done — see docs/AI_AND_ETHICS.md; Claude is stubbed in tests, needs `ANTHROPIC_API_KEY` for real output and the eval |
| 7 | Health Connect sync | Code done — needs a real phone to verify; iOS HealthKit later |
| 8 | Push notifications + signed release | Code done — needs Firebase/Expo project and upload keystore (docs/NATIVE_SETUP.md) |
| 9 | Tests, CI, GDPR | Done — 35 unit, 136 backend, 20 end-to-end tests; CI incl. Android build |

Verified in the cloud sandbox: typecheck, lint, all test suites, and a web build of the app against the real backend. **Not** verified here (no Android SDK / external accounts): `./gradlew assembleDebug`, Health Connect on a device, real Google/Apple/Resend/FCM/RevenueCat/Anthropic calls. CI's `android` job runs the Gradle build on GitHub.

---|---|---|
| 1 | Scaffold, tokens, tab bar, Šodiena | Done (branch `claude/new-session-6rp4b0`) |
| 2 | Nutrition screens (mock) | Not started |
| 3 | Onboarding + personality test (mock) | Not started |
| 4 | Movement, Sleep, Me, Pro (mock) | Not started |
| 5 | Backend on Railway + auth + sync | Not started |
| 6 | AI: food photo, tips, weekly question, sleep window | Not started |
| 7 | Health Connect / HealthKit | Not started |
| 8 | Push notifications + release build | Not started |
| 9 | Quality: tests, evals, GDPR, store listing | Not started |

---

## Screen-by-screen analysis

Every screen: what the prototype shows, every interaction it has, what data and API it needs, and what must be decided.

### 0. Onboarding

#### Main / Onb-Welcome2 / Onb-Welcome3 → `(onboarding)/welcome`
- 3-slide carousel: "Visa tava diena — vienā skatā", "Tavs pulkstenis jau zina daudz", "Tavi dati paliek tavi". Dots, `Tālāk`, `Izlaist` (→ login), `Sākam` on slide 3.
- Needs: none (static). Decide: illustrations (prototype uses placeholder shapes; plan simple SVG illustrations or none).

#### Onb-Login → `(onboarding)/login`
- Buttons: `Turpināt ar Apple`, `Turpināt ar Google`, then `Turpināt ar e-pastu` which expands an e-mail field → `Sūtīt pieslēgšanās saiti` → "Pārbaudi e-pastu" state. Terms/privacy links. Copy: "Jau ir konts? Tās pašas pogas tevi pieslēgs."
- Needs: `POST /auth/google`, `POST /auth/apple`, `POST /auth/magic-link` (send), `GET /auth/magic-link/verify?token=` (deep link `balanss://auth?token=`). Secure token storage (`expo-secure-store`).
- Decide: Apple sign-in on Android is web-based (Apple JS flow); do Google + magic link first, Apple when iOS ships.

#### Onb-Basics → `(onboarding)/basics` (2/7)
- Steppers: vecums, augums, svars. Segmented: dzimums (Sieviete/Vīrietis/Nenorādīt). Activity level cards: sēžu / nedaudz / aktīvi / ļoti aktīvi. `Tālāk`.
- Needs: local onboarding store; later `PUT /me/profile`.

#### Onb-Device → `(onboarding)/devices` (3/7)
- Two cards: Apple Health (iOS) and Health Connect (Android). One is "Nav šajā ierīcē". `Savienot` → "Savienots · Atradām: …". Note about Polar/Garmin/Oura. `Tālāk` / `Vēlāk — ievadīšu pati`.
- Needs: Health Connect permission request (milestone 7). Until then: mock connect.

#### Onb-Goals → `(onboarding)/goals` (4/7)
- Multi-select goal cards: veselīgāk / uzturēt formu / vēlamais svars / rutīna. Selecting "vēlamais svars" reveals direction (Samazināt / Palielināt), target kg stepper and pace copy ("apmēram N nedēļas (0,25–0,5 kg nedēļā)").
- Daily targets with source line and ± steppers: Enerģija (Mifflin-St Jeor − maigs deficīts, ±50), Ūdens (EFSA, ±0,1 l), Soļi (PVO, ±500), Miegs. Disclaimer: "Vispārīgi ieteikumi veseliem pieaugušajiem, nevis medicīnisks padoms…".
- Needs: pure TS `computeTargets(profile)` (Mifflin-St Jeor × activity factor − deficit; protein 1,2–1,6 g/kg; water; steps 8 000; sleep 7 h 30). Unit-tested. Later `PUT /me/targets`.

#### Onb-TestIntro → `(onboarding)/personality/intro` (5/7)
- Copy about 2 min / 20 statements, three example tones, consent checkbox "Atļauju izmantot rezultātu ieteikumu pielāgošanai" (default on), `Uzzināt savu stilu`, `Izlaist — pielāgošu vēlāk` (→ Home with neutral tone).
- Needs: consent flag stored with the profile (GDPR: explicit consent for special-category data).

#### Onb-Test → `(onboarding)/personality/test` (6/7)
- One statement per screen, "N no 20", progress bar, 5-point Likert with dot sizes (22/18/14/18/22 px), back button, `Tālāk` appears after an answer, `Skatīt rezultātu` on the last one.
- Needs: the 20 statements (4 per trait, half reverse-keyed) in Latvian — the prototype has 3; the rest must be written (short IPIP-style items, not a licensed instrument). Scoring: mean per trait → low (<2,6) / medium / high (>3,4). Store answers + scores.

#### Onb-Result → `(onboarding)/personality/result` (7/7)
- "Tavs stils" + style name (e.g. "Plānotāja ar maigu pieeju"), 5 trait bars with zems/vidējs/augsts scale, "Tā mēs tev palīdzēsim" paragraph, disclaimer "Šis nav klīnisks vai diagnostisks tests…", `Sākt lietot Balansu`.
- Needs: style-name and explanation mapping from traits (deterministic table, ~8 combos keyed on the two most extreme traits; AI paragraph optional later).

### 1. Šodiena

#### Home → `(tabs)/index` — built in milestone 1
- Remaining: tip buttons `Labi, pamēģināšu` (mark accepted, hide) and `Cits ieteikums` (fetch next tip); weekly-question answer persisted; quick-add `Svars` should open a weight entry sheet (not Me).

#### Add-Sheet → `/add` — built in milestone 1
- Remaining: `Svars` → weight sheet; `Aktivitāte` → manual activity form (Move).

### 2. Uzturs

#### Food-Log → `(tabs)/nutrition/index`
- Header "Uzturs", day switcher (‹ Šodien ›), avatar. Summary card: kcal / target with bar, `Tendences` link, 4 macro bars, buttons `Foto` and `Citādi`. Meal cards (Brokastis / Pusdienas / Uzkodas) with photo tile, items, "HH:MM · N g olbaltumvielu · no foto / 3 ieraksti". Empty meal ("Vakariņas · Vēl nav pievienotas" + add button).
- Needs: `GET /days/:date` (meals, totals), meal grouping by time slot, day navigation, swipe/long-press to delete an entry.

#### Food-Camera → `(tabs)/nutrition/camera`
- Full-screen camera, quota "Šodien atlikušas 2 no 3 analīzēm" (free plan), flash toggle, frame hint "Novieto šķīvi rāmī", mode chips Svītrkods / Foto / Teksts, gallery picker, shutter → Analyzing. Close → log.
- Needs: `expo-camera`, `expo-image-picker`, `expo-image-manipulator` (resize to ≤1280 px, JPEG q0,8 before upload). Quota from `GET /me/quota`.

#### Food-Analyzing → `(tabs)/nutrition/analyzing`
- Steps that tick: Atpazīstu produktus → Novērtēju porcijas → Rēķinu uzturvērtību; "Parasti tas aizņem pāris sekundes"; `Skatīt rezultātu` when done; cancel.
- Needs: `POST /meals/analyze` (multipart image) → job or direct response; step animation driven by real progress (or timed while waiting).

#### Food-Result → `(tabs)/nutrition/result`
- "Atpazinu N produktus", meal-type chip (Pusdienas), one card per item: name, kcal, "g · g olb. · aptuveni", portion slider (grams; max = max(300, 2×g)), totals recompute live. Uncertain item shows chips ("Mērci atpazinu neskaidri — precizē?": Jogurta mērce / Majonēze / Bez mērces). `Pievienot, ko nepamanīju` (→ Food-Add). Footer: total kcal + macros, `Saglabāt`.
- Needs: analysis result schema `{items:[{name, grams, per100g:{kcal,p,c,f,fibre}, confidence, alternatives[]}]}`; `POST /meals` to save. Slider: `@react-native-community/slider`.

#### Food-Add → `(tabs)/nutrition/add` (sheet)
- "Pievienot citādi": text field "Uzraksti vai pasaki" with mic button, parsed preview lines ("Olas, vārītas · 2 gab. · 156 kcal"), `Pievienot N kcal`; `Skenēt svītrkodu`; `Iecienītākie` list with + buttons.
- Needs: `POST /meals/parse-text` (AI), `GET /foods/barcode/:ean` (Open Food Facts proxy), `GET /me/favourites`. Voice: `expo-speech-recognition` or defer (mic button hidden until implemented).

#### Food-Trends → `(tabs)/nutrition/trends`
- "Pēdējās 7 dienas": bar charts for Enerģija (avg, target line) and Olbaltumvielas; weekday labels P O T C Pk S Sv; today's bar in accent; AI insight paragraph + "Šodienas stabiņš vēl aug — diena nav beigusies."
- Needs: `GET /stats/nutrition?days=7`; insight from the tone engine (cached per day).

### 3. Kustība

#### Move → `(tabs)/movement`
- Steps today / target, active kcal, 7-day bar chart, "Dati no Apple Health". Miera pulss (61 sit./min, sparkline, "7 dienas · stabils"), HRV (42 ms, sparkline). Treniņi list (name, when · duration · device, avg HR). Pulsa zonas for the latest workout (5 zones with minutes). Source line with device.
- Needs: `GET /health/movement?days=7`; heart-rate zones computed from max HR (220 − age) unless the device provides them; workouts from Health Connect `ExerciseSession`. Manual activity form (from Add-Sheet): type, duration, optional kcal.

### 4. Miegs

#### Sleep → `(tabs)/sleep`
- Last night: duration, gulētiešana/celšanās, score /100, stage bar + legend (Dziļais / REM / Vieglais). "Gulētiešanas regularitāte": 7 nights plotted on a 22:30–00:30 axis with the sleep window highlighted. "Tavs miega logs šovakar 23:00–23:30" with explanation "Aprēķināts no pēdējo 14 nakšu ritma" and timeline 21:00–01:00. Toggle "Brīdināt pirms miega loga" with 30/45/60 min lead; wind-down timeline steps (Hei, miega logs tuvojas → Tēja bez kofeīna → Nomierināšanās → Miega logs sākas) that shift with the lead time.
- Needs: `GET /health/sleep?days=14`; sleep window = median bedtime of last 14 nights ± 15 min (pure TS, tested); sleep score formula (duration vs target, deep+REM share, regularity — documented, no medical claim); reminder settings `PUT /me/reminders`.

### 5. Es

#### Me → `/me`
- Header: avatar, name, "34 gadi · 168 cm · 71 kg" (tap → edit basics). Personības profils: style name, 5 trait bars, link "Tie paši dati, cits tonis" (Tone-Compare is pitch-only → replace with a small in-app tone picker: plāns / jaunais / maigi / neitrāls), toggle "Atgriezties uz neitrālu toni", "Atkārtot testu varēsi no …" (retest lock 6 months). Mērķi list (tap → goals editor). Ierīces (source + devices, "Sinhronizēts"). Atgādinājumi toggles: Ūdens / Maltīšu ieraksti / Kustība / Miega logs + frequency Reti / Vidēji / Bieži. Privātums: Eksportēt manus datus, Dzēst personības profilu, Dzēst visus datus un kontu. Konts: e-pasts, plāns, Iziet no konta. Pro banner.
- Needs: `GET/PUT /me`, `PUT /me/tone`, `DELETE /me/personality`, `POST /me/export` (JSON/ZIP via e-mail link), `DELETE /me` (with confirmation + 7-day grace), `PUT /me/reminders`.

#### Pro → `/me/pro`
- Free vs Pro comparison (3 foto analīzes dienā vs bez limita; nedēļas AI kopsavilkums; receptes), plan selector Gada €49 / Mēneša €5,99 with CTA text change, `Varbūt vēlāk`, "Atcelt var jebkurā brīdī iestatījumos."
- Needs: RevenueCat (Play Billing + StoreKit) → `POST /billing/webhook` sets `plan`. Until billing exists: paywall UI with "Drīzumā" and quota enforced server-side.

#### Tone-Compare, Notif-Plan / Notif-Explore / Notif-Gentle
- Pitch material. Do not ship as screens, but their copy is the **reference set for the tone engine** (three profiles × tip / water reminder / question / sleep-window push). Use it as the golden examples in prompts and evals.

---

## Backend surface (Node/TypeScript on Railway, Postgres)

Stack: Fastify + Zod (or Hono), Drizzle ORM, Postgres on Railway (EU region), `@anthropic-ai/sdk`, BullMQ + Redis for push scheduling (or Railway cron), Resend for magic-link e-mail.

Tables: `users`, `profiles` (basics, targets, tone, consent, personality scores), `meals`, `meal_items`, `water_logs`, `weight_logs`, `activities`, `health_daily` (steps, active kcal, resting HR, HRV), `sleep_nights` (+ stages), `tips` (generated, accepted flag), `weekly_questions`, `reminders`, `push_tokens`, `analysis_quota`, `deletion_requests`.

Endpoints (all under `/v1`, bearer JWT):

| Area | Endpoints |
|---|---|
| Auth | `POST /auth/google`, `POST /auth/apple`, `POST /auth/magic-link`, `GET /auth/magic-link/verify`, `POST /auth/refresh`, `POST /auth/logout` |
| Profile | `GET/PUT /me`, `PUT /me/targets`, `PUT /me/tone`, `PUT /me/reminders`, `POST /me/personality` (answers → scores), `DELETE /me/personality`, `POST /me/export`, `DELETE /me` |
| Day | `GET /days/:date` (everything Home needs in one call), `POST /water`, `POST /weight` |
| Meals | `POST /meals/analyze` (image), `POST /meals/parse-text`, `GET /foods/barcode/:ean`, `POST /meals`, `PATCH/DELETE /meals/:id`, `GET /me/favourites`, `GET /stats/nutrition` |
| Health | `POST /health/sync` (batched Health Connect upload), `GET /health/movement`, `GET /health/sleep`, `POST /activities` |
| AI | `GET /tips/today`, `POST /tips/:id/accept`, `POST /tips/next`, `GET /weekly-question`, `POST /weekly-question/answer`, `GET /sleep/window` |
| Push | `PUT /push/token` |
| Billing | `POST /billing/webhook`, `GET /me/quota` |

AI endpoints call Claude **server-side only** (`ANTHROPIC_API_KEY` in Railway variables; never in the app).

---

## Milestones and tasks

Each task: run in Claude Code with the model shown. Prompts assume `CLAUDE.md` is read automatically. Always finish with `npx tsc --noEmit && npx eslint .` and, after native changes, `cd android && ./gradlew assembleDebug`.

### Milestone 2 — Nutrition (mock data)

| # | Task | Model | Notes |
|---|---|---|---|
| 2.1 | Shared pieces: `BarChart` (7 bars, target line, weekday labels), `Sheet` wrapper, `Stepper`, `Segmented`, `Toggle`, `Slider` wrapper, `DayHeader` (‹ Šodien ›), meal-type chip | Opus 5.5 | Reused by 4 later screens; get it right once |
| 2.2 | Extend mock API: `getDay(date)` with meals/items/favourites, `analyzeMeal()` returning the Food-Result sample with a 2,7 s delay, `parseText()`, quota | Sonnet 5.5 | Types in `src/api/types.ts` |
| 2.3 | Food-Log screen with day navigation and delete entry | Sonnet 5.5 | Port from `Food-Log.dc.html` |
| 2.4 | Food-Camera with `expo-camera` + gallery + resize; quota banner; mode chips | Opus 5.5 | Native dep → verify Gradle build; add CAMERA permission in `android/` |
| 2.5 | Food-Analyzing + Food-Result (sliders, live totals, uncertain-item chips, meal-type) + save to mock day | Opus 5.5 | Logic-heavy |
| 2.6 | Food-Add sheet (text parse preview, favourites, barcode placeholder) | Sonnet 5.5 | Mic hidden until 6.5 |
| 2.7 | Food-Trends with `BarChart` and static insight | Sonnet 5.5 | |
| 2.8 | Wire Home: `Maltītes` → log, `Ēdiens`/`Foto` → camera; tip buttons; weight sheet | Sonnet 5.5 | |

Prompt (2.1–2.8 can be one session with Opus 5.5, or split as above):
> Milestone 2: implement the Uzturs flow (Food-Log, Food-Camera, Food-Analyzing, Food-Result, Food-Add, Food-Trends) from prototype/, using the mock API in src/api extended with meals, favourites and a fake analysis. Build the shared components first (BarChart, Sheet, Stepper, Segmented, Toggle, DayHeader). Camera via expo-camera with image resize before upload. Keep everything mocked but shaped like the real API in docs/PLAN.md.

### Milestone 3 — Onboarding (mock)

| # | Task | Model | Notes |
|---|---|---|---|
| 3.1 | `(onboarding)` stack, onboarding store (Zustand + MMKV or AsyncStorage), routing: first launch → welcome, else tabs | Opus 5.5 | Root `_layout` gate |
| 3.2 | Welcome carousel, Login (UI states only; buttons call mock auth) | Sonnet 5.5 | |
| 3.3 | Basics, Devices (mock connect), Goals with `computeTargets()` + unit tests (Jest) | Opus 5.5 | Formulas documented in code comments with sources |
| 3.4 | Personality: write the 20 Latvian statements (4/trait, reverse-keyed marked), scoring, style-name mapping; TestIntro, Test, Result screens | **Fable 5.1** for the item set + mapping, Sonnet 5.5 for the screens | Item wording affects everything downstream; review by the team before release |
| 3.5 | Me screen reads the profile from the store (tone toggle works locally) | Sonnet 5.5 | |

Prompt:
> Milestone 3: build the onboarding flow from prototype/ (welcome ×3, login, basics, devices, goals, personality intro/test/result) as an `(onboarding)` route group, gated in the root layout by an `onboardingDone` flag in a persisted store. Goals must compute targets from basics with documented formulas and unit tests. Write the full 20-statement Big Five item set in Latvian (4 per trait, some reverse-keyed) and the low/medium/high scoring. Login is UI-only for now.

### Milestone 4 — Movement, Sleep, Me, Pro (mock)

| # | Task | Model | Notes |
|---|---|---|---|
| 4.1 | Mock API: 7-day steps, HR/HRV series, workouts, zones, 14 sleep nights, reminders | Sonnet 5.5 | |
| 4.2 | Move screen (charts, sparklines with react-native-svg, workouts, zones) + manual activity form | Opus 5.5 | |
| 4.3 | Sleep screen: regularity plot, sleep-window timeline, wind-down steps that follow the lead time; `computeSleepWindow()` + `sleepScore()` with tests | Opus 5.5 | The window algorithm is reused by push (8.x) |
| 4.4 | Me screen complete (all sections, confirmations for delete, export placeholder, tone picker replacing Tone-Compare) | Sonnet 5.5 | |
| 4.5 | Pro paywall UI | Sonnet 5.5 | Purchase button disabled with "Drīzumā" |
| 4.6 | Review pass: touch targets ≥ 44 px, Latvian number format everywhere, no red for over-target, accessibility labels | Sonnet 5.5 | Checklist from CLAUDE.md |

Prompt:
> Milestone 4: build Move, Sleep, Me and Pro from prototype/ on mock data. Sleep needs computeSleepWindow (median bedtime of last 14 nights ± 15 min) and a documented sleepScore, both unit-tested. Me must include tone switch, reminders, privacy actions with confirmation dialogs and the Pro banner. Then audit all screens against the product rules in CLAUDE.md.

### Milestone 5 — Backend on Railway + real data

| # | Task | Model | Notes |
|---|---|---|---|
| 5.1 | Repo layout: `backend/` (or separate repo) with Fastify + Drizzle + Zod, Docker, Railway config, EU Postgres, migrations, seed with Ilze | Opus 5.5 | Decide mono-repo vs separate (recommend `backend/` in this repo, separate Railway service) |
| 5.2 | Auth: Google ID-token verify, Apple (later), magic link via Resend, JWT access + refresh, `expo-secure-store` in app, deep link `balanss://auth` | **Fable 5.1** | Security-critical; ask it to threat-model the magic link (single use, 15 min, hashed token) |
| 5.3 | Profile, targets, tone, personality, reminders endpoints + app wiring (`src/api` real client with `EXPO_PUBLIC_API_URL`, mock kept behind `EXPO_PUBLIC_USE_MOCK=1`) | Opus 5.5 | |
| 5.4 | Day, water, weight, meals CRUD, favourites, stats; image upload to Railway volume or S3-compatible bucket (EU) | Opus 5.5 | |
| 5.5 | GDPR: export job (JSON zip, e-mailed link), account deletion with grace period, personality deletion, audit log, data-retention doc | **Fable 5.1** | Special-category data; produce `docs/PRIVACY.md` too |
| 5.6 | Offline behaviour: request queue for water/meals when offline, optimistic UI | Opus 5.5 | |

Prompt (5.1):
> Milestone 5: create backend/ — Node 22 + TypeScript, Fastify, Drizzle, Postgres, Zod validation, JWT auth — deployable to Railway (Dockerfile + railway.json). Implement the schema and endpoints listed in docs/PLAN.md "Backend surface" for auth (Google + magic link), profile, day, water, weight and meals. Seed with the sample user Ilze. Then switch the app's src/api to the real client behind EXPO_PUBLIC_API_URL, keeping mocks selectable with EXPO_PUBLIC_USE_MOCK.

### Milestone 6 — AI features (server-side, Claude API)

All calls use `@anthropic-ai/sdk`, model `claude-opus-5-5`, adaptive thinking (default), `output_config.effort` tuned per endpoint, structured outputs (`output_config.format` with Zod → JSON schema) so the app never parses free text. Prompt caching on the stable system prompt. Log `usage` per call for cost tracking.

| # | Task | Model to build with | Runtime model | Notes |
|---|---|---|---|---|
| 6.1 | `POST /meals/analyze`: image → items with grams, per-100 g nutrition, confidence, alternatives for low-confidence items; Latvian names; portion heuristics (plate size) | **Fable 5.1** for prompt + schema + eval set, Opus 5.5 for the endpoint | Opus 5.5, effort `medium`, vision input (resized JPEG), structured output | Build an eval of 30 labelled Latvian meal photos (team photos) first; target ±20 % kcal on 80 % of them |
| 6.2 | `POST /meals/parse-text` ("2 olas un maize" → items) | Opus 5.5 | Opus 5.5, effort `low`, structured output | Also used by voice later |
| 6.3 | Tone engine: one module `generateTip(dayData, profile, tone)` → tip, water reminder, weekly question, sleep-window push, trends insight. System prompt encodes the three styles (plāns un skaitļi / dažādība un jaunais / maigi, bez spiediena) + neutral, Latvian only, no medical claims, numbers in Latvian format, max lengths per surface. Golden examples from Tone-Compare and Notif-* | **Fable 5.1** | Opus 5.5, effort `medium` | Deterministic tone selection from traits: C high → plan; O high → novelty; ES low → gentle; else neutral (user override wins). Add an LLM-judge eval (Sonnet 5.5 as judge) for tone adherence + safety |
| 6.4 | `GET /tips/today` (generate once per day per user, cache in `tips`), `POST /tips/next` (regenerate with "different angle" and exclusion list), `POST /tips/:id/accept` | Opus 5.5 | as above | Nightly pre-generation job so Home loads instantly |
| 6.5 | Weekly question: Sunday generation, 4 options, reply text per option (as in Home) | Opus 5.5 | Opus 5.5 | |
| 6.6 | Trends insight + Pro weekly summary (`GET /stats/weekly-summary`) | Sonnet 5.5 | Opus 5.5 | Pro-gated |
| 6.7 | Quota + cost guard: 3 analyses/day free, unlimited Pro; per-user daily token cap; graceful "Šodien limits sasniegts" | Opus 5.5 | — | |
| 6.8 | Voice input in Food-Add (`expo-speech-recognition`, lv-LV) → parse-text | Sonnet 5.5 | — | Optional |

Prompt (6.3):
> Implement the tone engine in backend/src/ai/tone.ts using @anthropic-ai/sdk (claude-opus-5-5, adaptive thinking, structured outputs, prompt caching on the system prompt). Input: today's data + targets + personality levels + selected tone. Output: {tip, waterReminder, weeklyQuestion?, sleepWindowPush, trendsInsight} in Latvian, following the three styles in prototype/Tone-Compare.dc.html and prototype/Notif-*.dc.html as golden examples, with the rules from CLAUDE.md (no medical claims, Latvian number format, no pressure language in the gentle style). Add an eval script with 12 fixture days × 4 tones graded by claude-sonnet-5-5 as judge for tone adherence and safety.

### Milestone 7 — Health data

| # | Task | Model | Notes |
|---|---|---|---|
| 7.1 | `react-native-health-connect`: manifest permissions (Steps, ActiveCaloriesBurned, HeartRate, RestingHeartRate, HeartRateVariabilityRmssd, SleepSession, ExerciseSession, Weight), permissions-rationale activity, `minSdk 26` (done), Gradle build check | **Fable 5.1** | Native + permissions; easy to get subtly wrong |
| 7.2 | Sync service: on app foreground + background task (`expo-background-task`), read last 14 days, dedupe by record id, `POST /health/sync` batched | Opus 5.5 | |
| 7.3 | Devices onboarding + Me "Ierīces" use real permission state; attribution strings per platform | Sonnet 5.5 | |
| 7.4 | Test on a real phone with a synced watch; fix stage mapping (deep/REM/light/awake) | Opus 5.5 | Needs the user's device |
| 7.5 | iOS later: `npx expo prebuild --platform ios`, `react-native-health`, same sync interface | Opus 5.5 | When a Mac is available |

### Milestone 8 — Push + release

| # | Task | Model | Notes |
|---|---|---|---|
| 8.1 | `expo-notifications` + FCM setup (`google-services.json` in `android/app`, kept out of git if desired), token registration `PUT /push/token` | Opus 5.5 | |
| 8.2 | Backend scheduler: sleep-window reminder (window − lead), water nudges by frequency (Reti/Vidēji/Bieži), meal log reminders; quiet hours; tone-engine copy | Opus 5.5 | BullMQ or Railway cron every 5 min |
| 8.3 | In-app handling: tap → deep link to the right screen; permission prompt with rationale | Sonnet 5.5 | |
| 8.4 | Signed release: upload keystore (outside git), `keystore.properties`, `assembleRelease` / `bundleRelease`, version code bump script, ProGuard check | Opus 5.5 | |
| 8.5 | Play Console internal testing: listing text in Latvian, data-safety form (health + personality data), privacy policy URL | Sonnet 5.5 | Team supplies account |
| 8.6 | Billing: RevenueCat SDK, products `pro_year` €49 / `pro_month` €5,99, webhook → `plan` | Opus 5.5 | |

### Milestone 9 — Quality and launch readiness

| # | Task | Model | Notes |
|---|---|---|---|
| 9.1 | Unit tests: formatting, targets, sleep window, scoring, tone selection; component tests for Home and Food-Result (Jest + RN Testing Library) | Sonnet 5.5 | |
| 9.2 | E2E smoke on emulator (Maestro): onboarding → Home → log meal → Me | Opus 5.5 | |
| 9.3 | Backend integration tests (Vitest + test DB), CI on GitHub Actions: lint, typecheck, tests, `assembleDebug` | Opus 5.5 | |
| 9.4 | Security & GDPR review of the whole repo (`/security-review`), rate limits, secrets, PII in logs, DPA list (Railway, Anthropic, Resend, RevenueCat) | **Fable 5.1** | Produce findings + fixes |
| 9.5 | Performance: Home in one request, image upload size, list virtualisation, cold start | Sonnet 5.5 | |
| 9.6 | Crash/analytics (Sentry), feature flags for AI endpoints, kill switch | Sonnet 5.5 | |

### Milestone 10: Suggestions that fit real life (pantry + free time)

Feedback from testing: a food tip that names ingredients the user doesn't have at home feels like pressure. The user also asked for ideas beyond food: films (cinema or Go3), books and local events, all real and still possible to attend.

| # | Task | Model | Notes |
|---|---|---|---|
| 10.1 | **Pantry ("Kas ir mājās")**: `pantry` table, `GET/PUT /pantry`, `POST /pantry/scan` (fridge photo → ingredient list with Claude vision; the user confirms before saving). The list counts as fresh for 3 days. | Opus 5.5 | Only ingredient names are stored |
| 10.2 | **Tips use the pantry**: if the pantry is fresh, food ideas use only those items plus basics (salt, oil, water, spices). If the pantry is unknown, food ideas stay flexible: "ja ir mājās", two ordinary alternatives, never a must-buy recipe. Templates do the same. | Opus 5.5 | Prompt + templates + tests |
| 10.3 | **Tip card "Nav mājās"** opens the pantry screen (type, or take a photo). Saving it regenerates the tip without counting a dismissal. | Sonnet 5.5 | |
| 10.4 | **Brīvais laiks** screen (from Šodiena): Filma (genre; kinoteātrī / Go3 / jebkur), Grāmata (genre), Pasākums (type; šodien / nedēļas nogalē). City is chosen once (no GPS). | Opus 5.5 | |
| 10.5 | **Real listings via Claude web search**: stage 1 is `web_search_20260209` with the user's city (approximate location, Europe/Riga); stage 2 turns the findings into structured items. The server keeps only links that the search actually returned. It drops events and screenings that start in under 30 minutes or fall outside the chosen window. Results are cached for 2 hours; there is a daily per-user limit. | Opus 5.5 | Sends only city + choices, no personal data |
| 10.6 | **Honest fallback**: if search fails or finds nothing, the user gets curated books and timeless ideas (walk, library). Events are never invented. | Sonnet 5.5 | |
| 10.7 | **Tests**: unit tests (pantry-aware templates, listing validation: unknown URL / past / outside the window; two-stage engine with a stubbed client) and E2E (pantry → new tip; Brīvais laiks → film / Go3 / book / event, and a past screening is not shown). | Opus 5.5 | `AI_PROVIDER=fake` returns fixed listings, including one already started |

---

## Decisions to confirm before milestone 5

1. Backend in this repo (`backend/`) or a separate repo? (Recommended: same repo, separate Railway service.)
2. Image storage: Railway volume vs S3-compatible EU bucket (Hetzner/Scaleway). (Recommended: bucket; delete originals after 30 days.)
3. Apple sign-in on Android: implement now via web flow, or wait for iOS?
4. Barcode source: Open Food Facts (free, patchy Latvian coverage) — acceptable for v1?
5. Push provider: Expo push service vs direct FCM. (Recommended: Expo push service, simpler.)
6. Runtime AI model per endpoint after evals: keep Opus 5.5 everywhere or drop tips to Sonnet 5.5 if the judge scores match.

## Environment notes for cloud sessions

- Gradle needs `dl.google.com` and `maven.google.com` allowed in the environment's network settings; without it native builds run only on your machine.
- Never run `expo prebuild --clean`; `android/` is source of truth.
- Keep `EXPO_PUBLIC_USE_MOCK=1` available so UI work never depends on the backend being up.
