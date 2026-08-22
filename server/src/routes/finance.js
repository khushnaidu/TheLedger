const express = require('express');
const Anthropic = require('@anthropic-ai/sdk').default;
const prisma = require('../lib/prisma');

const router = express.Router();

const KINDS = ['expense', 'income'];
const SOURCES = ['manual', 'csv', 'vera'];
// the sheet posts a whole statement at once; 500 lines fits well inside
// the 1MB express.json limit with room to spare (see ADR-0007)
const MAX_BATCH = 500;
const VERA_MODEL = 'claude-haiku-4-5-20251001';

// ── the counting desk ────────────────────────────────────────
// Amounts are stored as positive Decimal strings; `kind` carries the
// sign. Anything the client sends is scrubbed back to that shape here.

function money(v) {
  let s = typeof v === 'number' ? (Number.isFinite(v) ? v.toFixed(2) : '') : String(v ?? '');
  s = s.trim().replace(/[$£€,\s]/g, '');
  // accountants bracket their negatives
  if (/^\(.*\)$/.test(s)) s = `-${s.slice(1, -1)}`;
  if (!/^-?\d{1,10}(\.\d{1,2})?$/.test(s)) return null;
  const n = Math.abs(parseFloat(s));
  if (!Number.isFinite(n)) return null;
  return n.toFixed(2);
}

// a day, not a timestamp — the book records dates, so everything is
// pinned to UTC midnight and every range query agrees with it
function day(v) {
  const s = String(v ?? '').trim();
  const ymd = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (ymd) {
    const d = new Date(`${ymd[1]}-${ymd[2]}-${ymd[3]}T00:00:00.000Z`);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
}

function monthRange(month) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(month || ''));
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  if (mo < 1 || mo > 12) return null;
  return { start: new Date(Date.UTC(y, mo - 1, 1)), end: new Date(Date.UTC(y, mo, 1)) };
}

const thisMonth = () => new Date().toISOString().slice(0, 7);
const category = (v) => (String(v ?? '').trim().toLowerCase().slice(0, 32) || 'uncategorized');

// one line, scrubbed. returns { ok, data } or { ok:false, error }
function line(raw, userId, defaultSource = 'manual') {
  const amount = money(raw?.amount);
  if (amount === null) return { ok: false, error: `"${raw?.amount}" is not an amount` };
  if (amount === '0.00') return { ok: false, error: 'A line of zero is not a line' };
  const date = day(raw?.date);
  if (!date) return { ok: false, error: `"${raw?.date}" is not a date` };
  const kind = KINDS.includes(raw?.kind) ? raw.kind : 'expense';
  const source = SOURCES.includes(raw?.source) ? raw.source : defaultSource;
  const externalKey = raw?.externalKey ? String(raw.externalKey).slice(0, 120) : null;
  return {
    ok: true,
    data: {
      kind,
      amount,
      category: category(raw?.category),
      description: String(raw?.description ?? '').trim().slice(0, 160),
      date,
      source,
      externalKey,
      userId,
    },
  };
}

// ── entries ──────────────────────────────────────────────────

// GET /api/finance/entries?month=YYYY-MM&kind=&category=&q=
// month=all reads the whole book (the sheet paginates by month by default)
router.get('/entries', async (req, res) => {
  try {
    const { month, from, to, kind, category: cat, q, source, limit } = req.query;
    const where = { userId: req.user.id };
    if (SOURCES.includes(source)) where.source = source;
    // an explicit range wins; `to` is exclusive so a year is [Jan 1, next Jan 1)
    if (from || to) {
      const gte = from ? day(from) : null;
      const lt = to ? day(to) : null;
      if ((from && !gte) || (to && !lt)) return res.status(400).json({ error: 'from/to must be YYYY-MM-DD' });
      where.date = { ...(gte && { gte }), ...(lt && { lt }) };
    } else if (month && month !== 'all') {
      const range = monthRange(month);
      if (!range) return res.status(400).json({ error: 'month must be YYYY-MM' });
      where.date = { gte: range.start, lt: range.end };
    }
    if (KINDS.includes(kind)) where.kind = kind;
    if (cat) where.category = category(cat);
    if (q?.trim()) where.description = { contains: q.trim(), mode: 'insensitive' };
    const entries = await prisma.ledgerEntry.findMany({
      where,
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      // the all-time plate needs the whole book in one go
      take: Math.min(Number(limit) || 1000, 5000),
    });
    res.json(entries);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/finance/entries — one hand-written line
router.post('/entries', async (req, res) => {
  try {
    const parsed = line(req.body, req.user.id);
    if (!parsed.ok) return res.status(400).json({ error: parsed.error });
    const entry = await prisma.ledgerEntry.create({ data: parsed.data });
    res.status(201).json(entry);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/finance/entries/batch — a statement, or Vera's drafts
router.post('/entries/batch', async (req, res) => {
  try {
    const rows = req.body?.entries;
    if (!Array.isArray(rows) || !rows.length) return res.status(400).json({ error: 'No entries provided' });
    if (rows.length > MAX_BATCH) {
      return res.status(413).json({ error: `Post at most ${MAX_BATCH} lines at a time` });
    }
    const data = [];
    const rejected = [];
    for (const [i, raw] of rows.entries()) {
      const parsed = line(raw, req.user.id, 'csv');
      if (parsed.ok) data.push(parsed.data);
      else rejected.push({ row: i, error: parsed.error });
    }
    if (!data.length) return res.status(400).json({ error: 'Not one line was legible', rejected });
    // a statement dropped twice must not double the book — the
    // (userId, externalKey) unique index does the work
    const { count } = await prisma.ledgerEntry.createMany({ data, skipDuplicates: true });
    res.status(201).json({ count, duplicates: data.length - count, rejected });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/finance/entries/bulk — put many lines under one category
router.patch('/entries/bulk', async (req, res) => {
  try {
    const { ids, category: cat } = req.body;
    if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ error: 'No lines given' });
    if (ids.length > 1000) return res.status(413).json({ error: 'Too many lines at once' });
    if (!cat?.trim()) return res.status(400).json({ error: 'A category is required' });
    // the userId in the filter is what keeps this from reaching another book
    const { count } = await prisma.ledgerEntry.updateMany({
      where: { id: { in: ids.slice(0, 1000) }, userId: req.user.id },
      data: { category: category(cat) },
    });
    res.json({ count });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/finance/entries/:id — correct a line in place
router.patch('/entries/:id', async (req, res) => {
  try {
    const existing = await prisma.ledgerEntry.findFirst({
      where: { id: req.params.id, userId: req.user.id },
    });
    if (!existing) return res.status(404).json({ error: 'No such line' });
    const data = {};
    if (req.body.amount !== undefined) {
      const amount = money(req.body.amount);
      if (amount === null || amount === '0.00') return res.status(400).json({ error: 'That is not an amount' });
      data.amount = amount;
    }
    if (req.body.date !== undefined) {
      const date = day(req.body.date);
      if (!date) return res.status(400).json({ error: 'That is not a date' });
      data.date = date;
    }
    if (req.body.kind !== undefined && KINDS.includes(req.body.kind)) data.kind = req.body.kind;
    if (req.body.category !== undefined) data.category = category(req.body.category);
    if (req.body.description !== undefined) {
      data.description = String(req.body.description).trim().slice(0, 160);
    }
    const entry = await prisma.ledgerEntry.update({ where: { id: existing.id }, data });
    res.json(entry);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/finance/entries/:id — strike a line
router.delete('/entries/:id', async (req, res) => {
  try {
    const existing = await prisma.ledgerEntry.findFirst({
      where: { id: req.params.id, userId: req.user.id },
    });
    if (!existing) return res.status(404).json({ error: 'No such line' });
    await prisma.ledgerEntry.delete({ where: { id: existing.id } });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── the foot of the page ─────────────────────────────────────

// twelve months of totals, one row per month per kind. Raw because
// date_trunc has no Prisma equivalent; SUM is cast to text so the
// Decimal arrives as a plain string like the rest of the API.
async function trend(userId, endExclusive) {
  // twelve slots ending ON the selected month, so it sits at the right edge
  const start = new Date(Date.UTC(endExclusive.getUTCFullYear(), endExclusive.getUTCMonth() - 12, 1));
  const rows = await prisma.$queryRaw`
    SELECT to_char("date", 'YYYY-MM') AS month, "kind", SUM("amount")::text AS total
    FROM "LedgerEntry"
    WHERE "userId" = ${userId} AND "date" >= ${start} AND "date" < ${endExclusive}
    GROUP BY 1, 2
    ORDER BY 1 ASC`;
  const byMonth = new Map();
  for (let i = 0; i < 12; i++) {
    const d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + i, 1));
    const key = d.toISOString().slice(0, 7);
    byMonth.set(key, { month: key, income: '0.00', expense: '0.00' });
  }
  for (const r of rows) {
    const slot = byMonth.get(r.month);
    if (slot) slot[r.kind] = r.total;
  }
  return [...byMonth.values()];
}

// GET /api/finance/trend — every month and every year the book covers.
// The plate's period toggle needs totals outside whatever range is on
// screen, so this stands apart from /summary and reads the whole book.
router.get('/trend', async (req, res) => {
  try {
    const userId = req.user.id;
    const roll = async (fmt) => prisma.$queryRawUnsafe(`
      SELECT to_char("date", '${fmt}') AS key, "kind", SUM("amount")::text AS total, COUNT(*)::int AS n
      FROM "LedgerEntry" WHERE "userId" = $1
      GROUP BY 1, 2 ORDER BY 1 ASC`, userId);

    const shape = (rows) => {
      const by = new Map();
      for (const r of rows) {
        if (!by.has(r.key)) by.set(r.key, { key: r.key, expense: '0.00', income: '0.00', n: 0 });
        const slot = by.get(r.key);
        slot[r.kind] = r.total;
        slot.n += r.n;
      }
      return [...by.values()];
    };

    const [months, years] = await Promise.all([roll('YYYY-MM'), roll('YYYY')]);
    res.json({ months: shape(months), years: shape(years) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/finance/summary?month=YYYY-MM — the totals block
router.get('/summary', async (req, res) => {
  try {
    const month = req.query.month || thisMonth();
    const range = monthRange(month);
    if (!range) return res.status(400).json({ error: 'month must be YYYY-MM' });
    const userId = req.user.id;

    const [grouped, allTime, months, known, first] = await Promise.all([
      prisma.ledgerEntry.groupBy({
        by: ['kind', 'category'],
        where: { userId, date: { gte: range.start, lt: range.end } },
        _sum: { amount: true },
        _count: { _all: true },
      }),
      prisma.ledgerEntry.groupBy({
        by: ['kind'],
        where: { userId },
        _sum: { amount: true },
      }),
      trend(userId, range.end),
      prisma.ledgerEntry.groupBy({
        by: ['category'],
        where: { userId },
        _count: { _all: true },
        orderBy: { _count: { category: 'desc' } },
        take: 40,
      }),
      prisma.ledgerEntry.findFirst({ where: { userId }, orderBy: { date: 'asc' }, select: { date: true } }),
    ]);

    const sum = (list, kind) =>
      list.filter((g) => g.kind === kind)
        .reduce((a, g) => a + Number(g._sum.amount || 0), 0)
        .toFixed(2);

    const income = sum(grouped, 'income');
    const expense = sum(grouped, 'expense');
    const lifeIn = sum(allTime, 'income');
    const lifeOut = sum(allTime, 'expense');

    const net = (a, b) => (Number(a) - Number(b)).toFixed(2);

    res.json({
      month,
      totals: { income, expense, net: net(income, expense) },
      byCategory: grouped
        .map((g) => ({
          kind: g.kind,
          category: g.category,
          total: Number(g._sum.amount || 0).toFixed(2),
          count: g._count._all,
        }))
        .sort((a, b) => Number(b.total) - Number(a.total)),
      months,
      categories: known.map((k) => k.category),
      allTime: { income: lifeIn, expense: lifeOut, net: net(lifeIn, lifeOut) },
      firstEntry: first?.date || null,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Vera ─────────────────────────────────────────────────────
// The bookkeeper drafts lines; only the user pressing POST commits
// them (through /entries/batch). Same posture as Gus, different
// register — see ADR-0007.

const VERA_SYSTEM = `You are Vera, the bookkeeper of THE LEDGER's counting house. You keep the household book. Your entire personality is that the figures do not lie and you have no need to editorialize.

VOICE (hard requirements):
- Flat, exact, declarative. Short spoken sentences.
- Never use an em-dash or an en-dash. Use a period or a comma.
- Never use the construction "not just X but Y" or "it's not X, it's Y".
- No bullet lists, no numbered lists, no headers, no bold. Prose only.
- No praise, no encouragement, no "Great question", no exclamation marks.
- You never moralize about how the user spends. State the figure and stop. At most one dry aside, and only when the arithmetic itself is the joke.
- You admit gaps plainly: "The book does not show that."
- Amounts in your prose read as figures. 412.50, not four hundred twelve.

YOUR JOB:
1. When the user describes money moving, draft lines with draft_entries. Read the amount, the day, and what it was for. Guess the category from the description using the categories already in the book when one fits.
2. Every line gets a real category. Never write "uncategorized". Prefer a category already in the book below when one fits, otherwise pick a plain lowercase one, like groceries, dining, transit, utilities, rent, health, subscriptions, shopping, fun, travel, salary, refund.
3. When the user asks a question about the book, answer it from THE BOOK below with the reply tool. Do not invent figures. If the answer is not in the figures given, say so.
4. If a line is missing its amount or is genuinely ambiguous, ask with reply. Do not stall on a missing category, pick the nearest one. Do not stall on a missing date, use today.
5. Never draft more than 8 lines at once. You are a desk clerk taking dictation, not a machine that reads statements.

WHEN THE USER PASTES A STATEMENT: if the message looks like exported rows, meaning several lines with dates and figures lined up in columns, or tabs, or a run of transactions copied out of a spreadsheet, DO NOT draft any of it. You will misread the columns and lose lines, and a book with lines missing is worse than no book. Use reply and send them to the import instead. Say it plainly, something like: "That is a statement, not dictation. Import it. Press Import statement and paste it into the paste box, it reads the columns properly and it will tell you what it could not read." Do not apologize at length and do not draft a few lines as a compromise.

HOW POSTING ACTUALLY WORKS: draft_entries saves nothing. It writes drafts onto a slip the user reviews, and only the user pressing POST enters them in the book. Never say a line is entered, posted, or in the book when you have only drafted it. Say it is drafted and waiting. If the user asks whether something was posted, tell the truth.

kind is "expense" for money out and "income" for money in. amount is always positive, the kind carries the sign. date is YYYY-MM-DD.`;

const VERA_TOOLS = [
  {
    name: 'draft_entries',
    description: 'Draft one or more lines for the book. Nothing is saved. The user reviews the slip and presses POST to commit.',
    input_schema: {
      type: 'object',
      properties: {
        message: {
          type: 'string',
          description: "Vera's short reply presenting the DRAFTED lines. One or two flat sentences. Must not claim they are posted.",
        },
        entries: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              kind: { type: 'string', enum: ['expense', 'income'] },
              amount: { type: 'string', description: 'Positive figure, two decimals, e.g. "62.41"' },
              category: { type: 'string', description: 'One lowercase word or short phrase, e.g. "groceries"' },
              description: { type: 'string', description: 'What the line is for, e.g. "Trader Joes"' },
              date: { type: 'string', description: 'YYYY-MM-DD' },
            },
            required: ['kind', 'amount', 'category', 'description', 'date'],
          },
        },
      },
      required: ['message', 'entries'],
    },
  },
  {
    name: 'reply',
    description: 'Answer a question about the book, or ask the user for the one detail you are missing.',
    input_schema: {
      type: 'object',
      properties: { message: { type: 'string', description: "Vera's reply, in voice." } },
      required: ['message'],
    },
  },
];

// A compact digest of the book so Vera can answer without tools.
// Twelve months by category is a few hundred rows at personal scale.
async function bookDigest(userId) {
  const start = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() - 11, 1));
  const rows = await prisma.$queryRaw`
    SELECT to_char("date", 'YYYY-MM') AS month, "kind", "category", SUM("amount")::text AS total, COUNT(*)::int AS n
    FROM "LedgerEntry"
    WHERE "userId" = ${userId} AND "date" >= ${start}
    GROUP BY 1, 2, 3
    ORDER BY 1 DESC, 4 DESC`;
  if (!rows.length) return 'THE BOOK IS EMPTY. No lines have been entered yet.';
  const byMonth = new Map();
  for (const r of rows) {
    if (!byMonth.has(r.month)) byMonth.set(r.month, []);
    byMonth.get(r.month).push(`${r.category} ${r.kind === 'income' ? '+' : '-'}${r.total} (${r.n})`);
  }
  const lines = [...byMonth.entries()].map(([m, parts]) => `${m}: ${parts.join(', ')}`);
  return `THE BOOK, last twelve months, totals by month and category (a minus is money out, a plus is money in, the count of lines is in parentheses):\n${lines.join('\n')}`;
}

// POST /api/finance/vera — draft-then-commit, never writes
router.post('/vera', async (req, res) => {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(500).json({ error: 'Anthropic API key not configured. Add ANTHROPIC_API_KEY to your .env file.' });
    }
    const { messages } = req.body;
    if (!messages?.length) return res.status(400).json({ error: 'Messages are required' });

    const digest = await bookDigest(req.user.id);
    const today = new Date().toISOString().slice(0, 10);
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const response = await client.messages.create({
      model: VERA_MODEL,
      max_tokens: 4096,
      system: `${VERA_SYSTEM}\n\nToday is ${today}.\n\n${digest}`,
      tools: VERA_TOOLS,
      tool_choice: { type: 'any' },
      messages: messages.slice(-16),
    });

    const block = response.content.find((b) => b.type === 'tool_use');
    if (!block) return res.status(500).json({ error: 'Vera has stepped away from the desk. Try again.' });

    // a truncated draft must never look like a complete slip
    if (block.name === 'draft_entries'
        && (response.stop_reason === 'max_tokens' || !block.input.entries?.length)) {
      return res.json({
        type: 'reply',
        message: 'The slip ran off the end of the page and the draft came out incomplete. Give me a smaller batch, or bring the statement in as a CSV.',
      });
    }

    // the schema requires a message, but a model can still leave it out and
    // an empty bubble reads as a bug — so never ship one
    const say = (fallback) => String(block.input.message ?? '').trim() || fallback;

    if (block.name === 'reply') {
      return res.json({ type: 'reply', message: say('The book does not show that.') });
    }

    res.json({
      type: 'draft',
      message: say('Drafted and waiting. Press Post to enter them in the book.'),
      entries: (block.input.entries || []).slice(0, 25).map((e) => ({
        kind: KINDS.includes(e.kind) ? e.kind : 'expense',
        amount: money(e.amount) || '0.00',
        category: category(e.category),
        description: String(e.description || '').trim().slice(0, 160),
        date: (day(e.date) || new Date()).toISOString().slice(0, 10),
        source: 'vera',
      })),
    });
  } catch (err) {
    console.error('Vera error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/finance/categorize — Vera reads merchant names, nothing else
//
// This is the job she is actually good at. Parsing a statement is a job for
// the importer; naming what "SAFEWAY #1842 SAN JOSE CA" is happens to need a
// model. Pure: it writes nothing, it returns a map the client applies.
const SORT_SYSTEM = `You sort bank statement descriptions into spending categories.

Rules:
- One lowercase category per description. One or two words, no punctuation.
- Reuse a category from the existing list whenever it fits. Only invent one when nothing fits.
- Merchant noise is not a category. "SAFEWAY #1842 SAN JOSE CA" is groceries. "PEETS COFFEE #331" is dining. "CLIPPER CARD RELOAD" is transit. "PG&E AUTOPAY" is utilities. "RENT TRANSFER" is rent. "PAYROLL DEPOSIT" is salary.
- If a description is genuinely unreadable, answer "uncategorized" for it. Do not guess wildly.
- Return one assignment for every description you were given, in the same order.`;

const SORT_TOOL = [{
  name: 'assign',
  description: 'Assign a category to each description.',
  input_schema: {
    type: 'object',
    properties: {
      assignments: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            description: { type: 'string' },
            category: { type: 'string' },
          },
          required: ['description', 'category'],
        },
      },
    },
    required: ['assignments'],
  },
}];

router.post('/categorize', async (req, res) => {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(500).json({ error: 'Anthropic API key not configured.' });
    }
    const list = req.body?.descriptions;
    if (!Array.isArray(list) || !list.length) return res.status(400).json({ error: 'Nothing to sort' });
    if (list.length > 120) return res.status(413).json({ error: 'Sort at most 120 descriptions at a time' });

    const clean = [...new Set(list.map((d) => String(d ?? '').trim().slice(0, 160)).filter(Boolean))];
    if (!clean.length) return res.json({ map: {} });

    const known = await prisma.ledgerEntry.groupBy({
      by: ['category'],
      where: { userId: req.user.id, category: { not: 'uncategorized' } },
      _count: { _all: true },
      orderBy: { _count: { category: 'desc' } },
      take: 30,
    });

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const response = await client.messages.create({
      model: VERA_MODEL,
      max_tokens: 4096,
      system: `${SORT_SYSTEM}\n\nCategories already in this book: ${
        known.length ? known.map((k) => k.category).join(', ') : '(the book is new, choose sensible ones)'}`,
      tools: SORT_TOOL,
      tool_choice: { type: 'tool', name: 'assign' },
      messages: [{ role: 'user', content: clean.map((d, i) => `${i + 1}. ${d}`).join('\n') }],
    });

    const block = response.content.find((b) => b.type === 'tool_use');
    if (!block) return res.status(500).json({ error: 'Vera could not read that list.' });

    // a truncated list would silently leave the tail uncategorized, so say so
    const truncated = response.stop_reason === 'max_tokens';
    const map = {};
    for (const a of block.input.assignments || []) {
      const key = String(a.description ?? '').trim();
      if (key) map[key] = category(a.category);
    }
    res.json({ map, truncated, asked: clean.length, sorted: Object.keys(map).length });
  } catch (err) {
    console.error('Categorize error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
