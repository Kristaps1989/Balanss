import type { AuthTokens } from '@shared/api';

import { secureStore } from '@/lib/storage';

import { ApiError, type Api } from './api';

const TOKENS_KEY = 'balanss.auth';

type Stored = { accessToken: string; refreshToken: string; expiresAt: number };

/** Holds auth tokens and notifies listeners when the session starts or ends. */
class TokenStore {
  private tokens: Stored | null = null;
  private loaded = false;
  private listeners = new Set<(signedIn: boolean) => void>();

  async load(): Promise<Stored | null> {
    if (!this.loaded) {
      const raw = await secureStore.get(TOKENS_KEY);
      this.tokens = raw ? (JSON.parse(raw) as Stored) : null;
      this.loaded = true;
    }
    return this.tokens;
  }

  async save(t: AuthTokens) {
    this.tokens = {
      accessToken: t.accessToken,
      refreshToken: t.refreshToken,
      expiresAt: Date.now() + (t.expiresIn - 30) * 1000,
    };
    this.loaded = true;
    await secureStore.set(TOKENS_KEY, JSON.stringify(this.tokens));
    this.listeners.forEach((l) => l(true));
  }

  async clear() {
    this.tokens = null;
    this.loaded = true;
    await secureStore.remove(TOKENS_KEY);
    this.listeners.forEach((l) => l(false));
  }

  subscribe(l: (signedIn: boolean) => void) {
    this.listeners.add(l);
    return () => {
      this.listeners.delete(l);
    };
  }
}

export const tokenStore = new TokenStore();

export class HttpApi implements Api {
  private refreshing: Promise<Stored | null> | null = null;

  constructor(private baseUrl: string) {}

  private async refresh(): Promise<Stored | null> {
    if (!this.refreshing) {
      this.refreshing = (async () => {
        const current = await tokenStore.load();
        if (!current) return null;
        const res = await fetch(`${this.baseUrl}/v1/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken: current.refreshToken }),
        });
        if (!res.ok) {
          await tokenStore.clear();
          return null;
        }
        await tokenStore.save((await res.json()) as AuthTokens);
        return tokenStore.load();
      })().finally(() => {
        this.refreshing = null;
      });
    }
    return this.refreshing;
  }

  private async request<T>(method: string, path: string, body?: unknown, auth = true, retry = true): Promise<T> {
    const headers: Record<string, string> = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (auth) {
      let t = await tokenStore.load();
      if (t && t.expiresAt < Date.now()) t = await this.refresh();
      if (!t) throw new ApiError(401, 'unauthorized', 'Not signed in');
      headers.Authorization = `Bearer ${t.accessToken}`;
    }
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/v1${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      throw new ApiError(0, 'network', 'Network error');
    }
    if (res.status === 401 && auth && retry) {
      const t = await this.refresh();
      if (t) return this.request<T>(method, path, body, auth, false);
    }
    if (!res.ok) {
      let code = 'http_error';
      let message = res.statusText;
      try {
        const e = (await res.json()) as { error?: { code: string; message: string } };
        code = e.error?.code ?? code;
        message = e.error?.message ?? message;
      } catch {
        // non-JSON error body
      }
      throw new ApiError(res.status, code, message);
    }
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  private get = <T>(p: string) => this.request<T>('GET', p);
  private post = <T>(p: string, b?: unknown) => this.request<T>('POST', p, b ?? {});
  private put = <T>(p: string, b: unknown) => this.request<T>('PUT', p, b);
  private patch = <T>(p: string, b: unknown) => this.request<T>('PATCH', p, b);
  private del = <T>(p: string) => this.request<T>('DELETE', p);

  private async signIn(path: string, body: unknown) {
    const t = await this.request<AuthTokens>('POST', path, body, false);
    await tokenStore.save(t);
    return t;
  }

  requestMagicLink = (email: string) => this.request<{ devToken?: string }>('POST', '/auth/magic-link', { email }, false);
  verifyMagicLink = (token: string) => this.signIn('/auth/magic-link/verify', { token });
  signInWithGoogle = (idToken: string) => this.signIn('/auth/google', { idToken });
  signInWithApple = (identityToken: string, firstName?: string) => this.signIn('/auth/apple', { identityToken, firstName });
  logout = async () => {
    const t = await tokenStore.load();
    if (t) await this.request('POST', '/auth/logout', { refreshToken: t.refreshToken }, false).catch(() => undefined);
    await tokenStore.clear();
  };

  me = () => this.get<import('@shared/api').Me>('/me');
  updateProfile: Api['updateProfile'] = (p) => this.put('/me/profile', p);
  updateTargets: Api['updateTargets'] = (t) => this.put('/me/targets', t);
  setTone: Api['setTone'] = (preference) => this.put('/me/tone', { preference });
  updateReminders: Api['updateReminders'] = (r) => this.put('/me/reminders', r);
  updateDevices: Api['updateDevices'] = (d) => this.put('/me/devices', d);
  completeOnboarding: Api['completeOnboarding'] = () => this.post('/me/onboarding/complete');
  submitPersonality: Api['submitPersonality'] = (req) => this.post('/me/personality', req);
  deletePersonality: Api['deletePersonality'] = () => this.del('/me/personality');
  exportData: Api['exportData'] = () => this.post('/me/export');
  deleteAccount: Api['deleteAccount'] = async () => {
    await this.del('/me');
    await tokenStore.clear();
  };
  quota: Api['quota'] = () => this.get('/me/quota');
  updatePreferences: Api['updatePreferences'] = (p) => this.put('/me/preferences', p);
  setAiPersonalization: Api['setAiPersonalization'] = (enabled) => this.put('/me/ai', { enabled });

  day: Api['day'] = (date) => this.get(`/days/${date}`);
  addWater: Api['addWater'] = (date, ml) => this.post('/water', { date, ml });
  addWeight: Api['addWeight'] = (date, kg) => this.post('/weight', { date, kg });

  analyzeMeal: Api['analyzeMeal'] = (req) => this.post('/meals/analyze', req);
  parseText: Api['parseText'] = (text) => this.post('/meals/parse-text', { text });
  barcode: Api['barcode'] = (ean) => this.get(`/foods/barcode/${encodeURIComponent(ean)}`);
  createMeal: Api['createMeal'] = (req) => this.post('/meals', req);
  updateMeal: Api['updateMeal'] = (id, req) => this.patch(`/meals/${id}`, req);
  deleteMeal: Api['deleteMeal'] = async (id) => {
    await this.del(`/meals/${id}`);
  };
  favourites: Api['favourites'] = () => this.get('/favourites');
  createFavourite: Api['createFavourite'] = (req) => this.post('/favourites', req);
  deleteFavourite: Api['deleteFavourite'] = async (id) => {
    await this.del(`/favourites/${id}`);
  };
  nutritionStats: Api['nutritionStats'] = (date, days = 7) => this.get(`/stats/nutrition?days=${days}&date=${date}`);

  healthSync: Api['healthSync'] = (req) => this.post('/health/sync', req);
  movement: Api['movement'] = (date, days = 7) => this.get(`/health/movement?days=${days}&date=${date}`);
  sleep: Api['sleep'] = (date) => this.get(`/health/sleep?date=${date}`);
  createActivity: Api['createActivity'] = (req) => this.post('/activities', req);

  tipToday: Api['tipToday'] = (date) => this.get(`/tips/today?date=${date}`);
  tipNext: Api['tipNext'] = (date) => this.post(`/tips/next?date=${date}`);
  acceptTip: Api['acceptTip'] = (id) => this.post(`/tips/${id}/accept`);
  reportTip: Api['reportTip'] = async (id, reason) => {
    await this.post(`/tips/${id}/report`, { reason });
  };
  weeklySummary: Api['weeklySummary'] = (date) => this.get(`/insights/weekly?date=${date}`);
  recipes: Api['recipes'] = (date) => this.get(`/recipes?date=${date}`);
  logRecipe: Api['logRecipe'] = (id, date) => this.post(`/recipes/${encodeURIComponent(id)}/log`, { date });
  weeklyQuestion: Api['weeklyQuestion'] = (date) => this.get(`/weekly-question?date=${date}`);
  answerWeeklyQuestion: Api['answerWeeklyQuestion'] = (id, optionIndex) =>
    this.post(`/weekly-question/${id}/answer`, { optionIndex });

  registerPushToken: Api['registerPushToken'] = async (req) => {
    await this.put('/push/token', req);
  };
}
