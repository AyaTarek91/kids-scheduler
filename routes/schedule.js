const express = require('express');
const router = express.Router();
const db = require('../db');

const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

// GET /api/schedule - full weekly schedule
router.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM schedule ORDER BY day_of_week, start_time').all();
  res.json(rows);
});

// GET /api/schedule/today - today's recurring items
router.get('/today', (req, res) => {
  const today = DAYS[new Date().getDay()];
  const rows = db.prepare(
    'SELECT * FROM schedule WHERE day_of_week = ? ORDER BY start_time'
  ).all(today);
  res.json(rows);
});

// POST /api/schedule
router.post('/', (req, res) => {
  const { child_name, activity, day_of_week, start_time, end_time, notes } = req.body;
  if (!child_name || !activity || !day_of_week || !start_time || !end_time) {
    return res.status(400).json({ error: 'child_name, activity, day_of_week, start_time, end_time are required' });
  }
  const stmt = db.prepare(
    'INSERT INTO schedule (child_name, activity, day_of_week, start_time, end_time, notes) VALUES (?,?,?,?,?,?)'
  );
  const result = stmt.run(child_name, activity, day_of_week, start_time, end_time, notes || '');
  res.status(201).json({ id: result.lastInsertRowid });
});

// PUT /api/schedule/:id
router.put('/:id', (req, res) => {
  const { child_name, activity, day_of_week, start_time, end_time, notes } = req.body;
  const existing = db.prepare('SELECT id FROM schedule WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  db.prepare(
    'UPDATE schedule SET child_name=?, activity=?, day_of_week=?, start_time=?, end_time=?, notes=? WHERE id=?'
  ).run(child_name, activity, day_of_week, start_time, end_time, notes || '', req.params.id);
  res.json({ ok: true });
});

// DELETE /api/schedule/:id
router.delete('/:id', (req, res) => {
  const result = db.prepare('DELETE FROM schedule WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

module.exports = router;
