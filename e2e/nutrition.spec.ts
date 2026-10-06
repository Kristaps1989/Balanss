import path from 'node:path';

import { expect, test } from '@playwright/test';

import { signIn } from './helpers';

const PHOTO = path.join(__dirname, 'fixtures', 'meal.jpg');

test.describe.configure({ mode: 'serial' });

test('home shows the seeded sample day', async ({ page }) => {
  await signIn(page, 'ilze@piemers.lv');
  const home = page.getByTestId('home');
  await expect(home).toBeVisible();
  await expect(home.getByText('1 480', { exact: true })).toBeVisible();
  await expect(home.getByText('Vēl 270 kcal')).toBeVisible();
  await expect(home.getByText('68 / 110 g')).toBeVisible();
  await expect(page.getByTestId('water-total')).toContainText('1,2 l');
  await expect(home.getByText('6 430')).toBeVisible();
  await expect(home.getByText('6 h 40 min')).toBeVisible();
  await expect(home.getByText('Dati no Health Connect').first()).toBeVisible();

  // Water: one tap adds a glass, and it persists
  await page.getByTestId('water-add').click();
  await expect(page.getByTestId('water-total')).toContainText('1,45 l');
  await page.reload();
  await expect(page.getByTestId('water-total')).toContainText('1,45 l');

  // Tip actions
  await expect(page.getByTestId('tip-card')).toBeVisible();
  const before = await page.getByTestId('tip-card').innerText();
  await page.getByRole('button', { name: 'Cits ieteikums' }).click();
  await expect.poll(async () => page.getByTestId('tip-card').innerText()).not.toBe(before);
  await page.getByRole('button', { name: 'Labi, pamēģināšu' }).click();
  await expect(page.getByText('Pieņemts')).toBeVisible();
});

test('log a meal from a photo with portion changes', async ({ page }) => {
  await signIn(page, 'ilze@piemers.lv');
  await page.getByRole('tab', { name: 'Uzturs' }).click();
  await expect(page.getByTestId('log-kcal')).toContainText('1 480');

  await page.getByRole('button', { name: 'Foto' }).click();
  await expect(page.getByTestId('quota-label')).toContainText('no 3 analīzēm');
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByTestId('gallery').click()]);
  await chooser.setFiles(PHOTO);
  await expect(page.getByTestId('analyzing')).toBeVisible();
  await page.getByTestId('see-result').click({ timeout: 30_000 });

  await expect(page.getByTestId('result')).toBeVisible();
  await expect(page.getByText(/Atpazinu \d+ produkt/)).toBeVisible();
  const totalBefore = await page.getByTestId('result-total').innerText();
  // Clarify the uncertain sauce
  await page.getByRole('button', { name: 'Bez mērces' }).click();
  await expect(page.getByTestId('result-total')).not.toHaveText(totalBefore);
  // Portion slider: the range is fixed from the estimate (150 g → 0–300 g). Dragging to the end
  // again and again must stay at 300 g (the range used to grow with every drag: 180 g → millions).
  const slider = page.getByTestId('portion-slider').first();
  const box = (await slider.boundingBox())!;
  const y = box.y + box.height / 2;
  for (let i = 0; i < 3; i++) {
    await page.mouse.move(box.x + box.width * 0.5, y);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width - 1, y, { steps: 8 });
    await page.mouse.up();
  }
  await expect(page.getByText(/^300 g · /)).toBeVisible();
  await expect(page.getByTestId('result-total')).not.toContainText(/\d{2} \d{3} \d{3}/);
  // Fine control: + stays at the end of the range, − takes 10 g off.
  await page.getByRole('button', { name: 'Vairāk: Vistas krūtiņa, +10 g' }).click();
  await expect(page.getByText(/^300 g · /)).toBeVisible();
  await page.getByRole('button', { name: 'Mazāk: Vistas krūtiņa, −10 g' }).click();
  await expect(page.getByText(/^290 g · /)).toBeVisible();
  // Remove one item
  await page.getByRole('button', { name: /Noņemt: Salāti/ }).click();
  await page.getByTestId('save-meal').click();

  await expect(page.getByTestId('food-log')).toBeVisible();
  await expect(page.getByTestId('log-kcal')).not.toContainText('1 480 /');
});

test('add a meal by text and delete it again', async ({ page }) => {
  await signIn(page, 'ilze@piemers.lv');
  await page.getByRole('tab', { name: 'Uzturs' }).click();
  const kcalBefore = await page.getByTestId('log-kcal').innerText();
  await page.getByRole('button', { name: 'Citādi' }).click();
  await page.getByTestId('food-text').fill('2 olas un maize');
  await expect(page.getByText(/Olas/)).toBeVisible();
  await page.getByTestId('add-parsed').click();
  await expect(page.getByTestId('log-kcal')).not.toHaveText(kcalBefore);

  // Open the newest meal and delete it
  const card = page.getByRole('button', { name: /kcal$/ }).filter({ hasText: /olas, vārītas/i }).first();
  await card.click();
  const block = page.getByTestId('meal-block').filter({ hasText: 'Olas, vārītas' });
  await block.getByRole('button', { name: 'Dzēst maltīti' }).click();
  await page.getByRole('button', { name: 'Dzēst', exact: true }).click();
  await expect(page.getByTestId('log-kcal')).toHaveText(kcalBefore);
});

test('trends show the last 7 days', async ({ page }) => {
  await signIn(page, 'ilze@piemers.lv');
  await page.getByRole('tab', { name: 'Uzturs' }).click();
  await page.getByRole('link', { name: 'Tendences' }).click();
  await expect(page.getByTestId('trends')).toBeVisible();
  await expect(page.getByText('Pēdējās 7 dienas')).toBeVisible();
  await expect(page.getByText(/mērķis 1\s750/)).toBeVisible();
  await expect(page.getByText(/vidēji/).first()).toBeVisible();
});
