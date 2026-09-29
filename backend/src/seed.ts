import { createDb } from './db/client';
import { runMigrations } from './db/migrate';
import { localNow } from './lib/time';
import { CARE_EMAIL, HISTORY_DAYS, ILZE_EMAIL, SEED_TZ, seedIlze, seedMarta } from './seed-data';

/** `npm run seed`: (re)creates the sample users Ilze (28 days of history) and Marta (care mode). */
async function main() {
  const { db, pool } = createDb(process.env.DATABASE_URL ?? 'postgres://balanss:balanss@localhost:5432/balanss');
  try {
    await runMigrations(db);
    const today = localNow(SEED_TZ).date;
    const id = await seedIlze(db, today);
    console.log(`seeded ${ILZE_EMAIL} (${id}) with ${HISTORY_DAYS} days of history + today (${today})`);
    const care = await seedMarta(db, today);
    console.log(`seeded ${CARE_EMAIL} (${care}) — care mode sample (low intake on the last 7 days)`);
  } finally {
    await pool.end();
  }
}

main().catch((err: unknown) => {
  console.error('seed failed', err);
  process.exitCode = 1;
});
