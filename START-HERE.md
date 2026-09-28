# Balanss — how to start in Claude Code (Android Studio builds)

## 0. Install once
- **Android Studio** (includes the Android SDK and an emulator), then in SDK Manager: Android SDK Platform 35 + Build-Tools
- **Node.js LTS** (20 or newer) and **Git**
- A JDK: use the one bundled with Android Studio (set `JAVA_HOME` to it if Gradle complains)
- On your phone: Settings → About → tap "Build number" 7× → Developer options → **USB debugging** on

## 1. Set up the folder
1. Unzip this package into a new folder, e.g. `balanss/`, and run `git init`.
2. Start Claude Code in the folder: `claude`. It reads `CLAUDE.md` automatically.

## 2. First prompt (copy-paste)
> Read CLAUDE.md and look through the screens in prototype/ (start with canvas.json for the order).
> Create the React Native + TypeScript app with Expo SDK and expo-router, following the route map in CLAUDE.md.
> Then run `npx expo prebuild --platform android` so we have a native android/ project I can open in Android Studio (no Expo Go).
> Milestone 1: design tokens + fonts, the bottom tab bar (5 slots, centred +), and the Šodiena (Home) screen
> matching prototype/Home.dc.html, using mocked sample data for Ilze.
> Make sure `cd android && ./gradlew assembleDebug` succeeds, and give me exact steps to run it from Android Studio on my USB-connected phone.

## 3. Run on your phone from Android Studio
1. In the project folder, start the JS server: `npx expo start` (leave it running).
2. Android Studio → **Open** → select the `android/` folder → wait for Gradle sync.
3. Connect the phone by USB (allow debugging), run `adb reverse tcp:8081 tcp:8081`, then press **Run ▶**.
   Shortcut that does all of this: `npx expo run:android`.
4. Code changes reload instantly while Metro runs. Rebuild with ▶ only after native changes.

## 4. Share a test build with colleagues
- Android Studio → **Build → Generate Signed App Bundle / APK → APK**. Create a keystore once and keep it safe, outside git.
- Send the APK file (Drive/Slack). Colleagues install it with "Install unknown apps" allowed.
- Later: upload an **AAB** to Google Play **Internal testing** (developer account, one-time $25).

## 5. Suggested milestones (one prompt each)
1. Tokens, tab bar, Home (mock data)
2. Nutrition: log, camera → analysing → result with portion sliders, trends
3. Onboarding: welcome, login (Google / Apple / e-mail), basics, devices, goals with sources, personality test + result
4. Movement, Sleep (sleep-window timeline), Me (settings, privacy, logout), Pro paywall
5. Backend on Railway: Node API + Postgres, auth, meal log, profile. Switch the app from mocks to `EXPO_PUBLIC_API_URL`.
6. AI: food-photo analysis endpoint + tone-adapted tips and weekly questions
7. Health Connect (`react-native-health-connect`, manifest permissions, test on a real phone with synced watch data)
8. Push notifications (sleep window, water) + a signed release APK/AAB

## Notes
- After the first `expo prebuild`, `android/` is yours. Never run `expo prebuild --clean`, because it would overwrite native changes.
- The Apple and Google logos for the sign-in buttons are placeholders. Use the official assets from Apple's "Sign in with Apple" guidelines and Google's "Sign in with Google" branding guidelines.
- Tone-Compare and the Notif-* screens are pitch material, not app screens.
