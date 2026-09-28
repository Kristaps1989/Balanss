import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // All test files share one Postgres database, so run them one at a time.
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 30_000,
    env: {
      NODE_ENV: 'test',
      TZ: 'UTC',
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? 'postgres://balanss:balanss@localhost:5432/balanss_test',
      LOG_LEVEL: 'silent',
    },
  },
});
