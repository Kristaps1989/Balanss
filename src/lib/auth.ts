import { Platform } from 'react-native';

import { api, USE_MOCK } from '@/api';

const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;

/** Google sign-in is available on native builds with a configured OAuth web client ID (or in mock mode). */
export const googleAvailable = USE_MOCK || (Platform.OS !== 'web' && !!GOOGLE_WEB_CLIENT_ID);
/** Sign in with Apple: iOS only for now (Android needs the web flow). */
export const appleAvailable = USE_MOCK || Platform.OS === 'ios';

export class SignInCancelled extends Error {}

export async function signInWithGoogle() {
  if (USE_MOCK) return api.signInWithGoogle('mock');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { GoogleSignin } = require('@react-native-google-signin/google-signin') as typeof import('@react-native-google-signin/google-signin');
  GoogleSignin.configure({ webClientId: GOOGLE_WEB_CLIENT_ID });
  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
  const res = await GoogleSignin.signIn();
  if (res.type !== 'success') throw new SignInCancelled();
  if (!res.data.idToken) throw new Error('No Google ID token');
  return api.signInWithGoogle(res.data.idToken);
}

export async function signInWithApple() {
  if (USE_MOCK) return api.signInWithApple('mock');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Apple = require('expo-apple-authentication') as typeof import('expo-apple-authentication');
  try {
    const cred = await Apple.signInAsync({
      requestedScopes: [Apple.AppleAuthenticationScope.FULL_NAME, Apple.AppleAuthenticationScope.EMAIL],
    });
    if (!cred.identityToken) throw new Error('No Apple identity token');
    return api.signInWithApple(cred.identityToken, cred.fullName?.givenName ?? undefined);
  } catch (e) {
    if ((e as { code?: string }).code === 'ERR_REQUEST_CANCELED') throw new SignInCancelled();
    throw e;
  }
}

export async function signOutProviders() {
  if (USE_MOCK || Platform.OS === 'web' || !GOOGLE_WEB_CLIENT_ID) return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { GoogleSignin } = require('@react-native-google-signin/google-signin') as typeof import('@react-native-google-signin/google-signin');
    await GoogleSignin.signOut();
  } catch {
    // not signed in with Google
  }
}
