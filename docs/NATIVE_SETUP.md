# Native setup (Android first)

Everything below needs an account or a secret only the team can create. The code is already wired; each step says which environment variable or file switches the feature on. Until a step is done, the app still builds and runs: the feature is hidden or shows a "not available yet" state.

All `EXPO_PUBLIC_*` variables go in a `.env` file in the project root (it is git-ignored). Metro reads it on start. Restart `npx expo start` after changing it.

```bash
# .env
# EXPO_PUBLIC_API_URL defaults to https://balanss-production.up.railway.app (see docs/RAILWAY.md)
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=<...>.apps.googleusercontent.com
EXPO_PUBLIC_REVENUECAT_ANDROID_KEY=goog_<...>
EXPO_PUBLIC_EAS_PROJECT_ID=<uuid>
EXPO_PUBLIC_PRIVACY_URL=https://<site>/privatums
EXPO_PUBLIC_TERMS_URL=https://<site>/noteikumi
```

For UI work without a backend, set `EXPO_PUBLIC_USE_MOCK=1`. The mock signs in `ilze@piemers.lv` as the seeded sample user; any other e-mail starts onboarding as a new user.

## 1. Build once after pulling

New native modules were added: camera, image picker and manipulator, notifications, secure store, Health Connect, RevenueCat, Google sign-in, Apple sign-in. Expo autolinks them at Gradle time.

```bash
npm install
cd android && ./gradlew assembleDebug
```

`android/` is committed and is the source of truth. Do **not** run `expo prebuild --clean`. These changes were made by hand in `android/app/src/main/AndroidManifest.xml`:

- `CAMERA` and `POST_NOTIFICATIONS` permissions
- the Health Connect read permissions
- the `<queries>` entry for `com.google.android.apps.healthdata`
- the Health Connect permissions-rationale intent filter and `ViewPermissionUsageActivity` alias

`android.minSdkVersion=26` is set in `android/gradle.properties`.

## 2. Health Connect

Nothing to configure for development. On the phone:

1. Install **Health Connect** (built into Android 14+). Your watch app (Garmin Connect, Polar Flow, Samsung Health, Google Fit, …) must write to it.
2. In Balanss, go to *Pievieno savu pulksteni* (onboarding step 3 or *Es → Ierīces*), tap **Savienot** and allow the permissions.

The app syncs the last 14 days on connect, on each launch, and when it returns to the foreground (at most every 30 min).

**Before Play release:** complete the Health Connect declaration in Play Console (*App content → Health apps*). List the read permissions above and link the privacy policy.

## 3. Sign in with Google

1. In Google Cloud Console, create a project and set up the OAuth consent screen (external, Latvian app name "Balanss").
2. Create OAuth client IDs:
   - **Web application** → copy its client ID into `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` (app) **and** `GOOGLE_CLIENT_IDS` (backend).
   - **Android** → package `lv.balanss.app`, plus the SHA-1 of your debug keystore (`cd android && ./gradlew signingReport`) and later the release/upload key. No `google-services.json` is needed for sign-in.
3. Rebuild. The "Turpināt ar Google" button appears once the variable is set.

## 4. Sign in with Apple

iOS only for now (`usesAppleSignIn` is set in `app.json`). When the iOS build is added:

1. Enable the *Sign in with Apple* capability for bundle ID `lv.balanss.app`.
2. Set `APPLE_BUNDLE_IDS=lv.balanss.app` on the backend.

Use the official button assets from Apple's guidelines.

## 5. E-mail magic link

Backend only:

1. Set `EMAIL_PROVIDER=resend`, `RESEND_API_KEY` and `EMAIL_FROM` (on a verified domain) on Railway.
2. The link opens `balanss://auth?token=…`; the `balanss` scheme is already registered in the manifest.

For local development, `EMAIL_PROVIDER=console` returns the token to the app, which shows a "Atvērt saiti (izstrādes režīms)" button.

## 6. Push notifications (sleep window, water, meals)

The backend schedules reminders and sends them through the Expo push service. Only the free Expo project is used, not EAS builds.

1. Create a Firebase project and add an Android app with package `lv.balanss.app`. Download `google-services.json` to `android/app/google-services.json`.
2. Apply the Google services Gradle plugin:
   - `android/build.gradle` → `dependencies { classpath('com.google.gms:google-services:4.4.2') }`
   - `android/app/build.gradle` → `apply plugin: "com.google.gms.google-services"` at the bottom
3. `npx expo login`, then create a project at expo.dev. Copy its project ID into `EXPO_PUBLIC_EAS_PROJECT_ID`.
4. At expo.dev → Project → Credentials → Android, upload the **FCM V1 service account key** (Firebase → Project settings → Service accounts → Generate key).
5. Rebuild. After onboarding, the app asks for notification permission (Android 13+) and registers its token with `PUT /v1/push/token`.

## 7. Balanss Pro (RevenueCat + Google Play Billing)

1. In Play Console, create subscriptions `pro_year` (€49 / year) and `pro_month` (€5,99 / month). Billing needs the app uploaded to at least internal testing.
2. In RevenueCat, create a project, add the Play app, and connect the service account. Create the entitlement `pro` and an offering `default` with packages `$rc_annual` → `pro_year` and `$rc_monthly` → `pro_month`.
3. Copy the public Android SDK key into `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY`.
4. In RevenueCat → Integrations → Webhooks, set the URL `https://<api>/v1/billing/webhook` and the Authorization header `Bearer <REVENUECAT_WEBHOOK_SECRET>` (same value as the backend env var).

The app uses the Balanss user ID as the RevenueCat app user ID, so webhooks map straight to the account.

## 8. Signed release build

1. Create the upload keystore once and keep it **out of git** (`*.jks` and `keystore.properties` are ignored):

   ```bash
   keytool -genkeypair -v -storetype PKCS12 -keystore balanss-upload.jks -alias balanss -keyalg RSA -keysize 2048 -validity 10000
   ```

2. Create `android/keystore.properties` with `storeFile`, `storePassword`, `keyAlias`, `keyPassword`.
3. Build from Android Studio (*Build → Generate Signed App Bundle / APK*), or run `cd android && ./gradlew bundleRelease` / `assembleRelease`.
4. Bump `versionCode` in `android/app/build.gradle` for every Play upload.
