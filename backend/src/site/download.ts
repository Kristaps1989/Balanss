/**
 * Android test download shown on zestwell.app. The APK is attached to a GitHub Release as
 * `zestwell.apk`; the "latest/download" URL always points at the newest release, so publishing a
 * new release is enough for the link. Update version, size and checksum here in the same PR.
 *
 * Build: cd android && ./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a
 * (signed with the private upload key via android/keystore.properties, never the debug key).
 */
export const ANDROID_RELEASE = {
  version: '0.3.2',
  sizeMb: 57,
  /** SHA-256 of the published APK, so testers can check the file. */
  sha256: 'c53c46661e6540c5bd7eee5318130f53574cd6208bc21bbdd55c2695c6ce156c',
  minAndroid: '8.0',
  url: 'https://github.com/Kristaps1989/Balanss/releases/latest/download/zestwell.apk',
} as const;
