import { defineConfig } from 'tsup';

// Bundles the server (and the migrate/seed CLIs) with ../shared inlined, so the
// production image runs plain `node dist/server.js`. npm dependencies stay external.
export default defineConfig({
  entry: {
    server: 'src/server.ts',
    migrate: 'src/migrate.ts',
    seed: 'src/seed.ts',
  },
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  splitting: true,
});
