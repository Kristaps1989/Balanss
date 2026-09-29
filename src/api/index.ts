/**
 * API entry point. Uses the real backend at EXPO_PUBLIC_API_URL, or the
 * in-memory mock when EXPO_PUBLIC_USE_MOCK=1 or no URL is configured.
 */
import type { Api } from './api';
import { HttpApi } from './http';
import { MockApi } from './mock';

export * from '@shared/api';
export { ApiError, type Api } from './api';
export { tokenStore } from './http';

export const API_URL = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '');
export const USE_MOCK = process.env.EXPO_PUBLIC_USE_MOCK === '1' || !API_URL;

export const api: Api = USE_MOCK ? new MockApi() : new HttpApi(API_URL!);
