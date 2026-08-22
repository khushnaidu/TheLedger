const express = require('express');
const jwt = require('jsonwebtoken');
const { handleUpload } = require('@vercel/blob/client');
const { JWT_SECRET } = require('../middleware/auth');

const router = express.Router();

// Vercel Blob client-upload handshake. The Blob SDK's internal fetch can't
// carry our Authorization header, so this mount is UNPROTECTED in app.js and
// the ledger JWT rides in as clientPayload instead — verified here before any
// token is issued. Without that check this would be an open uploader.
router.post('/', async (req, res) => {
  try {
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return res.status(500).json({ error: 'Blob storage not configured (BLOB_READ_WRITE_TOKEN missing)' });
    }
    const jsonResponse = await handleUpload({
      body: req.body,
      request: req,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        let payload;
        try {
          payload = jwt.verify(clientPayload || '', JWT_SECRET);
        } catch {
          throw new Error('Authentication required');
        }
        const isNotebook = pathname.startsWith(`notebooks/${payload.userId}/`);
        const isPaper = pathname.startsWith(`papers/${payload.userId}/`);
        if (!isNotebook && !isPaper) {
          console.error(`Upload path rejected: "${pathname}" for user ${payload.userId}`);
          throw new Error('Uploads must live under your own shelf');
        }
        return isPaper
          ? {
              allowedContentTypes: ['application/pdf'],
              maximumSizeInBytes: 25_000_000,
              addRandomSuffix: true,
              tokenPayload: JSON.stringify({ userId: payload.userId }),
            }
          : {
              allowedContentTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
              maximumSizeInBytes: 4_000_000,
              addRandomSuffix: true,
              tokenPayload: JSON.stringify({ userId: payload.userId }),
            };
      },
      // fires via webhook from Vercel's infra — unreachable in local dev; nothing to do
      onUploadCompleted: async () => {},
    });
    res.json(jsonResponse);
  } catch (err) {
    // The client only ever sees the Blob SDK's wrapper around this, so the
    // reason a handshake was refused has to be recoverable from the logs.
    console.error('Upload handshake refused:', err.message);
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
