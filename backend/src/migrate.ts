import { createDb } from './db/client';
import { runMigrations } from './db/migrate';

/** `npm run migrate` (dev) / `node dist/migrate.js` (Railway pre-deploy). */
const { db, pool } = createDb(process.env.DATABASE_URL ?? 'postgres://balanss:balanss@localhost:5432/balanss');
runMigrations(db)
  .then(() => console.log('migrations applied'))
  .catch((err: unknown) => {
    console.error('migration failed', err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
