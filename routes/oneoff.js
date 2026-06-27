const express = require('express');
const router = express.Router();
const db = require('../db');

// GET /api/one-off - all one-off items
router.get('/', async (req, res) => {
  const { rows } = await db.query('SELECT * FROM one_off_items ORDER BY date, time');
  res.json(rows);
});

// GET /api/one-off/today - today's one-off items
router.get('/today', async (req, res) => {
  // Local date (YYYY-MM-DD) respecting the process TZ — toISOString() would
  // return UTC, which is off-by-one for timezones ahead of UTC (e.g. Cairo)
  // and would miss events stored with today's local date.
  const today = new Date().toLocaleDateString('en-CA');
  const { rows } = await db.query(
    'SELECT * FROM one_off_items WHERE date = $1 ORDER BY time', [today]
  );
  res.json(rows);
});

// POST /api/one-off
router.post('/', async (req, res) => {
  const { title, child_name, date, time, notes } = req.body;
  if (!title || !date || !time) {
    return res.status(400).json({ error: 'title, date, and time are required' });
  }
  if (new Date(`${date}T${time}`) < new Date()) {
    return res.status(400).json({ error: 'Cannot create an event in the past' });
  }
  const { rows } = await db.query(
    'INSERT INTO one_off_items (title, child_name, date, time, notes) VALUES ($1,$2,$3,$4,$5) RETURNING id',
    [title, child_name || '', date, time, notes || '']
  );
  res.status(201).json({ id: rows[0].id });
});

// PUT /api/one-off/:id
router.put('/:id', async (req, res) => {
  const { title, child_name, date, time, notes } = req.body;
  const existing = await db.query('SELECT id FROM one_off_items WHERE id = $1', [req.params.id]);
  if (existing.rowCount === 0) return res.status(404).json({ error: 'Not found' });
  await db.query(
    'UPDATE one_off_items SET title=$1, child_name=$2, date=$3, time=$4, notes=$5 WHERE id=$6',
    [title, child_name || '', date, time, notes || '', req.params.id]
  );
  res.json({ ok: true });
});

// DELETE /api/one-off/:id
router.delete('/:id', async (req, res) => {
  const result = await db.query('DELETE FROM one_off_items WHERE id = $1', [req.params.id]);
  if (result.rowCount === 0) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

module.exports = router;
