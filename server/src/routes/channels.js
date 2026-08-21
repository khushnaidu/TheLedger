const express = require('express');
const prisma = require('../lib/prisma');

const router = express.Router();

const EMBED_RE = /^https:\/\/www\.youtube\.com\/embed\/(videoseries\?list=[\w-]+|[\w-]{6,20}\?)/;
const MAX_CHANNELS = 30;

// GET /api/channels — the user's custom lineup
router.get('/', async (req, res) => {
  try {
    const channels = await prisma.tvChannel.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'asc' },
    });
    res.json(channels);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/channels — { name, src } (src already converted to an embed URL by the client)
router.post('/', async (req, res) => {
  try {
    const name = (req.body.name || '').trim().slice(0, 20);
    const src = (req.body.src || '').trim();
    if (!name) return res.status(400).json({ error: 'Channel needs a name' });
    if (!EMBED_RE.test(src)) return res.status(400).json({ error: 'Not a YouTube embed URL' });
    const count = await prisma.tvChannel.count({ where: { userId: req.user.id } });
    if (count >= MAX_CHANNELS) return res.status(400).json({ error: 'Channel lineup is full' });
    const channel = await prisma.tvChannel.create({
      data: { name, src, userId: req.user.id },
    });
    res.status(201).json(channel);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/channels/:id — custom channels only; the built-ins live in the client and can't reach here
router.delete('/:id', async (req, res) => {
  try {
    const existing = await prisma.tvChannel.findFirst({ where: { id: req.params.id, userId: req.user.id } });
    if (!existing) return res.status(404).json({ error: 'Channel not found' });
    await prisma.tvChannel.delete({ where: { id: existing.id } });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
