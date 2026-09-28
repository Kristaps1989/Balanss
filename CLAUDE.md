# Balanss — project guide for Claude Code

## What we are building
A daily health companion app (working title **Balanss**). It combines nutrition (photo-based food logging: kcal, protein, carbs, fat, fibre, water), movement, heart rate and sleep (read from Health Connect on Android and Apple Health on iOS) in one daily view.
**Differentiator:** a short Big Five personality test at onboarding. Every tip, reminder and weekly question is delivered in a tone that fits the user's personality. Same data, different delivery.
Target user: an ordinary adult who finds classic calorie apps too complex. Principle: simple, visual, every action in max 2 taps.

## Source of truth for UI
`prototype/` holds the clickable hi-fi prototype, one screen per `.dc.html` file (390×844, Latvian copy).
Treat these files as **design reference only**: copy their layout, spacing, colours, copy and flows. Do not port their HTML or runtime code. `prototype/canvas.json` lists every screen and its order.

| Prototype file | App route (expo-router) |
|---|---|
| Main, Onb-Welcome2, Onb-Welcome3 | `(onboarding)/welcome` (3-slide carousel) |
| Onb-Login | `(onboarding)/login` |
| Onb-Basics | `(onboarding)/basics` |
| Onb-Device | `(onboarding)/devices` |
| Onb-Goals | `(onboarding)/goals` |
| Onb-TestIntro, Onb-Test, Onb-Result | `(onboarding)/personality/*` |
| Home | `(tabs)/index` (Šodiena) |
| Add-Sheet | global "+" bottom sheet |
| Food-Log, Food-Camera, Food-Analyzing, Food-Result, Food-Add, Food-Trends | `(tabs)/nutrition/*` |
| Move | `(tabs)/movement` |
| Sleep | `(tabs)/sleep` |
| Me, Pro | `me/*` (opened from the avatar, top right) |
| Tone-Compare, Notif-* | internal demo screens (pitch only; do not ship) |

Bottom tab bar: Šodiena · Uzturs · (+) · Kustība · Miegs — five equal slots, with the + centred. "Es" is reached via the avatar.

## Tech stack (decided)
- **App:** React Native + TypeScript on Expo SDK (`expo-router`), **built natively in Android Studio**. We do **not** use Expo Go and do not depend on EAS cloud builds. Android first, iOS later from the same code (`npx expo prebuild --platform ios` + Xcode).
- **Native project:** generate `android/` once with `npx expo prebuild --platform android` and **commit it**. From then on, treat `android/` as the source of truth: native changes (permissions, Gradle, Health Connect setup) go directly in `android/`. Never run `expo prebuild --clean`, because it would overwrite them.
- **Dev loop:** `npx expo start` (Metro) + Run ▶ in Android Studio, or `npx expo run:android`. For a USB phone, run `adb reverse tcp:8081 tcp:8081`.
- **Release/test builds:** Android Studio → Build → Generate Signed App Bundle/APK (or `cd android && ./gradlew assembleRelease`). Keep the upload keystore out of git.
- **Backend:** Node/TypeScript API on **Railway** + Railway Postgres. The app reads `EXPO_PUBLIC_API_URL` (use the Railway URL; `http://10.0.2.2:PORT` only for a local backend on the emulator).
- **Health data:** `react-native-health-connect` (Android). `minSdkVersion` ≥ 26; declare Health Connect read permissions and the permissions-rationale activity in `AndroidManifest.xml`. Later `react-native-health` (iOS HealthKit).
- **Auth:** Sign in with Google + Sign in with Apple, plus e-mail magic link.
- **AI:** food-photo recognition and tone-adapted tips are generated server-side. Never call AI providers or put API keys in the app.
- **Push:** expo-notifications (FCM/APNs), scheduled by the backend (e.g. the sleep window reminder).

## Design tokens (from the prototype)
- Background `#F7F3EE`, card `#FFFFFF` with 1px border `#EFE8DE`, radius 24 (cards), 28 (pill buttons), 20 (option cards)
- Ink `#26231F`, secondary text `#5E5850`, caption `#6F685E`
- Accent `#D9693C`; text-safe accent `#A9502A`; commit button `#B9532A`; accent soft `#FBEBE1`
- Macros: protein `#56679A`, carbs `#C08A2E`, fat `#9A6F8F`, fibre/steps `#5E8C74`, water `#4F8DB8` / soft `#E3F0F8`
- Sleep: deep `#3A4B7E`, REM `#8494C6`, light `#C3CCE7`, sleep-window card `#26304F`
- Fonts: **Bricolage Grotesque** (headings, big numbers), **Figtree** (body). Both are Google Fonts via `@expo-google-fonts/*`.
- Never use red for "over target". Touch targets ≥ 44 px. No emoji in UI.

## Product rules
- All user-facing copy in **Latvian**. Numbers use Latvian format: `1 480 kcal`, `1,2 l`.
- No medical claims or diagnoses. Recommendations stay at habit level. Show the disclaimer where targets are set.
- Device-data cards show attribution: "Dati no Apple Health" / "Dati no Health Connect".
- Personality test: 20 statements, 5-point scale; the result shows 5 traits (Atvērtība, Apzinīgums, Ekstraversija, Labvēlība, Emocionālā stabilitāte) as low/medium/high. Show "Šis nav klīnisks vai diagnostisks tests." The user can switch to a neutral tone or delete the profile at any time.
- Tone engine: the same data produces a tip, reminders and a weekly question in one of the tone styles (plan & numbers / novelty / gentle, no pressure). See `prototype/Tone-Compare.dc.html` for reference copy.
- Health and personality data are GDPR special-category data: collect the minimum, keep EU hosting, and provide export and delete-all (see the Me screen).

## Sample user (for seed data and tests)
Ilze, 34, 168 cm, 71 kg, goal: desired weight 66 kg + routine. Devices: Apple Watch + Polar H10. Traits: C high, O medium, E low, A high, emotional stability low.
Sample day: 1 480 / 1 750 kcal, protein 68/110 g, carbs 160/190 g, fat 52/60 g, fibre 18/25 g, water 1,2/2,3 l, steps 6 430/8 000, resting HR 61, HRV 42 ms, sleep 6 h 40 min (deep 1h05, REM 1h20, light 4h15), bedtime 23:48, sleep window 23:00–23:30.

## Conventions
- TypeScript strict. Components in `src/components`, screens in `app/`, API client in `src/api`.
- Mock the API with the sample data first, so screens can be built before the backend exists.
- Always verify that `cd android && ./gradlew assembleDebug` still builds after adding a native dependency.
