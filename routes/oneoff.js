const express = require('express');
const router = express.Router();
const db = require('../db');

// GET /api/one-off - all one-off items
router.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM one_off_items ORDER BY date, time').all();
  res.json(rows);
});

// GET /api/one-off/today - today's one-off items
router.get('/today', (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const rows = db.prepare(
    'SELECT * FROM one_off_items WHERE date = ? ORDER BY time'
  ).all(today);
  res.json(rows);
});

// POST /api/one-off
router.post('/', (req, res) => {
  const { title, child_name, date, time, notes } = req.body;
  if (!title || !date || !time) {
    return res.status(400).json({ error: 'title, date, and time are required' });
  }
  if (new Date(`${date}T${time}`) < new Date()) {
    return res.status(400).json({ error: 'Cannot create an event in the past' });
  }
  const result = db.prepare(
    'INSERT INTO one_off_items (title, child_name, date, time, notes) VALUES (?,?,?,?,?)'
  ).run(title, child_name || '', date, time, notes || '');
  res.status(201).json({ id: result.lastInsertRowid });
});

// PUT /api/one-off/:id
router.put('/:id', (req, res) => {
  const { title, child_name, date, time, notes } = req.body;
  const existing = db.prepare('SELECT id FROM one_off_items WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  db.prepare(
    'UPDATE one_off_items SET title=?, child_name=?, date=?, time=?, notes=? WHERE id=?'
  ).run(title, child_name || '', date, time, notes || '', req.params.id);
  res.json({ ok: true });
});

// DELETE /api/one-off/:id
router.delete('/:id', (req, res) => {
  const result = db.prepare('DELETE FROM one_off_items WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

module.exports = router;
