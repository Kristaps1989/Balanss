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

test('export my data and delete the account', async ({ page }) => {
  const email = uniqueEmail('gdpr');
  await signIn(page, email);
  await page.getByTestId('name-input').fill('Pēteris');
  await page.getByTestId('basics-next').click();
  await page.getByTestId('devices-later').click();
  await page.getByTestId('goals-next').click();
  await page.getByTestId('skip-test').click();
  await page.getByRole('button', { name: 'Mans profils' }).click();

  const [popup] = await Promise.all([page.waitForEvent('popup'), page.getByRole('button', { name: 'Eksportēt manus datus' }).click()]);
  await popup.waitForLoadState();
  const body = await popup.evaluate(() => document.body.innerText);
  expect(body).toContain(email);
  await popup.close();

  await page.getByRole('button', { name: 'Dzēst visus datus un kontu' }).click();
  await page.getByRole('button', { name: 'Dzēst visu' }).click();
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
