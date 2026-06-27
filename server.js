require('dotenv').config();
const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/schedule', require('./routes/schedule'));
app.use('/api/one-off', require('./routes/oneoff'));

app.listen(PORT, () => {
  console.log(`Kids Scheduler running at http://localhost:${PORT}`);
});

module.exports = app;
