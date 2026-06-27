const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is not set — point it at your Railway Postgres instance');
}

// Railway's internal hostname (*.railway.internal) speaks plaintext on the private
// network; the public proxy URL requires SSL. Pick automatically so the same code
// works in prod (internal) and from a local machine (public URL).
const needsSsl = !/\.railway\.internal/.test(connectionString);

const pool = new Pool({
  connectionString,
  ssl: needsSsl ? { rejectUnauthorized: false } : false,
});

const schema = `
  CREATE TABLE IF NOT EXISTS schedule (
    id SERIAL PRIMARY KEY,
    child_name TEXT NOT NULL,
    activity TEXT NOT NULL,
    day_of_week TEXT NOT NULL CHECK (day_of_week IN
      ('Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday')),
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    notes TEXT DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS one_off_items (
    id SERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    child_name TEXT DEFAULT '',
    date TEXT NOT NULL,
    time TEXT NOT NULL,
    notes TEXT DEFAULT ''
  );

  -- Bring older Postgres databases up to date if they predate child_name.
  ALTER TABLE one_off_items ADD COLUMN IF NOT EXISTS child_name TEXT DEFAULT '';
`;

// Kick off schema creation once. Every query waits on this so callers never race
// the first connection — no entry point has to remember to await it explicitly.
const ready = pool.query(schema);

async function query(text, params) {
  await ready;
  return pool.query(text, params);
}

module.exports = { pool, query, ready };
