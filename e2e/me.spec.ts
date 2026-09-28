import { expect, test } from '@playwright/test';

import { signIn, uniqueEmail } from './helpers';

test('settings persist: tone, reminders, goals', async ({ page }) => {
  await signIn(page, 'ilze@piemers.lv');
  await page.getByRole('button', { name: 'Mans profils' }).click();
  const me = page.getByTestId('me');
  await expect(me.getByText('Plānotāja ar maigu pieeju').first()).toBeVisible();

  // Neutral tone toggle
  await page.getByTestId('neutral-toggle').click();
  await expect(page.getByTestId('neutral-toggle')).toHaveAttribute('aria-checked', 'true');
  await page.reload();
  await expect(page.getByTestId('neutral-toggle')).toHaveAttribute('aria-checked', 'true');
  await page.getByTestId('neutral-toggle').click();

  // Reminders
  const move = page.getByTestId('reminder-move');
  const was = await move.getAttribute('aria-checked');
  await move.click();
  await page.reload();
  await expect(page.getByTestId('reminder-move')).not.toHaveAttribute('aria-checked', was ?? '');
  await page.getByTestId('reminder-move').click();

  // Tone picker
  await page.getByRole('button', { name: 'Tie paši dati, cits tonis' }).click();
  await page.getByRole('radio', { name: /Dažādība un jaunais/ }).click();
  await expect(page.getByRole('radio', { name: /Dažādība un jaunais/ })).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('radio', { name: /Pēc mana profila/ }).click();
});

test('export my data and delete the account', async ({ page, request }) => {
  const email = uniqueEmail('gdpr');
  await signIn(page, email);
  await page.getByTestId('name-input').fill('Pēteris');
  await page.getByTestId('basics-next').click();
  await page.getByTestId('devices-later').click();
  await page.getByTestId('goals-next').click();
  await page.getByTestId('skip-test').click();
  await page.getByRole('button', { name: 'Mans profils' }).click();

  // The export downloads a JSON file straight from the single-use link.
  const [res, download] = await Promise.all([
    page.waitForResponse((r) => r.url().endsWith('/v1/me/export') && r.request().method() === 'POST'),
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Eksportēt manus datus' }).click(),
  ]);
  const fs = await import('node:fs/promises');
  const content = await fs.readFile((await download.path())!, 'utf8');
  expect(content).toContain(email);
  // The link is single use
  const { downloadUrl } = await res.json();
  expect((await request.get(downloadUrl)).status()).toBe(410);

  await page.getByRole('button', { name: 'Dzēst visus datus un kontu' }).click();
  await page.getByRole('button', { name: 'Dzēst visu', exact: true }).click();
  await expect(page.getByTestId('welcome')).toBeVisible();

  // Signing in again with the same e-mail starts from scratch
  await signIn(page, email);
  await expect(page.getByText('Pastāsti par sevi')).toBeVisible();
});

test('logout returns to the welcome screen', async ({ page }) => {
  await signIn(page, 'ilze@piemers.lv');
  await page.getByRole('button', { name: 'Mans profils' }).click();
  await page.getByRole('button', { name: 'Iziet no konta' }).click();
  await expect(page.getByTestId('welcome')).toBeVisible();
  await page.reload();
  await expect(page.getByTestId('welcome')).toBeVisible();
});
