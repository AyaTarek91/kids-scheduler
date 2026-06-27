const express = require('express');
const router = express.Router();
const db = require('../db');

const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

// GET /api/schedule - full weekly schedule
router.get('/', async (req, res) => {
  const { rows } = await db.query('SELECT * FROM schedule ORDER BY day_of_week, start_time');
  res.json(rows);
});

// GET /api/schedule/today - today's recurring items
router.get('/today', async (req, res) => {
  const today = DAYS[new Date().getDay()];
  const { rows } = await db.query(
    'SELECT * FROM schedule WHERE day_of_week = $1 ORDER BY start_time', [today]
  );
  res.json(rows);
});

// POST /api/schedule
router.post('/', async (req, res) => {
  const { child_name, activity, day_of_week, start_time, end_time, notes } = req.body;
  if (!child_name || !activity || !day_of_week || !start_time || !end_time) {
    return res.status(400).json({ error: 'child_name, activity, day_of_week, start_time, end_time are required' });
  }
  const { rows } = await db.query(
    'INSERT INTO schedule (child_name, activity, day_of_week, start_time, end_time, notes) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',
    [child_name, activity, day_of_week, start_time, end_time, notes || '']
  );
  res.status(201).json({ id: rows[0].id });
});

// PUT /api/schedule/:id
router.put('/:id', async (req, res) => {
  const { child_name, activity, day_of_week, start_time, end_time, notes } = req.body;
  const existing = await db.query('SELECT id FROM schedule WHERE id = $1', [req.params.id]);
  if (existing.rowCount === 0) return res.status(404).json({ error: 'Not found' });
  await db.query(
    'UPDATE schedule SET child_name=$1, activity=$2, day_of_week=$3, start_time=$4, end_time=$5, notes=$6 WHERE id=$7',
    [child_name, activity, day_of_week, start_time, end_time, notes || '', req.params.id]
  );
  res.json({ ok: true });
});

// DELETE /api/schedule/:id
router.delete('/:id', async (req, res) => {
  const result = await db.query('DELETE FROM schedule WHERE id = $1', [req.params.id]);
  if (result.rowCount === 0) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

module.exports = router;
