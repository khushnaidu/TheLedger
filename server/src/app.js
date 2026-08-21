const express = require('express');
const cors = require('cors');
const { authMiddleware } = require('./middleware/auth');

// One route list for every entrypoint (local server + Vercel wrapper):
// [mount name, isProtected]. Adding an API = one file in routes/ + one
// line here.
const ROUTES = [
  ['auth', false],
  ['tickets', true],
  ['categories', true],
  ['labels', true],
  ['stats', true],
  ['ai', true],
  ['events', true],
  ['feeds', true],
  ['channels', true],
  ['partner', true],
  ['notebooks', true],
  ['uploads', false], // Blob handshake self-authenticates via JWT clientPayload
];

module.exports = function createApp({ before = [] } = {}) {
  const app = express();
  app.use(cors());
  // notebook pages autosave JSON bigger than express's 100kb default
  app.use(express.json({ limit: '1mb' }));
  for (const middleware of before) app.use(middleware);

  for (const [name, isProtected] of ROUTES) {
    const router = require(`./routes/${name}`);
    app.use(`/api/${name}`, ...(isProtected ? [authMiddleware] : []), router);
  }

  return app;
};
