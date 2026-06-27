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

const sleep = ms => new Promise(r => setTimeout(r, ms));

// Railway's private network (*.railway.internal) can take a few seconds to become
// resolvable after the container starts, so the very first connection may fail with
// ENOTFOUND. Retry the schema/connect with backoff instead of crashing on boot.
async function init(attempt = 1) {
  const MAX_ATTEMPTS = 10;
  try {
    await pool.query(schema);
    if (attempt > 1) console.log(`[db] connected on attempt ${attempt}`);
  } catch (err) {
    if (attempt >= MAX_ATTEMPTS) {
      console.error(`[db] could not connect after ${MAX_ATTEMPTS} attempts: ${err.message}`);
      throw err;
    }
    const delay = Math.min(1000 * attempt, 5000);
    console.warn(`[db] connect attempt ${attempt} failed (${err.code || err.message}); retrying in ${delay}ms`);
    await sleep(delay);
    return init(attempt + 1);
  }
}

// Every query waits on this so callers never race the first connection — no entry
// point has to remember to await it explicitly.
const ready = init();
// Keep a transient boot failure from crashing the process as an unhandled rejection
// before any query attaches its own handler; real failures still surface via query().
ready.catch(() => {});

async function query(text, params) {
  await ready;
  return pool.query(text, params);
}

module.exports = { pool, query, ready };
