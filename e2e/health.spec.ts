import { expect, test } from '@playwright/test';

import { API, apiToken, signIn, today, uniqueEmail } from './helpers';

test('movement and sleep screens show seeded device data', async ({ page }) => {
  await signIn(page, 'ilze@piemers.lv');
  await page.getByRole('tab', { name: 'Kustība' }).click();
  const mv = page.getByTestId('movement');
  await expect(mv.getByText('6 430')).toBeVisible();
  await expect(mv.getByText('Nūjošana')).toBeVisible();
  await expect(mv.getByText('Pulsa zonas')).toBeVisible();
  await expect(mv.getByText('61', { exact: true })).toBeVisible();

  await page.getByRole('tab', { name: 'Miegs' }).click();
  const sl = page.getByTestId('sleep');
  await expect(sl.getByText('6 h 40 min')).toBeVisible();
  await expect(page.getByTestId('sleep-window')).toHaveText('23:00–23:30');
  await expect(sl.getByText('Hei, miega logs tuvojas')).toBeVisible();
  // Lead time changes the wind-down timeline and persists
  await page.getByRole('radio', { name: '30 min pirms' }).click();
  await expect(sl.getByText('22:30', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('radio', { name: '30 min pirms' })).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('radio', { name: '45 min pirms' }).click();
});

test('synced Health Connect data appears for a new user', async ({ page, request }) => {
  const email = uniqueEmail('sync');
  const token = await apiToken(request, email);
  const auth = { Authorization: `Bearer ${token}` };
  await request.put(`${API}/v1/me/profile`, { headers: auth, data: { firstName: 'Līga' } });
  await request.post(`${API}/v1/me/onboarding/complete`, { headers: auth });
  const d = today();
  const sync = await request.post(`${API}/v1/health/sync`, {
    headers: auth,
    data: {
      source: 'health_connect',
      devices: ['Garmin'],
      days: [{ date: d, steps: 9120, activeKcal: 420, restingHr: 58, hrvMs: 51 }],
      nights: [{ date: d, bedtime: '23:10', wakeTime: '06:55', totalMin: 450, deepMin: 80, remMin: 95, lightMin: 275, awakeMin: 15 }],
      workouts: [],
    },
  });
  expect(sync.ok()).toBeTruthy();

  await signIn(page, email);
  const home = page.getByTestId('home');
  await expect(home.getByText('9 120')).toBeVisible();
  await expect(home.getByText('7 h 30 min')).toBeVisible();
});

test('manual activity and weight are saved', async ({ page }) => {
  await signIn(page, 'ilze@piemers.lv');
  await page.getByRole('button', { name: 'Pievienot', exact: true }).click();
  await page.getByRole('button', { name: /Aktivitāte/ }).click();
  await page.getByRole('radio', { name: 'Peldēšana' }).click();
  await page.getByRole('button', { name: 'Saglabāt' }).click();
  await page.getByRole('tab', { name: 'Kustība' }).click();
  await expect(page.getByTestId('movement').getByText('Peldēšana')).toBeVisible();

  await page.getByRole('button', { name: 'Pievienot', exact: true }).click();
  await page.getByRole('button', { name: /Svars/ }).click();
  await page.getByRole('button', { name: 'Svars: mazāk' }).click();
  await page.getByRole('button', { name: 'Saglabāt' }).click();
  await page.getByRole('button', { name: 'Pievienot', exact: true }).click();
  await expect(page.getByText('Pēdējais: 70,9 kg')).toBeVisible();
});
