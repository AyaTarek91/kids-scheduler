# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm start          # Start the Express web server (port 3000) — also runs the daily 9am digest scheduler in-process
node cron.js --now # Send the digest immediately (for testing)
node cli.js --help # CLI entry point
```

### CLI usage
```bash
node cli.js today
node cli.js schedule list [--day <day>] [--child <name>]
node cli.js schedule add -c <child> -a <activity> -d <day> -s <HH:MM> -e <HH:MM>
node cli.js schedule edit <id> [--child ...] [--activity ...] ...
node cli.js schedule delete <id>
node cli.js event list [--date <YYYY-MM-DD>] [--upcoming]
node cli.js event add -t <title> -d <YYYY-MM-DD> -T <HH:MM>
node cli.js event edit <id> [...flags]
node cli.js event delete <id>
```

## Architecture

**Two data layers, one shared db module.** `db.js` connects to Postgres (`pg.Pool`, via `DATABASE_URL`) and creates the two tables on startup. Every other module imports `db.js` directly — there is no ORM or query builder.

`db.js` exports `{ pool, query, ready }`. Always call `db.query(text, params)` — it awaits the one-time schema creation (`ready`) before running, so callers never race the first connection. Queries are **async**: use `await db.query(...)`, read rows from `result.rows`, row counts from `result.rowCount`, and inserted ids via `RETURNING id` (`result.rows[0].id`). Placeholders are `$1, $2, …`, not `?`. SSL is auto-enabled unless the host is `*.railway.internal`.

**Tables** (`id SERIAL PRIMARY KEY`):
- `schedule` — recurring weekly items: `child_name, activity, day_of_week, start_time, end_time, notes`
- `one_off_items` — dated single events: `title, child_name, date (YYYY-MM-DD), time (HH:MM), notes`

**Request flow:** `server.js` → `routes/schedule.js` or `routes/oneoff.js` → `db.js`

Each route file owns its full CRUD plus a `/today` GET that filters by the current day/date. The frontend (`public/index.html`) is a single self-contained file — all JS is inline, no build step. It fetches `/api/schedule`, `/api/schedule/today`, `/api/one-off`, and `/api/one-off/today` directly.

**One-off events age off the board, but are never deleted.** `GET /api/one-off` only returns events whose `date` is within the last 7 days or in the future (`date >= today − 7d`, computed in local/TZ time); older rows stay in Postgres but stop appearing. Within that 7-day grace window, an event whose date+time has already passed renders **greyed-out** (struck-through, "PAST" pill, sorted below upcoming items) — see `renderOneOff` in `index.html`. So a past event lingers greyed for a week, then silently drops off the list. The `/today` board and all CRUD are unaffected.

**Cron/email (`cron.js`)** runs in the same process as the web server — `server.js` does `require('./cron')` at startup, so the 9am scheduler registers when you `npm start`. One process, one Railway service. `cron.js` imports `db.js` directly (same shared `pg.Pool` / Railway Postgres) and sends email via the Resend SDK. The `--now` branch keys off `process.argv`, so importing it from the server only registers the scheduler and doesn't fire a send; `node cron.js --now` still works standalone for testing.

## Environment

Copy `.env.example` to `.env`. Required for email:
- `RESEND_API_KEY` — from resend.com
- `NOTIFY_EMAIL` — digest recipient
- `TZ` — IANA timezone for the 9am cron (e.g. `Africa/Cairo`, **not** `Egypt/Cairo`)

`dotenv` is loaded at the top of `server.js`, `cron.js`, **and `cli.js`** — the CLI now needs `DATABASE_URL`.

### Migrating data from the old SQLite file
`better-sqlite3` is kept as a **devDependency** only for the one-time importer:
```bash
DATABASE_URL=<railway public url> npm run migrate   # scripts/migrate-sqlite-to-pg.js
```
It reads the local `scheduler.db` and copies all rows into Postgres, preserving ids. Run it once against an empty Postgres (re-running collides on primary keys).

## Key constraints

- `day_of_week` must be one of the exact strings: `Monday Tuesday Wednesday Thursday Friday Saturday Sunday` — enforced by a Postgres CHECK constraint (a violation rejects as a 500 via Express 5's async error forwarding).
- `date` fields are stored as `YYYY-MM-DD` text; `time` fields as `HH:MM` text. No Date objects in the DB layer.
- `pg` is pure JS (no native build). `better-sqlite3` remains only as a devDependency for the migration script and is not installed in Railway's production build.
- The Resend `from` address must be a verified domain in your Resend account, or use `onboarding@resend.dev` for testing (only delivers to the account owner's email).
