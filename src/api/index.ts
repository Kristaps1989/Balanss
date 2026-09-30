/**
 * API entry point. Uses the real backend at EXPO_PUBLIC_API_URL (default: the
 * production API on Railway), or the in-memory mock when EXPO_PUBLIC_USE_MOCK=1
 * or EXPO_PUBLIC_API_URL is set to an empty string.
 */
import type { Api } from './api';
import { HttpApi } from './http';
import { MockApi } from './mock';

export * from '@shared/api';
export { ApiError, type Api } from './api';
export { tokenStore } from './http';

/** Production API. Not a secret: every build talks to it unless EXPO_PUBLIC_API_URL says otherwise. */
export const DEFAULT_API_URL = 'https://balanss-production.up.railway.app';

export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? DEFAULT_API_URL).trim().replace(/\/+$/, '').replace(/\/v1$/, '');
export const USE_MOCK = process.env.EXPO_PUBLIC_USE_MOCK === '1' || !API_URL;

export const api: Api = USE_MOCK ? new MockApi() : new HttpApi(API_URL!);
