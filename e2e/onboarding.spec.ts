import { expect, test } from '@playwright/test';

import { uniqueEmail } from './helpers';

test('new user completes onboarding with the personality test', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Visa tava diena — vienā skatā')).toBeVisible();
  await page.getByTestId('welcome-next').click();
  await page.getByTestId('welcome-next').click();
  await page.getByTestId('welcome-start').click();

  await page.getByTestId('email-open').click();
  await page.getByTestId('email-input').fill(uniqueEmail('onb'));
  await page.getByTestId('email-send').click();
  await expect(page.getByText('Pārbaudi e-pastu')).toBeVisible();
  await page.getByTestId('dev-open-link').click();

  // 2/7 basics
  await expect(page.getByText('Pastāsti par sevi')).toBeVisible();
  await page.getByTestId('name-input').fill('Anna');
  await page.getByRole('radio', { name: 'Sieviete' }).click();
  for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Vecums: vairāk' }).click();
  await page.getByTestId('basics-next').click();

  // 3/7 devices (web has no health store)
  await expect(page.getByText('Pievieno savu pulksteni')).toBeVisible();
  await page.getByTestId('devices-later').click();

  // 4/7 goals: targets are computed from the basics
  await expect(page.getByText('Ko vēlies sasniegt?')).toBeVisible();
  await page.getByRole('checkbox', { name: /Sasniegt vēlamo svaru/ }).click();
  await expect(page.getByTestId('target-kcal')).toContainText('kcal');
  await expect(page.getByText(/nevis medicīnisks padoms/)).toBeVisible();
  await page.getByTestId('goals-next').click();

  // 5/7 intro → 6/7 test (20 statements) → 7/7 result
  await expect(page.getByText('Mērķi ir vieglāk sasniegt, ja zini, kāds esi')).toBeVisible();
  await page.getByTestId('start-test').click();
  const answers = ['Pilnīgi piekrītu', 'Drīzāk piekrītu', 'Neitrāli', 'Drīzāk nepiekrītu'];
  for (let i = 0; i < 20; i++) {
    await expect(page.getByText(`${i + 1} no 20`)).toBeVisible();
    await page.getByRole('radio', { name: answers[i % answers.length] }).click();
    if (i < 19) await page.getByTestId('test-next').click();
  }
  await page.getByTestId('test-finish').click();
  await expect(page.getByTestId('style-name')).not.toBeEmpty();
  await expect(page.getByText('Šis nav klīnisks vai diagnostisks tests.', { exact: false })).toBeVisible();
  await page.getByTestId('start-app').click();

  // Home with the user's name and a tone-adapted tip
  await expect(page.getByTestId('home')).toBeVisible();
  await expect(page.getByRole('heading', { name: /Anna/ })).toBeVisible();
  await expect(page.getByTestId('tip-card')).toBeVisible();

  // Onboarding is not shown again after reload
  await page.reload();
  await expect(page.getByTestId('home')).toBeVisible();
});

test('user can skip the personality test and gets a neutral tone', async ({ page }) => {
  await page.goto('/login');
  await page.getByTestId('email-open').click();
  await page.getByTestId('email-input').fill(uniqueEmail('skip'));
  await page.getByTestId('email-send').click();
  await page.getByTestId('dev-open-link').click();
  await page.getByTestId('name-input').fill('Jānis');
  await page.getByTestId('basics-next').click();
  await page.getByTestId('devices-later').click();
  await page.getByTestId('goals-next').click();
  await page.getByTestId('skip-test').click();
  await expect(page.getByTestId('home')).toBeVisible();
  await page.getByRole('button', { name: 'Mans profils' }).click();
  await expect(page.getByText('Profila nav — ieteikumi ir neitrālā tonī.', { exact: false })).toBeVisible();
});
