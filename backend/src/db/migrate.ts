import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { migrate } from 'drizzle-orm/node-postgres/migrator';

import { createDb, type Db } from './client';

export function migrationsDir(): string {
  return process.env.MIGRATIONS_DIR ?? path.resolve(process.cwd(), 'drizzle');
}

export async function runMigrations(db: Db): Promise<void> {
  await migrate(db, { migrationsFolder: migrationsDir() });
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  const { db, pool } = createDb(process.env.DATABASE_URL ?? 'postgres://balanss:balanss@localhost:5432/balanss');
  runMigrations(db)
    .then(() => console.log('migrations applied'))
    .catch((err: unknown) => {
      console.error('migration failed', err);
      process.exitCode = 1;
    })
    .finally(() => pool.end());
}
