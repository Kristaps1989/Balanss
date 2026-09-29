import path from 'node:path';

import { expect, test } from '@playwright/test';

import { API, apiToken, signIn, uniqueEmail } from './helpers';

const PHOTO = path.join(__dirname, 'fixtures', 'meal.jpg');

test('free plan allows 3 photo analyses a day, Pro removes the limit', async ({ page, request }) => {
  const email = uniqueEmail('quota');
  const token = await apiToken(request, email);
  const auth = { Authorization: `Bearer ${token}` };
  await request.put(`${API}/v1/me/profile`, { headers: auth, data: { firstName: 'Kārlis' } });
  await request.post(`${API}/v1/me/onboarding/complete`, { headers: auth });

  await signIn(page, email);
  await expect(page.getByTestId('home')).toBeVisible();

  const analyse = async () => {
    await page.goto('/nutrition/camera');
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByTestId('gallery').click()]);
    await chooser.setFiles(PHOTO);
    await expect(page.getByTestId('analyzing')).toBeVisible();
  };

  for (let i = 0; i < 3; i++) {
    await analyse();
    await expect(page.getByTestId('see-result')).toBeVisible({ timeout: 30_000 });
  }
  await page.goto('/nutrition/camera');
  await expect(page.getByTestId('quota-label')).toContainText('atlikušas 0 no 3');
  await expect(page.getByText('Pro — foto bez limita')).toBeVisible();

  // RevenueCat webhook upgrades the account
  const me = await (await request.get(`${API}/v1/me`, { headers: auth })).json();
  const hook = await request.post(`${API}/v1/billing/webhook`, {
    headers: { Authorization: 'Bearer e2e-webhook' },
    data: { event: { type: 'INITIAL_PURCHASE', app_user_id: me.id, product_id: 'pro_year', expiration_at_ms: Date.now() + 365 * 86400000 } },
  });
  expect(hook.ok()).toBeTruthy();

  await page.reload();
  await expect(page.getByTestId('quota-label')).toContainText('Pro');
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByTestId('gallery').click()]);
  await chooser.setFiles(PHOTO);
  await expect(page.getByTestId('see-result')).toBeVisible({ timeout: 30_000 });
});
