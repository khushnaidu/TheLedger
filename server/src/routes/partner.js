const { Router } = require('express');
const prisma = require('../lib/prisma');

const router = Router();

const TZ = 'America/Los_Angeles';

// "YYYY-MM-DD" for a Date in Bay time — face-off days roll over at midnight PT
function dayKey(d) {
  return new Date(d).toLocaleDateString('en-CA', { timeZone: TZ });
}

function daysAgoKey(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return dayKey(d);
}

// find this user's single connection (either direction, pending or accepted)
async function findConnection(userId) {
  return prisma.connection.findFirst({
    where: { OR: [{ requesterId: userId }, { addresseeId: userId }] },
    include: {
      requester: { select: { id: true, name: true, email: true } },
      addressee: { select: { id: true, name: true, email: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
}

function shapeConnection(conn, userId) {
  if (!conn) return { status: 'NONE' };
  const iAmRequester = conn.requesterId === userId;
  const partner = iAmRequester ? conn.addressee : conn.requester;
  if (conn.status === 'ACCEPTED') {
    return { status: 'CONNECTED', partner, since: conn.acceptedAt };
  }
  return { status: iAmRequester ? 'PENDING_SENT' : 'PENDING_RECEIVED', partner };
}

// one fighter's card — everything the tale of the tape compares
async function fighterCard(user) {
  const tickets = await prisma.ticket.findMany({
    where: { userId: user.id },
    select: { status: true, dueDate: true, createdAt: true, updatedAt: true },
  });

  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const done = tickets.filter((t) => t.status === 'DONE');
  const open = tickets.filter((t) => t.status !== 'DONE');

  // last 7 days of filings, oldest → today (DONE updatedAt ≈ filing time)
  const doneDays = new Set(done.map((t) => dayKey(t.updatedAt)));
  const perDay = {};
  for (const t of done) {
    const k = dayKey(t.updatedAt);
    perDay[k] = (perDay[k] || 0) + 1;
  }
  const week = [];
  for (let i = 6; i >= 0; i--) week.push(perDay[daysAgoKey(i)] || 0);

  // streak: consecutive days with ≥1 filing, counting back from today
  // (an empty today doesn't break it — the day isn't over)
  let streak = 0;
  let i = doneDays.has(daysAgoKey(0)) ? 0 : 1;
  while (doneDays.has(daysAgoKey(i))) {
    streak++;
    i++;
  }

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    total: tickets.length,
    done: done.length,
    inMotion: tickets.filter((t) => t.status === 'IN_PROGRESS').length,
    completionRate: tickets.length ? Math.round((done.length / tickets.length) * 100) : 0,
    doneThisWeek: done.filter((t) => t.updatedAt >= weekAgo).length,
    openedThisWeek: tickets.filter((t) => t.createdAt >= weekAgo).length,
    overdue: open.filter((t) => t.dueDate && new Date(t.dueDate) < now).length,
    streak,
    week,
  };
}

// GET /api/partner — connection state
router.get('/', async (req, res) => {
  try {
    const conn = await findConnection(req.user.id);
    res.json(shapeConnection(conn, req.user.id));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/partner/invite { email } — issue the challenge
router.post('/invite', async (req, res) => {
  try {
    const email = (req.body.email || '').trim().toLowerCase();
    if (!email) return res.status(400).json({ error: 'Email required' });
    if (email === req.user.email.toLowerCase()) {
      return res.status(400).json({ error: 'You cannot face off against yourself' });
    }

    const existing = await findConnection(req.user.id);
    if (existing) return res.status(400).json({ error: 'You already have a connection' });

    const other = await prisma.user.findUnique({ where: { email } });
    if (!other) return res.status(404).json({ error: 'No ledger holder with that email' });

    const theirs = await findConnection(other.id);
    if (theirs) return res.status(400).json({ error: 'That user is already connected' });

    const conn = await prisma.connection.create({
      data: { requesterId: req.user.id, addresseeId: other.id },
      include: {
        requester: { select: { id: true, name: true, email: true } },
        addressee: { select: { id: true, name: true, email: true } },
      },
    });
    res.status(201).json(shapeConnection(conn, req.user.id));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/partner/accept — accept a received challenge
router.post('/accept', async (req, res) => {
  try {
    const conn = await findConnection(req.user.id);
    if (!conn || conn.status !== 'PENDING' || conn.addresseeId !== req.user.id) {
      return res.status(400).json({ error: 'No pending invite to accept' });
    }
    const updated = await prisma.connection.update({
      where: { id: conn.id },
      data: { status: 'ACCEPTED', acceptedAt: new Date() },
      include: {
        requester: { select: { id: true, name: true, email: true } },
        addressee: { select: { id: true, name: true, email: true } },
      },
    });
    res.json(shapeConnection(updated, req.user.id));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/partner — decline an invite or dissolve the bout
router.delete('/', async (req, res) => {
  try {
    const conn = await findConnection(req.user.id);
    if (!conn) return res.status(404).json({ error: 'No connection' });
    await prisma.connection.delete({ where: { id: conn.id } });
    res.json({ status: 'NONE' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/partner/faceoff — both cards + the correspondence
router.get('/faceoff', async (req, res) => {
  try {
    const conn = await findConnection(req.user.id);
    const shaped = shapeConnection(conn, req.user.id);
    if (shaped.status !== 'CONNECTED') {
      return res.status(400).json({ error: 'Not connected' });
    }

    const me = { id: req.user.id, email: req.user.email };
    const meFull = conn.requesterId === me.id ? conn.requester : conn.addressee;
    const [you, partner, notes] = await Promise.all([
      fighterCard(meFull),
      fighterCard(shaped.partner),
      prisma.partnerNote.findMany({
        where: {
          OR: [
            { authorId: req.user.id, recipientId: shaped.partner.id },
            { authorId: shaped.partner.id, recipientId: req.user.id },
          ],
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
    ]);

    res.json({ you, partner, notes, since: shaped.since });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/partner/notes { body } — leave a note for the other side
router.post('/notes', async (req, res) => {
  try {
    const body = (req.body.body || '').trim();
    if (!body) return res.status(400).json({ error: 'Note is empty' });
    if (body.length > 500) return res.status(400).json({ error: 'Keep it under 500 characters' });

    const conn = await findConnection(req.user.id);
    const shaped = shapeConnection(conn, req.user.id);
    if (shaped.status !== 'CONNECTED') {
      return res.status(400).json({ error: 'Not connected' });
    }

    const note = await prisma.partnerNote.create({
      data: { body, authorId: req.user.id, recipientId: shaped.partner.id },
    });
    res.status(201).json(note);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
