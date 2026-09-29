import { expect, type APIRequestContext, type Page } from '@playwright/test';

export const API = process.env.E2E_API_URL ?? 'http://localhost:3100';

/** Sign in through the real magic-link flow (the e2e backend runs EMAIL_PROVIDER=console). */
export async function signIn(page: Page, email: string) {
  await page.goto('/login');
  await page.getByTestId('email-open').click();
  await page.getByTestId('email-input').fill(email);
  await page.getByTestId('email-send').click();
  await page.getByTestId('dev-open-link').click();
}

/** Tokens for direct API calls in tests (same magic-link flow, over HTTP). */
export async function apiToken(request: APIRequestContext, email: string): Promise<string> {
  const link = await request.post(`${API}/v1/auth/magic-link`, { data: { email } });
  expect(link.ok()).toBeTruthy();
  const { devToken } = await link.json();
  const res = await request.post(`${API}/v1/auth/magic-link/verify`, { data: { token: devToken } });
  expect(res.ok()).toBeTruthy();
  return (await res.json()).accessToken;
}

export function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export const uniqueEmail = (tag: string) => `e2e-${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@piemers.lv`;
