/**
 * Android test download shown on zestwell.app. The APK is attached to a GitHub Release as
 * `zestwell.apk`; the "latest/download" URL always points at the newest release, so publishing a
 * new release is enough for the link. Update version, size and checksum here in the same PR.
 *
 * Build: cd android && ./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a
 * (signed with the private upload key via android/keystore.properties, never the debug key).
 */
export const ANDROID_RELEASE = {
  version: '0.2.2',
  sizeMb: 57,
  /** SHA-256 of the published APK, so testers can check the file. */
  sha256: '802f3c80ab202226bf30504d7d255acb23de073506f555bb6520d5979be9f625',
  minAndroid: '8.0',
  url: 'https://github.com/Kristaps1989/Balanss/releases/latest/download/zestwell.apk',
} as const;
