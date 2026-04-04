require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');

const ticketRoutes = require('./routes/tickets');
const categoryRoutes = require('./routes/categories');
const labelRoutes = require('./routes/labels');
const statsRoutes = require('./routes/stats');
const canvasRoutes = require('./routes/canvas');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

// API routes
app.use('/api/tickets', ticketRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/labels', labelRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/canvas', canvasRoutes);

// Serve static frontend in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../../client/dist')));
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../../client/dist/index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`⚡ TaskManager server running on port ${PORT}`);
});
