import { expect, test, type APIRequestContext } from '@playwright/test';

import { API, apiToken, signIn, today, uniqueEmail } from './helpers';

test.describe.configure({ mode: 'serial' });

async function setPlan(request: APIRequestContext, email: string, type: 'INITIAL_PURCHASE' | 'EXPIRATION') {
  const token = await apiToken(request, email);
  const me = await (await request.get(`${API}/v1/me`, { headers: { Authorization: `Bearer ${token}` } })).json();
  const res = await request.post(`${API}/v1/billing/webhook`, {
    headers: { Authorization: 'Bearer e2e-webhook' },
    data: { event: { type, app_user_id: me.id, product_id: 'pro_year', expiration_at_ms: Date.now() + (type === 'EXPIRATION' ? -1000 : 86400000) } },
  });
  expect(res.ok()).toBeTruthy();
  return token;
}

test('Pro: weekly AI summary is built from the user’s own patterns', async ({ page, request }) => {
  await setPlan(request, 'ilze@piemers.lv', 'INITIAL_PURCHASE');
  try {
    await signIn(page, 'ilze@piemers.lv');
    await expect(page.getByTestId('summary-headline')).toHaveText('Nedēļa ar stabilu ritmu');
    await page.getByRole('button', { name: 'Nedēļas kopsavilkums' }).click();
    const s = page.getByTestId('summary');
    await expect(s.getByText('Ko pamanīju datos')).toBeVisible();
    await expect(s.getByText('Ūdens mērķis sasniegts 5 no 7 dienām.').first()).toBeVisible();
    await expect(s.getByText(/Pēc 3 naktīm, kad miegs bija īsāks par 7 h/).first()).toBeVisible();
    await expect(s.getByText(/olbaltumvielas bija zem 85 % no mērķa/).first()).toBeVisible();
    await expect(s.getByText('Viens mazs solis nākamnedēļ')).toBeVisible();
    await expect(s.getByText(/nevis medicīnisks padoms/)).toBeVisible();
  } finally {
    await setPlan(request, 'ilze@piemers.lv', 'EXPIRATION');
  }
});

test('Pro: recipes respect a vegan diet and can be logged as a meal', async ({ page, request }) => {
  const token = await setPlan(request, 'ilze@piemers.lv', 'INITIAL_PURCHASE');
  const auth = { Authorization: `Bearer ${token}` };
  const mealIds = async () =>
    ((await (await request.get(`${API}/v1/days/${today()}`, { headers: auth })).json()).meals as { id: string }[]).map((m) => m.id);
  const before = new Set(await mealIds());
  try {
    await signIn(page, 'ilze@piemers.lv');
    await page.getByRole('button', { name: 'Mans profils' }).click();
    await page.getByRole('button', { name: 'Mainīt' }).first().click();
    await page.getByRole('radio', { name: /Vegāns/ }).click();
    await expect(page.getByRole('radio', { name: /Vegāns/ })).toHaveAttribute('aria-checked', 'true');

    await page.goto('/nutrition/recipes');
    const list = page.getByTestId('recipes');
    await expect(list).toBeVisible();
    await expect(list.getByText(/vegāns/)).toBeVisible();
    const cards = list.getByRole('button', { name: /min/ });
    const n = await cards.count();
    expect(n).toBeGreaterThan(0);
    for (let i = 0; i < n; i++) await cards.nth(i).click();
    const text = (await list.innerText()).toLowerCase();
    for (const banned of ['vista', 'gaļa', 'cūkgaļ', 'tītar', 'lasis', 'zivs', 'biezpien', 'jogurt', 'siers', 'piens', 'olas', 'medus']) {
      expect(text, `vegan recipes must not contain "${banned}"`).not.toContain(banned);
    }
    const title = (await list.getByRole('button', { name: /min/ }).first().locator('div').first().innerText()).split('\n')[0];
    await list.getByRole('button', { name: 'Pievienot kā maltīti' }).first().click();
    await expect(page.getByTestId('food-log')).toBeVisible();
    await expect(page.getByTestId('food-log').getByText(title).first()).toBeVisible();
  } finally {
    // Leave the seeded day as it was for the other specs
    for (const id of await mealIds()) if (!before.has(id)) await request.delete(`${API}/v1/meals/${id}`, { headers: auth });
    await request.put(`${API}/v1/me/preferences`, { headers: auth, data: { diet: 'any', avoid: [] } });
    await setPlan(request, 'ilze@piemers.lv', 'EXPIRATION');
  }
});

test('free plan sees Pro teasers, not the AI summary', async ({ page }) => {
  await signIn(page, 'ilze@piemers.lv');
  await expect(page.getByRole('button', { name: 'Nedēļas AI kopsavilkums, Pro' })).toBeVisible();
  await page.goto('/summary');
  await expect(page.getByText('Pieejams ar Balanss Pro.')).toBeVisible();
});

test('care mode: no deficit framing, gentle tip and support information', async ({ page }) => {
  await signIn(page, 'care@piemers.lv');
  const home = page.getByTestId('home');
  await expect(page.getByTestId('care-card')).toBeVisible();
  await expect(page.getByTestId('care-card')).toContainText('116 123');
  await expect(home.getByText('Šodien apēsts')).toBeVisible();
  await expect(home.getByText(/^Vēl \d/)).toHaveCount(0);
  await expect(page.getByTestId('tip-card')).toContainText('regulāras maltītes');
  const tip = (await page.getByTestId('tip-card').innerText()).toLowerCase();
  for (const bad of [/mazāk/, /deficīt/, /\bsvar(s|u|a|am)\b/, /kcal/]) expect(tip).not.toMatch(bad);
});

test('reporting a tip hides it and shows a different one', async ({ page }) => {
  await signIn(page, 'ilze@piemers.lv');
  const card = page.getByTestId('tip-card');
  await expect(card).toBeVisible();
  const before = await card.innerText();
  await page.getByTestId('tip-report').click();
  await page.getByRole('button', { name: /Man neder/ }).click();
  await expect.poll(async () => (await card.innerText()).split('\n').slice(0, 2).join(' ')).not.toBe(before.split('\n').slice(0, 2).join(' '));
});

test('AI personalization can be switched off and on', async ({ page }) => {
  await signIn(page, 'ilze@piemers.lv');
  await page.getByRole('button', { name: 'Mans profils' }).click();
  const toggle = page.getByTestId('me-ai-toggle');
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  await toggle.click();
  await page.reload();
  await expect(page.getByTestId('me-ai-toggle')).toHaveAttribute('aria-checked', 'false');
  await page.getByRole('button', { name: /Kā darbojas AI/ }).click();
  await expect(page.getByTestId('ai-info').getByText('Ko AI nesaņem')).toBeVisible();
  await page.getByTestId('ai-toggle').click();
  await expect(page.getByTestId('ai-toggle')).toHaveAttribute('aria-checked', 'true');
});

test('goals never go below the safety floor', async ({ page }) => {
  await signIn(page, uniqueEmail('floor'));
  await page.getByTestId('name-input').fill('Rūta');
  await page.getByRole('radio', { name: 'Sieviete' }).click();
  await page.getByTestId('basics-next').click();
  await page.getByTestId('devices-later').click();
  const minus = page.getByRole('button', { name: 'Enerģija dienā: mazāk' });
  for (let i = 0; i < 25; i++) await minus.click();
  await expect(page.getByTestId('target-kcal')).toHaveText('1 200 kcal');
  await expect(page.getByText(/nenosakām/)).toBeVisible();
  // Weight goal cannot go below a healthy weight for the height (170 cm → 54 kg)
  await page.getByRole('checkbox', { name: /Sasniegt vēlamo svaru/ }).click();
  const goalMinus = page.getByRole('button', { name: 'Vēlamais svars: mazāk' });
  for (let i = 0; i < 30; i++) await goalMinus.click();
  await expect(page.getByText('54 kg', { exact: true })).toBeVisible();
  await expect(page.getByText(/zem veselīga svara diapazona/)).toBeVisible();
});
