# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm start          # Start the Express web server (port 3000)
node cron.js       # Start the daily 7am email digest scheduler
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

**Two data layers, one shared db module.** `db.js` opens the SQLite file (`scheduler.db`) and creates the two tables on startup. Every other module imports `db.js` directly — there is no ORM or query builder.

**Tables:**
- `schedule` — recurring weekly items: `child_name, activity, day_of_week, start_time, end_time, notes`
- `one_off_items` — dated single events: `title, date (YYYY-MM-DD), time (HH:MM), notes`

**Request flow:** `server.js` → `routes/schedule.js` or `routes/oneoff.js` → `db.js`

Each route file owns its full CRUD plus a `/today` GET that filters by the current day/date. The frontend (`public/index.html`) is a single self-contained file — all JS is inline, no build step. It fetches `/api/schedule`, `/api/schedule/today`, `/api/one-off`, and `/api/one-off/today` directly.

**Cron/email (`cron.js`)** runs independently from the web server — start it as a separate process alongside `server.js`. It imports `db.js` directly (same SQLite file, same process-local in-memory state is fine because better-sqlite3 is synchronous). Email is sent via Resend SDK.

## Environment

Copy `.env.example` to `.env`. Required for email:
- `RESEND_API_KEY` — from resend.com
- `NOTIFY_EMAIL` — digest recipient
- `TZ` — IANA timezone for the 7am cron (e.g. `Africa/Cairo`, **not** `Egypt/Cairo`)

`dotenv` is loaded at the top of `server.js` and `cron.js`. The CLI (`cli.js`) does not need it.

## Key constraints

- `day_of_week` must be one of the exact strings: `Monday Tuesday Wednesday Thursday Friday Saturday Sunday` — enforced by a SQLite CHECK constraint.
- `date` fields are stored as `YYYY-MM-DD` text; `time` fields as `HH:MM` text. No Date objects in the DB layer.
- `better-sqlite3` is a native addon — if `node_modules` is deleted, run `npm install` then `npm approve-scripts better-sqlite3` before `npm rebuild better-sqlite3`.
- The Resend `from` address must be a verified domain in your Resend account, or use `onboarding@resend.dev` for testing (only delivers to the account owner's email).
