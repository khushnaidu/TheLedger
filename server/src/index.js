require('dotenv').config();
const express = require('express');
const morgan = require('morgan');
const path = require('path');

const createApp = require('./app');

const app = createApp({ before: [morgan('dev')] });
const PORT = process.env.PORT || 3001;

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
