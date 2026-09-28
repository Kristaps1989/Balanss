import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests: the exported web build of the app against the real
 * backend (fake AI, console e-mail, dedicated database). Run with
 * `npm run e2e` (see scripts/e2e.sh), which builds and starts both.
 */
export default defineConfig({
  testDir: 'e2e',
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'e2e-report' }]],
  use: {
    baseURL: process.env.E2E_WEB_URL ?? 'http://localhost:8099',
    ...devices['Pixel 7'],
    locale: 'lv-LV',
    timezoneId: 'Europe/Riga',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
});
