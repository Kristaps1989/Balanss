import { expect, test } from '@playwright/test';

import { API, apiToken, signIn, today } from './helpers';

test.describe.configure({ mode: 'serial' });

/**
 * Milestone 10: tips that only use what is at home, and free-time ideas
 * (AI_PROVIDER=fake: fixed listings relative to "now", including ones that already
 * started, start in 10 minutes, or carry a link the search never returned).
 */

test('pantry: "Kas ir mājās?" makes the food tip use only what is at home', async ({ page, request }) => {
  await signIn(page, 'ilze@piemers.lv');
  const card = page.getByTestId('tip-card');
  await expect(card).toBeVisible();

  // Reach a food tip (the chip shows only on protein / fibre / meals tips).
  for (let i = 0; i < 6 && !(await page.getByTestId('tip-pantry').isVisible()); i++) {
    await card.getByRole('button', { name: 'Cits ieteikums' }).click();
    await expect(card.getByRole('button', { name: 'Cits ieteikums' })).toBeEnabled();
  }
  await page.getByTestId('tip-pantry').click();

  await expect(page.getByRole('heading', { name: 'Kas ir mājās?' })).toBeVisible();
  await page.getByTestId('pantry-input').fill('Olas, auzu pārslas, kafija');
  await page.getByTestId('pantry-add').click();
  const items = page.getByTestId('pantry-items');
  await expect(items.getByText('olas', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Noņemt: kafija' }).click();
  await expect(items.getByText('kafija')).toHaveCount(0);
  await page.getByTestId('pantry-save').click();

  // Back on Šodiena: the new tip is built from the pantry, not from a shopping list.
  await expect(card).toContainText(/mājās/);
  await expect(card).toContainText(/olas|auzu pārslas/);
  await expect(card).not.toContainText(/biezpiens|jogurts|lēcu/);

  // Stored for the server (fresh for 3 days); the photo is never stored, only names.
  const token = await apiToken(request, 'ilze@piemers.lv');
  const pantry = await (await request.get(`${API}/v1/pantry`, { headers: { Authorization: `Bearer ${token}` } })).json();
  expect(pantry).toMatchObject({ items: ['olas', 'auzu pārslas'], fresh: true });
  // Not counted as "Cits ieteikums": the replaced tip is gone, no dismissal recorded.
  const tip = await (await request.get(`${API}/v1/tips/today?date=${today()}`, { headers: { Authorization: `Bearer ${token}` } })).json();
  expect(tip.body).toMatch(/olas|auzu pārslas/);
});

test('free time: city once, then only films and events that are still ahead, with real links', async ({ page }) => {
  await signIn(page, 'ilze@piemers.lv');
  await page.getByTestId('leisure-card').click();
  await expect(page.getByRole('heading', { name: 'Brīvais laiks' })).toBeVisible();

  // City is chosen by hand (no GPS) and remembered.
  await page.getByRole('radio', { name: 'Rīga' }).click();
  await expect(page.getByText('Pilsēta:')).toBeVisible();

  // Film in a cinema today.
  await page.getByRole('radio', { name: 'Komēdija' }).click();
  await expect(page.getByRole('radio', { name: 'Kinoteātrī' })).toHaveAttribute('aria-checked', 'true');
  await page.getByTestId('leisure-search').click();
  const results = page.getByTestId('leisure-results');
  await expect(results.getByTestId('leisure-item')).toHaveCount(1);
  await expect(results).toContainText('Vakara seanss: Komēdija');
  await expect(results).toContainText(/Šodien \d\d:\d\d/);
  await expect(results).not.toContainText('Jau sākusies filma');
  await expect(results).not.toContainText('Pēc 10 minūtēm');
  await expect(results).not.toContainText('Izdomāta saite');
  await expect(results.getByRole('link', { name: 'Atvērt saiti' })).toBeVisible();

  // Go3: only go3.lv links.
  await page.getByRole('radio', { name: 'Go3' }).click();
  await page.getByTestId('leisure-search').click();
  await expect(results.getByTestId('leisure-item')).toHaveCount(2);
  await expect(results.getByRole('link', { name: 'Atvērt Go3' })).toHaveCount(2);
  await expect(results).not.toContainText('Nav no Go3');

  // Book: curated, real titles, no invented links or times.
  await page.getByRole('radio', { name: 'Grāmata' }).click();
  await page.getByRole('radio', { name: 'Latviešu autori' }).click();
  await page.getByTestId('leisure-search').click();
  await expect(results).toContainText('Mātes piens');
  await expect(results).toContainText('Nora Ikstena');
  await expect(results.getByRole('link')).toHaveCount(0);

  // Event today: the one already under way and the one next week are not shown.
  await page.getByRole('radio', { name: 'Pasākums' }).click();
  await page.getByRole('radio', { name: 'Koncerts' }).click();
  await expect(page.getByRole('radio', { name: 'Šodien' })).toHaveAttribute('aria-checked', 'true');
  await page.getByTestId('leisure-search').click();
  await expect(results.getByTestId('leisure-item')).toHaveCount(1);
  await expect(results).toContainText('Koncerts Rīga');
  await expect(results).not.toContainText('Jau notiek');
  await expect(results).not.toContainText('Pēc nedēļas');
  await expect(results).toContainText('pārbaudi saitē pirms došanās');
});
