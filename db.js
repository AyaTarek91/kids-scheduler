const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'scheduler.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS schedule (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    child_name TEXT NOT NULL,
    activity TEXT NOT NULL,
    day_of_week TEXT NOT NULL CHECK(day_of_week IN ('Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday')),
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    notes TEXT DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS one_off_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    child_name TEXT DEFAULT '',
    date TEXT NOT NULL,
    time TEXT NOT NULL,
    notes TEXT DEFAULT ''
  );
`);

// Migration: add child_name to one_off_items if an older DB predates it
const ooCols = db.prepare(`PRAGMA table_info(one_off_items)`).all();
if (!ooCols.some(c => c.name === 'child_name')) {
  db.exec(`ALTER TABLE one_off_items ADD COLUMN child_name TEXT DEFAULT ''`);
}

module.exports = db;
