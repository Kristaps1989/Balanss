import { createDb } from './db/client';
import { runMigrations } from './db/migrate';
import { localNow } from './lib/time';
import { ILZE_EMAIL, SEED_TZ, seedIlze } from './seed-data';

/** `npm run seed`: (re)creates the sample user Ilze with 14 days of history ending today. */
async function main() {
  const { db, pool } = createDb(process.env.DATABASE_URL ?? 'postgres://balanss:balanss@localhost:5432/balanss');
  try {
    await runMigrations(db);
    const today = localNow(SEED_TZ).date;
    const id = await seedIlze(db, today);
    console.log(`seeded ${ILZE_EMAIL} (${id}) with 14 days ending ${today}`);
  } finally {
    await pool.end();
  }
}

main().catch((err: unknown) => {
  console.error('seed failed', err);
  process.exitCode = 1;
});
