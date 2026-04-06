require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');

const { authMiddleware } = require('./middleware/auth');
const authRoutes = require('./routes/auth');
const ticketRoutes = require('./routes/tickets');
const categoryRoutes = require('./routes/categories');
const labelRoutes = require('./routes/labels');
const statsRoutes = require('./routes/stats');
const canvasRoutes = require('./routes/canvas');
const aiRoutes = require('./routes/ai');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

// Public routes
app.use('/api/auth', authRoutes);

// Protected routes — require auth
app.use('/api/tickets', authMiddleware, ticketRoutes);
app.use('/api/categories', authMiddleware, categoryRoutes);
app.use('/api/labels', authMiddleware, labelRoutes);
app.use('/api/stats', authMiddleware, statsRoutes);
app.use('/api/canvas', authMiddleware, canvasRoutes);
app.use('/api/ai', authMiddleware, aiRoutes);

// Serve static frontend in production (non-Vercel)
if (process.env.NODE_ENV === 'production' && !process.env.VERCEL) {
  app.use(express.static(path.join(__dirname, '../../client/dist')));
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../../client/dist/index.html'));
  });
}

// Export for Vercel serverless, listen for standalone
if (process.env.VERCEL) {
  module.exports = app;
} else {
  app.listen(PORT, () => {
    console.log(`The Ledger server running on port ${PORT}`);
  });
}
