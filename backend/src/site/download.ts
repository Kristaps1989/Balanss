/**
 * Android test download shown on zestwell.app. The APK is attached to a GitHub Release as
 * `zestwell.apk`; the "latest/download" URL always points at the newest release, so publishing a
 * new release is enough for the link. Update version, size and checksum here in the same PR.
 *
 * Build: cd android && ./gradlew assembleRelease -PreactNativeArchitectures=armeabi-v7a,arm64-v8a
 * (one APK for 32-bit and 64-bit ARM phones; signed with the private upload key via
 * android/keystore.properties, never the debug key).
 */
export const ANDROID_RELEASE = {
  version: '0.3.3',
  sizeMb: 76,
  /** SHA-256 of the published APK, so testers can check the file. */
  sha256: 'b3471eaab45b4b0535cb13130e5c1c682041995fc9b674418543170073bea96b',
  minAndroid: '8.0',
  url: 'https://github.com/Kristaps1989/Balanss/releases/latest/download/zestwell.apk',
} as const;
