import { expect, test, type Page } from '@playwright/test';

import { signIn } from './helpers';

/**
 * Dark mode on every screen. Dark is the default; "Izskats" in Es switches to
 * light or to the phone's setting. Each screen is checked for colours that
 * belong only to the other theme (a screen that kept a hard-coded colour shows
 * up here) and a screenshot of every screen in both themes is attached.
 */

test.describe.configure({ mode: 'serial' });

const DARK_BG = 'rgb(18, 21, 19)'; // #121513
const LIGHT_BG = 'rgb(246, 242, 234)'; // #F6F2EA cream
/** Surfaces that may only appear in one theme. */
const LIGHT_ONLY = ['rgb(246, 242, 234)', 'rgb(255, 255, 255)', 'rgb(247, 243, 238)'];
const DARK_ONLY = ['rgb(18, 21, 19)', 'rgb(28, 32, 29)'];

const SCREENS = [
  '/',
  '/nutrition',
  '/nutrition/trends',
  '/nutrition/recipes',
  '/movement',
  '/sleep',
  '/add',
  '/food-add',
  '/weight',
  '/activity',
  '/pantry',
  '/leisure',
  '/summary',
  '/me',
  '/me/tone',
  '/me/pro',
  '/me/preferences',
  '/me/goals',
  '/me/basics',
  '/me/devices',
  '/me/personality',
  '/me/ai',
];

/** Background colours of every visible element (images and the camera preview excluded). */
async function surfaces(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out = new Set<string>();
    for (const el of Array.from(document.querySelectorAll<HTMLElement>('body *'))) {
      if (el.tagName === 'IMG' || el.tagName === 'VIDEO') continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const s = getComputedStyle(el);
      if (s.visibility === 'hidden' || s.opacity === '0') continue;
      if (s.backgroundColor && s.backgroundColor !== 'rgba(0, 0, 0, 0)') out.add(s.backgroundColor);
    }
    return [...out];
  });
}

async function visit(page: Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(400);
}

async function checkAll(page: Page, theme: 'dark' | 'light', forbidden: string[]) {
  for (const path of SCREENS) {
    await visit(page, path);
    const bad = (await surfaces(page)).filter((c) => forbidden.includes(c));
    await test.info().attach(`${theme}${path.replace(/\//g, '_') || '_home'}.png`, { body: await page.screenshot(), contentType: 'image/png' });
    expect(bad, `${path} in ${theme} uses a ${theme === 'dark' ? 'light' : 'dark'}-theme surface`).toEqual([]);
  }
}

const bodyBg = (page: Page) => page.getByTestId('home').evaluate((el) => getComputedStyle(el).backgroundColor);

test('signed out: welcome and login are dark by default', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('welcome')).toBeVisible();
  expect(await page.getByTestId('welcome').evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(DARK_BG);
  expect((await surfaces(page)).filter((c) => LIGHT_ONLY.includes(c))).toEqual([]);
  await test.info().attach('dark_welcome.png', { body: await page.screenshot(), contentType: 'image/png' });
  await page.getByTestId('welcome-start').click();
  await expect(page.getByTestId('email-open')).toBeVisible();
  expect((await surfaces(page)).filter((c) => LIGHT_ONLY.includes(c))).toEqual([]);
  await test.info().attach('dark_login.png', { body: await page.screenshot(), contentType: 'image/png' });
});

test('every screen is dark by default', async ({ page }) => {
  await signIn(page, 'ilze@piemers.lv');
  await expect(page.getByTestId('home')).toBeVisible();
  expect(await bodyBg(page)).toBe(DARK_BG);
  await checkAll(page, 'dark', LIGHT_ONLY);
});

test('Izskats → Gaišs switches every screen, stays on Es and survives a reload', async ({ page }) => {
  await signIn(page, 'ilze@piemers.lv');
  await page.getByRole('button', { name: 'Mans profils' }).click();
  const picker = page.getByTestId('theme-picker');
  await expect(picker.getByRole('radio', { name: 'Tumšs' })).toHaveAttribute('aria-checked', 'true');
  await picker.getByRole('radio', { name: 'Gaišs' }).click();

  // The tree remounts with the new palette and comes back to Es.
  await expect(page.getByTestId('me')).toBeVisible();
  await expect(page.getByTestId('theme-picker').getByRole('radio', { name: 'Gaišs' })).toHaveAttribute('aria-checked', 'true');
  expect(await page.getByTestId('me').evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(LIGHT_BG);

  await page.reload();
  await expect(page.getByTestId('me')).toBeVisible();
  expect(await page.getByTestId('me').evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(LIGHT_BG);

  await checkAll(page, 'light', DARK_ONLY);

  // Back to the default for the other specs.
  await visit(page, '/me');
  await page.getByTestId('theme-picker').getByRole('radio', { name: 'Tumšs' }).click();
  await expect(page.getByTestId('theme-picker').getByRole('radio', { name: 'Tumšs' })).toHaveAttribute('aria-checked', 'true');
});

for (const [scheme, bg] of [
  ['light', LIGHT_BG],
  ['dark', DARK_BG],
] as const) {
  test.describe(`phone set to ${scheme}`, () => {
    test.use({ colorScheme: scheme });
    test(`"Kā tālrunī" follows it (${scheme})`, async ({ page }) => {
      await page.addInitScript(() => localStorage.setItem('balanss.theme', 'system'));
      await signIn(page, 'ilze@piemers.lv');
      await expect(page.getByTestId('home')).toBeVisible();
      expect(await bodyBg(page)).toBe(bg);
    });
  });
}
