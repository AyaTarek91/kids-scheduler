#!/usr/bin/env node
// One-time migration: copy every row from the local scheduler.db (SQLite) into
// the Railway Postgres database named by DATABASE_URL.
//
//   DATABASE_URL=<railway public url> npm run migrate
//
// Safe to run more than once only if Postgres is empty — it preserves the
// original ids, so re-running against a populated DB will hit primary-key
// conflicts. Wipe the Postgres tables first if you need a clean re-import.
require('dotenv').config();
const path = require('path');
const Database = require('better-sqlite3');
const db = require('./../db');

async function main() {
  const sqlitePath = path.join(__dirname, '..', 'scheduler.db');
  const sqlite = new Database(sqlitePath, { readonly: true, fileMustExist: true });

  const schedule = sqlite.prepare('SELECT * FROM schedule ORDER BY id').all();
  const oneoffs  = sqlite.prepare('SELECT * FROM one_off_items ORDER BY id').all();

  // Ensure the Postgres schema exists before inserting.
  await db.ready;

  for (const r of schedule) {
    await db.query(
      'INSERT INTO schedule (id, child_name, activity, day_of_week, start_time, end_time, notes) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [r.id, r.child_name, r.activity, r.day_of_week, r.start_time, r.end_time, r.notes || '']
    );
  }

  for (const r of oneoffs) {
    await db.query(
      'INSERT INTO one_off_items (id, title, child_name, date, time, notes) VALUES ($1,$2,$3,$4,$5,$6)',
      [r.id, r.title, r.child_name || '', r.date, r.time, r.notes || '']
    );
  }

  // The explicit ids above bypass the SERIAL sequences, so fast-forward them or
  // the next INSERT would collide with an existing id.
  await db.query(`SELECT setval(pg_get_serial_sequence('schedule','id'), GREATEST((SELECT COALESCE(MAX(id),0) FROM schedule), 1))`);
  await db.query(`SELECT setval(pg_get_serial_sequence('one_off_items','id'), GREATEST((SELECT COALESCE(MAX(id),0) FROM one_off_items), 1))`);

  console.log(`Migrated ${schedule.length} schedule row(s) and ${oneoffs.length} one-off row(s).`);

  sqlite.close();
  await db.pool.end();
}

main().catch(err => {
  console.error('Migration failed:', err.message);
  db.pool.end().finally(() => process.exit(1));
});
