const express = require('express');
const prisma = require('../lib/prisma');

const router = express.Router();

// GET /api/events?month=2026-07 — all events in a month (or ?date=2026-07-24 for one day)
router.get('/', async (req, res) => {
  try {
    const { month, date } = req.query;
    const where = { userId: req.user.id, hidden: false };
    if (date) where.date = date;
    else if (month) where.date = { startsWith: month };
    const events = await prisma.calendarEvent.findMany({
      where,
      orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
    });
    res.json(events);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/events
router.post('/', async (req, res) => {
  try {
    const { title, date, time, note, imageUrl } = req.body;
    if (!title?.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(date || '')) {
      return res.status(400).json({ error: 'title and date (YYYY-MM-DD) are required' });
    }
    if (time && !/^\d{2}:\d{2}$/.test(time)) {
      return res.status(400).json({ error: 'time must be HH:MM' });
    }
    const event = await prisma.calendarEvent.create({
      data: { title: title.trim(), date, time: time || null, note: note || null, imageUrl: imageUrl || null, userId: req.user.id },
    });
    res.status(201).json(event);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/events/:id
router.patch('/:id', async (req, res) => {
  try {
    const existing = await prisma.calendarEvent.findFirst({ where: { id: req.params.id, userId: req.user.id } });
    if (!existing) return res.status(404).json({ error: 'Event not found' });
    const { title, date, time, note, imageUrl } = req.body;
    const data = {};
    if (title !== undefined) data.title = title.trim();
    if (date !== undefined) data.date = date;
    if (time !== undefined) data.time = time || null;
    if (note !== undefined) data.note = note;
    if (imageUrl !== undefined) data.imageUrl = imageUrl;
    const event = await prisma.calendarEvent.update({ where: { id: existing.id }, data });
    res.json(event);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/events/:id
router.delete('/:id', async (req, res) => {
  try {
    const existing = await prisma.calendarEvent.findFirst({ where: { id: req.params.id, userId: req.user.id } });
    if (!existing) return res.status(404).json({ error: 'Event not found' });
    if (existing.source !== 'manual') {
      // synced events come back on every re-sync, so removal = a hidden flag the sync preserves
      await prisma.calendarEvent.update({ where: { id: existing.id }, data: { hidden: true } });
    } else {
      await prisma.calendarEvent.delete({ where: { id: existing.id } });
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/events/giphy/search?q=... — proxy so the API key stays server-side
router.get('/giphy/search', async (req, res) => {
  try {
    const key = process.env.GIPHY_API_KEY;
    if (!key) return res.status(503).json({ error: 'Giphy is not configured' });
    const q = (req.query.q || '').trim();
    if (!q) return res.json([]);
    const url = `https://api.giphy.com/v1/gifs/search?api_key=${key}&q=${encodeURIComponent(q)}&limit=12&rating=pg-13`;
    const r = await fetch(url);
    if (!r.ok) return res.status(502).json({ error: `Giphy responded ${r.status}` });
    const { data } = await r.json();
    res.json(data.map((g) => ({
      id: g.id,
      preview: g.images.fixed_width_small.url,
      url: g.images.fixed_width.url,
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
