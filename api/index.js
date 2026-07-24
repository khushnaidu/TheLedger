const express = require('express');
const cors = require('cors');
const path = require('path');

// Load dotenv only if .env exists (local dev)
try { require('dotenv').config({ path: path.join(__dirname, '../server/.env') }); } catch {}

const { authMiddleware } = require('../server/src/middleware/auth');
const authRoutes = require('../server/src/routes/auth');
const ticketRoutes = require('../server/src/routes/tickets');
const categoryRoutes = require('../server/src/routes/categories');
const labelRoutes = require('../server/src/routes/labels');
const statsRoutes = require('../server/src/routes/stats');
const aiRoutes = require('../server/src/routes/ai');
const eventRoutes = require('../server/src/routes/events');
const feedRoutes = require('../server/src/routes/feeds');

const app = express();

app.use(cors());
app.use(express.json());

// Public routes
app.use('/api/auth', authRoutes);

// Protected routes
app.use('/api/tickets', authMiddleware, ticketRoutes);
app.use('/api/categories', authMiddleware, categoryRoutes);
app.use('/api/labels', authMiddleware, labelRoutes);
app.use('/api/stats', authMiddleware, statsRoutes);
app.use('/api/ai', authMiddleware, aiRoutes);
app.use('/api/events', authMiddleware, eventRoutes);
app.use('/api/feeds', authMiddleware, feedRoutes);

module.exports = app;
