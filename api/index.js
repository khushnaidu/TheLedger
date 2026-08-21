const path = require('path');

// Load dotenv only if .env exists (local dev)
try { require('dotenv').config({ path: path.join(__dirname, '../server/.env') }); } catch {}

const createApp = require('../server/src/app');

module.exports = createApp();
