const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { parseICS, expandOccurrences } = require('../lib/ics');

const router = express.Router();
const prisma = new PrismaClient();

const SYNC_STALE_MS = 10 * 60 * 1000; // auto-resync at most every 10 min
const MAX_OCCURRENCES = 1000;

const pad2 = (n) => String(n).padStart(2, '0');
const dateStr = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

function normalizeUrl(url) {
  return url.trim().replace(/^webcal:\/\//i, 'https://');
}

function detectKind(url) {
  if (/google\./i.test(url)) return 'google';
  if (/icloud\.com/i.test(url)) return 'apple';
  return 'ics';
}

// Fetch + parse a feed, mirror its occurrences into CalendarEvent.
// Full replace per feed (externalId is prefixed with the feed id) — idempotent.
async function syncFeed(feed) {
  const r = await fetch(feed.url, { redirect: 'follow' });
  if (!r.ok) throw new Error(`Feed responded ${r.status}`);
  const text = await r.text();
  if (!/BEGIN:VCALENDAR/i.test(text)) throw new Error('URL did not return an ICS calendar');

  const now = new Date();
  const start = new Date(now); start.setDate(start.getDate() - 60);
  const end = new Date(now); end.setDate(end.getDate() + 400);
  const occurrences = expandOccurrences(parseICS(text), dateStr(start), dateStr(end))
    .slice(0, MAX_OCCURRENCES);

  // the replace below wipes the feed's rows, so remember which ones the user hid
  const hiddenRows = await prisma.calendarEvent.findMany({
    where: { userId: feed.userId, externalId: { startsWith: `${feed.id}:` }, hidden: true },
    select: { externalId: true },
  });
  const hiddenIds = new Set(hiddenRows.map((r) => r.externalId));

  await prisma.$transaction([
    prisma.calendarEvent.deleteMany({
      where: { userId: feed.userId, externalId: { startsWith: `${feed.id}:` } },
    }),
    prisma.calendarEvent.createMany({
      data: occurrences.map((o) => ({
        title: o.title,
        date: o.date,
        time: o.time,
        timeIsUtc: o.timeIsUtc,
        source: feed.kind,
        externalId: `${feed.id}:${o.uid}:${o.date}`,
        hidden: hiddenIds.has(`${feed.id}:${o.uid}:${o.date}`),
        userId: feed.userId,
      })),
    }),
    prisma.calendarFeed.update({ where: { id: feed.id }, data: { lastSyncedAt: new Date() } }),
  ]);
  return occurrences.length;
}

// GET /api/feeds
router.get('/', async (req, res) => {
  try {
    const feeds = await prisma.calendarFeed.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'asc' },
    });
    res.json(feeds);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/feeds — subscribe, validate, first sync
router.post('/', async (req, res) => {
  try {
    const url = normalizeUrl(req.body.url || '');
    if (!/^https:\/\//i.test(url)) {
      return res.status(400).json({ error: 'Paste an https:// or webcal:// calendar address' });
    }
    const feed = await prisma.calendarFeed.create({
      data: {
        url,
        label: req.body.label?.trim() || null,
        kind: detectKind(url),
        userId: req.user.id,
      },
    });
    try {
      const count = await syncFeed(feed);
      res.status(201).json({ ...feed, synced: count });
    } catch (syncErr) {
      // bad feed — don't keep a broken subscription around
      await prisma.calendarFeed.delete({ where: { id: feed.id } });
      res.status(422).json({ error: syncErr.message });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/feeds/sync-all — refresh stale feeds (client fires this on page load)
router.post('/sync-all', async (req, res) => {
  try {
    const feeds = await prisma.calendarFeed.findMany({ where: { userId: req.user.id } });
    const results = [];
    for (const feed of feeds) {
      const stale = !feed.lastSyncedAt || Date.now() - new Date(feed.lastSyncedAt).getTime() > SYNC_STALE_MS;
      if (!stale && !req.body?.force) { results.push({ id: feed.id, skipped: true }); continue; }
      try {
        results.push({ id: feed.id, synced: await syncFeed(feed) });
      } catch (err) {
        results.push({ id: feed.id, error: err.message });
      }
    }
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/feeds/:id — unsubscribe and sweep its mirrored events
router.delete('/:id', async (req, res) => {
  try {
    const feed = await prisma.calendarFeed.findFirst({ where: { id: req.params.id, userId: req.user.id } });
    if (!feed) return res.status(404).json({ error: 'Feed not found' });
    await prisma.$transaction([
      prisma.calendarEvent.deleteMany({
        where: { userId: req.user.id, externalId: { startsWith: `${feed.id}:` } },
      }),
      prisma.calendarFeed.delete({ where: { id: feed.id } }),
    ]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
