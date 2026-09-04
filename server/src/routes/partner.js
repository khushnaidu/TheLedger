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

// find this user's single connection OF A KIND (either direction,
// pending or accepted) — 'tickets' is the face-off, 'leetcode' the
// sparring ring; a user may hold one of each, different rivals allowed
async function findConnection(userId, kind = 'tickets') {
  return prisma.connection.findFirst({
    where: { kind, OR: [{ requesterId: userId }, { addresseeId: userId }] },
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

// ── the sparring ring (ADR-0014) ─────────────────────────────
// A SEPARATE bout from the face-off: kind 'leetcode', its own rival.
// Leetcode/neetcode problems logged per day, proof attached. Both
// corners read the whole log — your rows and your rival's — so the
// proof is social: the other side can always inspect the receipt.

const PROBLEM_KINDS = ['solved', 'studied', 'watched'];
const DIFFICULTIES = ['', 'easy', 'medium', 'hard'];
const YT_RE = /(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)[\w-]{6,}/i;

// a watched video names itself: YouTube's public oEmbed hands back the
// title, no key needed — fail-open to a plain label if it won't answer
const videoTitle = async (url) => {
  try {
    const r = await fetch(
      'https://www.youtube.com/oembed?format=json&url=' + encodeURIComponent(url),
      { signal: AbortSignal.timeout(4000) },
    );
    if (!r.ok) return '';
    return String((await r.json()).title || '').trim().slice(0, 140);
  } catch { return ''; }
};

// GET /api/partner/spar — where the code bout stands
router.get('/spar', async (req, res) => {
  try {
    const conn = await findConnection(req.user.id, 'leetcode');
    res.json(shapeConnection(conn, req.user.id));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/partner/spar/invite { email } — call out a sparring rival
router.post('/spar/invite', async (req, res) => {
  try {
    const email = (req.body.email || '').trim().toLowerCase();
    if (!email) return res.status(400).json({ error: 'Email required' });
    if (email === req.user.email.toLowerCase()) {
      return res.status(400).json({ error: 'You cannot spar with yourself' });
    }
    const existing = await findConnection(req.user.id, 'leetcode');
    if (existing) return res.status(400).json({ error: 'You already have a sparring partner' });
    const other = await prisma.user.findUnique({ where: { email } });
    if (!other) return res.status(404).json({ error: 'No ledger holder with that email' });
    const theirs = await findConnection(other.id, 'leetcode');
    if (theirs) return res.status(400).json({ error: 'That user already spars with someone' });
    const conn = await prisma.connection.create({
      data: { requesterId: req.user.id, addresseeId: other.id, kind: 'leetcode' },
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

// POST /api/partner/spar/accept — step into the ring
router.post('/spar/accept', async (req, res) => {
  try {
    const conn = await findConnection(req.user.id, 'leetcode');
    if (!conn || conn.status !== 'PENDING' || conn.addresseeId !== req.user.id) {
      return res.status(400).json({ error: 'No pending challenge to accept' });
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

// DELETE /api/partner/spar — decline or hang up the gloves
router.delete('/spar', async (req, res) => {
  try {
    const conn = await findConnection(req.user.id, 'leetcode');
    if (!conn) return res.status(404).json({ error: 'No sparring partner' });
    await prisma.connection.delete({ where: { id: conn.id } });
    res.json({ status: 'NONE' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/partner/problems — the whole bout's log, newest first
router.get('/problems', async (req, res) => {
  try {
    const conn = await findConnection(req.user.id, 'leetcode');
    const shaped = shapeConnection(conn, req.user.id);
    const ids = [req.user.id];
    if (shaped.status === 'CONNECTED') ids.push(shaped.partner.id);
    const rows = await prisma.problem.findMany({
      where: { userId: { in: ids } },
      orderBy: { solvedAt: 'desc' },
      take: 600,
    });
    res.json(rows.map((r) => ({ ...r, mine: r.userId === req.user.id })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/partner/problems — log one problem (or one watched video)
router.post('/problems', async (req, res) => {
  try {
    let title = String(req.body?.title ?? '').trim().slice(0, 140);
    const kind = PROBLEM_KINDS.includes(req.body?.kind) ? req.body.kind : 'solved';
    const url = String(req.body?.url ?? '').trim().slice(0, 500);
    if (!title && kind === 'watched' && YT_RE.test(url)) {
      title = await videoTitle(url);
      if (!title) title = 'a neetcode video';
    }
    if (!title) return res.status(400).json({ error: 'Name the problem' });
    const difficulty = DIFFICULTIES.includes(req.body?.difficulty) ? req.body.difficulty : '';
    // a backdated log is allowed a fortnight — yesterday's grind counts,
    // but nobody pre-logs tomorrow
    let solvedAt = new Date();
    if (req.body?.solvedAt) {
      const d = new Date(req.body.solvedAt);
      const age = Date.now() - d.getTime();
      if (!Number.isNaN(d.getTime()) && age >= 0 && age <= 14 * 86400000) solvedAt = d;
    }
    const row = await prisma.problem.create({
      data: {
        title,
        url,
        kind,
        difficulty,
        proofUrl: String(req.body?.proofUrl ?? '').trim().slice(0, 500),
        note: String(req.body?.note ?? '').trim().slice(0, 500),
        solvedAt,
        userId: req.user.id,
      },
    });
    res.status(201).json({ ...row, mine: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/partner/problems/:id — strike your own row only
router.delete('/problems/:id', async (req, res) => {
  try {
    const row = await prisma.problem.findFirst({
      where: { id: req.params.id, userId: req.user.id },
    });
    if (!row) return res.status(404).json({ error: 'No such round in your log' });
    await prisma.problem.delete({ where: { id: row.id } });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
