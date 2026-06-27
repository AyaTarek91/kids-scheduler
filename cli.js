#!/usr/bin/env node
require('dotenv').config();
const { Command } = require('commander');
const db = require('./db');

const program = new Command();
program.name('scheduler').description('Kids scheduler CLI').version('1.0.0');

const DAYS = ['Saturday','Sunday','Monday','Tuesday','Wednesday','Thursday','Friday'];

// ===================== SCHEDULE =====================

const sched = program.command('schedule').alias('s').description('Manage recurring weekly schedule');

sched.command('list')
  .alias('ls')
  .description('List all recurring schedule items')
  .option('-d, --day <day>', 'Filter by day of week')
  .option('-c, --child <name>', 'Filter by child name')
  .action(async opts => {
    let query = 'SELECT * FROM schedule';
    const params = [];
    const where = [];
    if (opts.day) { params.push(opts.day); where.push(`day_of_week = $${params.length}`); }
    if (opts.child) { params.push(`%${opts.child}%`); where.push(`child_name ILIKE $${params.length}`); }
    if (where.length) query += ' WHERE ' + where.join(' AND ');
    query += ' ORDER BY day_of_week, start_time';
    const { rows } = await db.query(query, params);
    if (rows.length === 0) { console.log('No items found.'); return; }
    console.table(rows.map(r => ({
      ID: r.id, Child: r.child_name, Activity: r.activity,
      Day: r.day_of_week, Start: r.start_time, End: r.end_time, Notes: r.notes
    })));
  });

sched.command('add')
  .description('Add a recurring schedule item')
  .requiredOption('-c, --child <name>', 'Child name')
  .requiredOption('-a, --activity <activity>', 'Activity name')
  .requiredOption('-d, --day <day>', `Day of week (${DAYS.join('|')})`)
  .requiredOption('-s, --start <time>', 'Start time (HH:MM)')
  .requiredOption('-e, --end <time>', 'End time (HH:MM)')
  .option('-n, --notes <notes>', 'Optional notes', '')
  .action(async opts => {
    if (!DAYS.includes(opts.day)) {
      console.error(`Invalid day. Must be one of: ${DAYS.join(', ')}`); process.exit(1);
    }
    const { rows } = await db.query(
      'INSERT INTO schedule (child_name, activity, day_of_week, start_time, end_time, notes) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',
      [opts.child, opts.activity, opts.day, opts.start, opts.end, opts.notes]
    );
    console.log(`Added schedule item with ID ${rows[0].id}`);
  });

sched.command('edit <id>')
  .description('Edit a recurring schedule item')
  .option('-c, --child <name>', 'Child name')
  .option('-a, --activity <activity>', 'Activity name')
  .option('-d, --day <day>', 'Day of week')
  .option('-s, --start <time>', 'Start time (HH:MM)')
  .option('-e, --end <time>', 'End time (HH:MM)')
  .option('-n, --notes <notes>', 'Notes')
  .action(async (id, opts) => {
    const existing = (await db.query('SELECT * FROM schedule WHERE id = $1', [id])).rows[0];
    if (!existing) { console.error(`No schedule item with ID ${id}`); process.exit(1); }
    const updated = {
      child_name:  opts.child    || existing.child_name,
      activity:    opts.activity || existing.activity,
      day_of_week: opts.day      || existing.day_of_week,
      start_time:  opts.start    || existing.start_time,
      end_time:    opts.end      || existing.end_time,
      notes:       opts.notes !== undefined ? opts.notes : existing.notes
    };
    await db.query(
      'UPDATE schedule SET child_name=$1, activity=$2, day_of_week=$3, start_time=$4, end_time=$5, notes=$6 WHERE id=$7',
      [updated.child_name, updated.activity, updated.day_of_week, updated.start_time, updated.end_time, updated.notes, id]
    );
    console.log(`Updated schedule item ${id}`);
  });

sched.command('delete <id>')
  .alias('del')
  .description('Delete a recurring schedule item')
  .action(async id => {
    const r = await db.query('DELETE FROM schedule WHERE id = $1', [id]);
    if (r.rowCount === 0) { console.error(`No schedule item with ID ${id}`); process.exit(1); }
    console.log(`Deleted schedule item ${id}`);
  });

// ===================== ONE-OFF =====================

const oo = program.command('event').alias('e').description('Manage one-off events');

oo.command('list')
  .alias('ls')
  .description('List one-off events')
  .option('--date <date>', 'Filter by date (YYYY-MM-DD)')
  .option('-c, --child <name>', 'Filter by child name')
  .option('--upcoming', 'Show only upcoming events')
  .action(async opts => {
    let query = 'SELECT * FROM one_off_items';
    const params = [];
    const where = [];
    if (opts.date) { params.push(opts.date); where.push(`date = $${params.length}`); }
    if (opts.child) { params.push(`%${opts.child}%`); where.push(`child_name ILIKE $${params.length}`); }
    if (opts.upcoming) { params.push(new Date().toISOString().slice(0,10)); where.push(`date >= $${params.length}`); }
    if (where.length) query += ' WHERE ' + where.join(' AND ');
    query += ' ORDER BY date, time';
    const { rows } = await db.query(query, params);
    if (rows.length === 0) { console.log('No events found.'); return; }
    console.table(rows.map(r => ({
      ID: r.id, Title: r.title, Child: r.child_name, Date: r.date, Time: r.time, Notes: r.notes
    })));
  });

oo.command('add')
  .description('Add a one-off event')
  .requiredOption('-t, --title <title>', 'Event title')
  .requiredOption('-d, --date <date>', 'Date (YYYY-MM-DD)')
  .requiredOption('-T, --time <time>', 'Time (HH:MM)')
  .option('-c, --child <name>', 'Child name (optional)', '')
  .option('-n, --notes <notes>', 'Optional notes', '')
  .action(async opts => {
    const { rows } = await db.query(
      'INSERT INTO one_off_items (title, child_name, date, time, notes) VALUES ($1,$2,$3,$4,$5) RETURNING id',
      [opts.title, opts.child, opts.date, opts.time, opts.notes]
    );
    console.log(`Added one-off event with ID ${rows[0].id}`);
  });

oo.command('edit <id>')
  .description('Edit a one-off event')
  .option('-t, --title <title>', 'Event title')
  .option('-c, --child <name>', 'Child name')
  .option('-d, --date <date>', 'Date (YYYY-MM-DD)')
  .option('-T, --time <time>', 'Time (HH:MM)')
  .option('-n, --notes <notes>', 'Notes')
  .action(async (id, opts) => {
    const existing = (await db.query('SELECT * FROM one_off_items WHERE id = $1', [id])).rows[0];
    if (!existing) { console.error(`No event with ID ${id}`); process.exit(1); }
    const updated = {
      title: opts.title || existing.title,
      child_name: opts.child !== undefined ? opts.child : existing.child_name,
      date:  opts.date  || existing.date,
      time:  opts.time  || existing.time,
      notes: opts.notes !== undefined ? opts.notes : existing.notes
    };
    await db.query(
      'UPDATE one_off_items SET title=$1, child_name=$2, date=$3, time=$4, notes=$5 WHERE id=$6',
      [updated.title, updated.child_name, updated.date, updated.time, updated.notes, id]
    );
    console.log(`Updated event ${id}`);
  });

oo.command('delete <id>')
  .alias('del')
  .description('Delete a one-off event')
  .action(async id => {
    const r = await db.query('DELETE FROM one_off_items WHERE id = $1', [id]);
    if (r.rowCount === 0) { console.error(`No event with ID ${id}`); process.exit(1); }
    console.log(`Deleted event ${id}`);
  });

// ===================== TODAY =====================

program.command('today')
  .description('Show today\'s full agenda')
  .action(async () => {
    const DAYS_JS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    const today = DAYS_JS[new Date().getDay()];
    const todayDate = new Date().toISOString().slice(0,10);

    const recurring = (await db.query(
      'SELECT * FROM schedule WHERE day_of_week = $1 ORDER BY start_time', [today]
    )).rows;
    const oneoffs = (await db.query(
      'SELECT * FROM one_off_items WHERE date = $1 ORDER BY time', [todayDate]
    )).rows;

    console.log(`\n=== Today's Agenda (${today}, ${todayDate}) ===\n`);

    if (recurring.length === 0 && oneoffs.length === 0) {
      console.log('Nothing scheduled for today.'); return;
    }
    if (recurring.length > 0) {
      console.log('Recurring:');
      console.table(recurring.map(r => ({
        Child: r.child_name, Activity: r.activity, Start: r.start_time, End: r.end_time, Notes: r.notes
      })));
    }
    if (oneoffs.length > 0) {
      console.log('One-Off Events:');
      console.table(oneoffs.map(r => ({ Title: r.title, Child: r.child_name, Time: r.time, Notes: r.notes })));
    }
  });

// parseAsync waits for the async command handlers; the pg pool keeps the event
// loop alive, so close it once the command finishes.
program.parseAsync(process.argv)
  .then(() => db.pool.end())
  .catch(err => { console.error(err.message); db.pool.end().finally(() => process.exit(1)); });
