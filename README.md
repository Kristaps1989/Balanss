# Balanss

A daily health companion app (Latvian). You log meals from a photo. Movement, heart rate and sleep come from Health Connect / Apple Health. Every tip is written in a tone that fits your Big Five personality profile.

- `app/`, `src/` — React Native + Expo Router app (Android first). See `CLAUDE.md` for conventions and `prototype/` for the design reference.
- `shared/` — API contract and pure domain logic used by both the app and the backend (targets, personality scoring, sleep window, nutrition math).
- `backend/` — Node/TypeScript API (Fastify, Postgres, Claude for food photos and tone-adapted copy). See `backend/README.md`.
- `android/` — committed native project. Never run `expo prebuild --clean`.
- `e2e/` — Playwright end-to-end tests that run the web build of the app against the real backend.
- `docs/PLAN.md` — the implementation plan; `docs/NATIVE_SETUP.md` — accounts and keys (Google, FCM, RevenueCat, Health Connect, signing).

## Run it

```bash
npm install
# UI only, no backend: the mock signs in ilze@piemers.lv as the sample user
EXPO_PUBLIC_USE_MOCK=1 npx expo start

# With the backend (local Postgres, see backend/README.md)
cd backend && npm install && npm run migrate && npm run seed && npm run dev
EXPO_PUBLIC_API_URL=http://10.0.2.2:3000 npx expo start   # Android emulator
```

On a phone, open `android/` in Android Studio and press Run ▶ while Metro is running. You can also run `npx expo run:android`. For USB, run `adb reverse tcp:8081 tcp:8081` (and `tcp:3000` for a local backend).

## Checks

```bash
npx tsc --noEmit && npx eslint . && npm test          # app + shared unit tests
cd backend && npm run typecheck && npm test           # backend integration tests (Postgres)
npm run e2e                                           # end-to-end: web build + backend + Playwright
cd android && ./gradlew assembleDebug                 # native build
```

CI (`.github/workflows/ci.yml`) runs all four on every pull request.
