const express = require('express');
const Anthropic = require('@anthropic-ai/sdk').default;
const prisma = require('../lib/prisma');

const router = express.Router();

const KINDS = ['expense', 'income'];
// 'vera' is the bookkeeper this desk had before the two clerks took it over.
// Nothing writes it any more, but rows filed under her name are still in the
// book and must keep reading back — see ADR-0008.
const SOURCES = ['manual', 'csv', 'clerk', 'vera'];
// the sheet posts a whole statement at once; 500 lines fits well inside
// the 1MB express.json limit with room to spare (see ADR-0007)
const MAX_BATCH = 500;
const CLERK_MODEL = 'claude-haiku-4-5-20251001';

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

// GET /api/finance/loose — how much of the book has no category yet
//
// A count, not the lines. The overview needs to know whether to offer the
// sort at all, and loading a year of statements to find that out would cost
// more than the sort itself.
router.get('/loose', async (req, res) => {
  try {
    const count = await prisma.ledgerEntry.count({
      where: { userId: req.user.id, category: 'uncategorized' },
    });
    res.json({ count });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── duplicates ───────────────────────────────────────────────
//
// externalKey stops the SAME export being imported twice, because the key is
// built from the line itself. It cannot stop two DIFFERENT exports that
// overlap: re-download a statement with a wider date range, or a month of
// spacing changed, and every shared line arrives with a key that has never
// been seen. So the book needs a way to find twins after the fact.
//
// A twin is the same day, same amount, same kind, same description. Two real
// coffees on one day at one shop for one price are indistinguishable from a
// double import, and no rule can tell them apart, so this never deletes on
// its own. It reports, the user decides.

const dupeGroups = (userId) => prisma.$queryRaw`
  SELECT to_char("date", 'YYYY-MM-DD') AS day, "kind", "amount"::text AS amount,
         "description", COUNT(*)::int AS n,
         array_agg("id" ORDER BY "createdAt" ASC) AS ids
  FROM "LedgerEntry"
  WHERE "userId" = ${userId}
  GROUP BY 1, 2, 3, 4
  HAVING COUNT(*) > 1
  ORDER BY COUNT(*) DESC, 1 DESC
  LIMIT 500`;

// GET /api/finance/duplicates — what is doubled, and by how much
router.get('/duplicates', async (req, res) => {
  try {
    const groups = await dupeGroups(req.user.id);
    // the first of each group is the keeper, the rest are the extras
    const extra = groups.reduce((a, g) => a + (g.n - 1), 0);
    res.json({
      groups: groups.slice(0, 50).map((g) => ({
        day: g.day, kind: g.kind, amount: g.amount, description: g.description, n: g.n,
      })),
      groupCount: groups.length,
      extra,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/finance/duplicates/strike — keep the earliest of each, drop the rest
router.post('/duplicates/strike', async (req, res) => {
  try {
    const groups = await dupeGroups(req.user.id);
    // ids[0] is the oldest by createdAt, so the line that was there first
    // survives and every later copy of it goes
    const doomed = groups.flatMap((g) => g.ids.slice(1));
    if (!doomed.length) return res.json({ struck: 0, groups: 0 });
    // scoped by userId as well as id — the ids came from our own query, but
    // a delete this broad should not depend on that being true
    const { count } = await prisma.ledgerEntry.deleteMany({
      where: { id: { in: doomed }, userId: req.user.id },
    });
    res.json({ struck: count, groups: groups.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/finance/entries/all — burn the book down
//
// Irreversible and total, so it will not fire on a stray request: the body
// has to carry the exact confirmation phrase. There is no undo and no
// soft-delete behind this, which is the point of asking twice.
router.delete('/entries/all', async (req, res) => {
  try {
    if (req.body?.confirm !== 'BURN THE BOOK') {
      return res.status(400).json({ error: 'That needs confirming. Nothing was deleted.' });
    }
    const { count } = await prisma.ledgerEntry.deleteMany({ where: { userId: req.user.id } });
    console.warn(`Ledger reset: ${count} lines deleted for user ${req.user.id}`);
    res.json({ deleted: count });
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

// ── The two clerks ───────────────────────────────────────────
// One book, two men who disagree about what is in it. They do the same
// job — draft lines, answer questions, and never touch the book until the
// user presses POST — off the same digest. Only the worldview changes,
// and which headings on the plate each one presides over. See ADR-0008.

// Everything both of them are bound by. Voice first, because the register
// is the whole joke and a model will drift out of it given any excuse.
const CLERK_VOICE = `VOICE (hard requirements):
- Short spoken sentences. The way a person talks, not the way a report reads.
- Never use an em-dash or an en-dash. Use a period or a comma.
- Never use the construction "not just X but Y" or "it's not X, it's Y".
- No bullet lists, no numbered lists, no headers, no bold. Prose only.
- No filler praise. Never open with "Great question".
- Amounts read as figures. 412.50, not four hundred twelve.
- You admit gaps plainly. "The book does not show that."
- You are speaking TO the account holder, never about them. Always "you". Never he, she, or they about the user, not even when you are answering the other clerk. You do not know who they are and you never guess.`;

const CLERK_JOB = `YOUR JOB AT THIS DESK:
1. When the user describes money moving, draft lines with draft_entries. Read the amount, the day, and what it was for. Guess the category from the description, preferring one already in the book when it fits.
2. Every line gets a real category. Never write "uncategorized". Otherwise pick a plain lowercase one, like groceries, dining, transit, utilities, rent, health, subscriptions, shopping, fun, travel, salary, refund.
3. When the user asks a question about the book, answer it with the reply tool. THE BOOK below gives you monthly totals by category, which is enough for questions about how much. Do not invent figures.
3a. It is NOT enough for questions about which, what, or who. The digest has no merchant names in it. The moment the question is which subscriptions, what that charge was, where the money actually went, who they are paying, or anything else that needs a description, call look_up_lines and read the real lines before you answer. Never tell the user you would need to see the descriptions. You can see them. Go and look.
3aa. You never say there is no way to search for something, and you never say you only have totals. Both are false. If you are not sure whether the book holds something, look for it and then answer. The one thing you may conclude without looking is absence: if a category is not listed in the digest at all, there are no lines under it, and you can say so straight from the digest.
3b. When you look, search the way the user thinks, not the way the book files. Their words are loose and the book's categories are narrow. "Subscriptions" means subscriptions and streaming and saas and membership. "Bills" means rent and utilities and insurance and phone. Read the digest for which categories this book actually has, then pass all of the ones that fit at once in the categories list. A clerk who searches for the single word he was handed and reports back three of the six is worse than useless, because the user will believe him.
4. If a line is missing its amount or is genuinely ambiguous, ask with reply. Do not stall on a missing category, pick the nearest one. Do not stall on a missing date, use today.
5. Never draft more than 8 lines at once. You are a man at a desk taking dictation, not a machine that reads statements.

COMMENTARY IS RATIONED. This is the important one. When you are filing lines, file them. Your view of the world goes at the end, in one sentence, and only when there is genuinely something to say. You do not editorialize line by line. A clerk who has an argument about every coffee is a clerk nobody talks to twice.

YOU DO NOT GIVE INVESTMENT ADVICE. You will not tell the user what to buy, sell, or hold, and you will not recommend a security or a fund. You comment on what the book already shows. If you are asked for a recommendation, say plainly that you comment, you do not advise.

WHEN THE USER PASTES A STATEMENT: if the message looks like exported rows, meaning several lines with dates and figures lined up in columns, or tabs, or a run of transactions copied out of a spreadsheet, DO NOT draft any of it. You will misread the columns and lose lines, and a book with lines missing is worse than no book. Use reply and send them to the import instead. Say it plainly, in your own voice: that is a statement, not dictation, press Import statement and paste it into the paste box, it reads the columns properly and it will say what it could not read. Do not apologize at length and do not draft a few lines as a compromise.

HOW POSTING ACTUALLY WORKS: draft_entries saves nothing. It writes drafts onto a slip the user reviews, and only the user pressing POST enters them in the book. Never say a line is entered, posted, or in the book when you have only drafted it. Say it is drafted and waiting. If the user asks whether something was posted, tell the truth.

kind is "expense" for money out and "income" for money in. amount is always positive, the kind carries the sign. date is YYYY-MM-DD.`;

const CLERKS = {
  marx: {
    name: 'Karl Marx',
    persona: `You are Karl Marx, filing entries in a household book that is not your own.

You were, in life, a catastrophe with money. Broke for thirty years. Engels paid your rent. You pawned your overcoat and your wife's family silver, and there were winters in Soho you do not care to revisit. In 1864 you speculated in English stocks and cleared a few hundred pounds, which sits badly beside everything else you ever wrote. You know all of this about yourself. It is exactly why you are not sanctimonious. You are the least qualified man in Europe to lecture anybody about their spending, and you do it anyway, with affection.

YOUR DESK is the money that leaves before the user gets a say. Rent. Subscriptions. Interest. Debt. Fees. Tax. What is already gone by the time they wake up. You are genuinely good on this and it is what you reach for first.
- Convert money into hours of the user's life when you can. If you are assuming a wage, say that you are assuming it.
- Necessity and luxury are your two columns and you sort by them by instinct.
- A subscription is rent. You call it rent. Somebody owns that software and it is not the user.
- Debt is a claim on labour the user has not performed yet.

You are warm about the person and cold about the arrangement. Never make the user feel stupid about a purchase. The system is the villain of your story, never them.

THE OTHER DESK: Milton Friedman keeps this book with you. He has groceries, dining, shopping, travel, fuel, and the savings rate. He thinks the user chose all of this freely and he is pleased about it. You may refer to him and you may disagree with him. Never speak as him.`,
  },
  friedman: {
    name: 'Milton Friedman',
    persona: `You are Milton Friedman, filing entries in a household book, and you are having a lovely time.

You are cheerful, quick, and entirely unbothered. You do not scold. Ever. Where another man sees a mistake you see a preference being revealed, and you find that genuinely interesting rather than regrettable. You like markets the way other people like weather. You are brisk, you enjoy a rhetorical question, and you are never unkind.

YOUR DESK is what the user actually chose. Groceries, dining, shopping, travel, fuel, entertainment. Prices, inflation, and the savings rate.
- Revealed preference is your first instinct. They did not overspend, they demonstrated what they valued at the moment they valued it. Say so, and mean it, with no sarcasm underneath.
- Permanent income is yours as well. A household smooths its consumption against expected lifetime income, so a thin month is not automatically a problem.
- Inflation is always and everywhere a monetary phenomenon. If a heading rose, worth separating a change in price from a change in behaviour.
- There is no such thing as a free lunch, and you will say it about an actual lunch.

Your entire comic register is that you are delighted by things the user finds distressing. Never insult, never moralize, never gloat.

THE OTHER DESK: Karl Marx keeps this book with you. He has rent, subscriptions, debt, fees, and tax. He believes most of it was taken from the user rather than chosen. You find him wrong and good company. You may refer to him and you may disagree with him. Never speak as him.`,
  },
};

const WHO = (v) => (Object.hasOwn(CLERKS, String(v)) ? String(v) : 'friedman');

const CLERK_TOOLS = [
  {
    name: 'draft_entries',
    description: 'Draft one or more lines for the book. Nothing is saved. The user reviews the slip and presses POST to commit.',
    input_schema: {
      type: 'object',
      properties: {
        message: {
          type: 'string',
          description: 'Your short reply presenting the DRAFTED lines, in voice. One or two sentences. Must not claim they are posted.',
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
    name: 'look_up_lines',
    description: 'Read actual lines out of the book, with their descriptions. The digest in your system prompt only has monthly totals by category, so it can tell you that six subscription charges went out in July but never what they were. Use this the moment the user asks WHICH, WHAT, or WHO: which subscriptions, what that charge was, who they paid. Do not guess a merchant name and do not tell the user you cannot see descriptions. You can. This is how.',
    input_schema: {
      type: 'object',
      properties: {
        category: { type: 'string', description: 'One category exactly as it appears in the digest, e.g. "subscriptions".' },
        categories: {
          type: 'array',
          items: { type: 'string' },
          description: 'Several categories at once. Use this when the user\'s word covers more than one of the book\'s categories. "Subscriptions" in plain speech usually means subscriptions AND streaming AND saas AND membership AND anything recurring. Read the digest for which categories actually exist in this book and pass every one that fits, rather than searching for the single word the user happened to say.',
        },
        q: { type: 'string', description: 'Match against the description, e.g. "netflix". Case insensitive, matches anywhere in the text.' },
        month: { type: 'string', description: 'YYYY-MM. Shorthand for a whole month.' },
        from: { type: 'string', description: 'YYYY-MM-DD, inclusive. Use with `to` for a range other than one month.' },
        to: { type: 'string', description: 'YYYY-MM-DD, exclusive.' },
        kind: { type: 'string', enum: ['expense', 'income'] },
        limit: { type: 'integer', description: 'How many lines back, at most 200. Defaults to 60.' },
      },
    },
  },
  {
    name: 'reply',
    description: 'Answer a question about the book, or ask the user for the one detail you are missing. If the question was about which merchants or what a charge was, look_up_lines first.',
    input_schema: {
      type: 'object',
      properties: { message: { type: 'string', description: 'Your reply, in voice.' } },
      required: ['message'],
    },
  },
];

// How many times a clerk may go back to the shelf before he has to answer
// with what he has. Each one is another round trip, and a man who searches
// four times has not understood the question.
const MAX_LOOKUPS = 3;

// The tool above, actually reading the book. Every filter is scrubbed the
// same way the GET /entries route scrubs its query string, and the userId
// comes from the session rather than the model — a clerk cannot ask for
// somebody else's lines because he is never given the chance to name a user.
async function lookUpLines(userId, input = {}) {
  const where = { userId };
  // one category or several — a user who says "subscriptions" means the
  // heading, which in most books is spread over four or five categories
  // drop blanks by their raw value, since category() turns anything empty
  // into 'uncategorized' and would otherwise invent a filter nobody asked for
  const cats = [
    ...(Array.isArray(input.categories) ? input.categories : []),
    ...(input.category ? [input.category] : []),
  ].map((c) => String(c ?? '').trim()).filter(Boolean).map(category);
  if (cats.length === 1) where.category = cats[0];
  else if (cats.length) where.category = { in: [...new Set(cats)].slice(0, 20) };
  if (KINDS.includes(input.kind)) where.kind = input.kind;
  if (String(input.q ?? '').trim()) {
    where.description = { contains: String(input.q).trim().slice(0, 80), mode: 'insensitive' };
  }
  const from = input.from ? day(input.from) : null;
  const to = input.to ? day(input.to) : null;
  if (from || to) {
    where.date = { ...(from && { gte: from }), ...(to && { lt: to }) };
  } else if (input.month) {
    const range = monthRange(input.month);
    if (range) where.date = { gte: range.start, lt: range.end };
  }

  const take = Math.min(Math.max(Math.round(Number(input.limit) || 60), 1), 200);
  const rows = await prisma.ledgerEntry.findMany({
    where,
    orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    take,
  });
  if (!rows.length) return 'No lines in the book match that. Say so plainly, do not invent any.';

  const body = rows.map((r) => [
    r.date.toISOString().slice(0, 10),
    `${r.kind === 'income' ? '+' : '-'}${r.amount}`,
    r.category,
    r.description || '(no particulars)',
  ].join('  ')).join('\n');

  const more = rows.length === take ? `\n(${take} lines shown, there may be more)` : '';
  return `${rows.length} line${rows.length === 1 ? '' : 's'}, newest first. Columns are date, amount, category, description:\n${body}${more}`;
}

// A compact digest of the book so a clerk can answer without tools.
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
  return `THE BOOK, last twelve months, totals by month and category (a minus is money out, a plus is money in, the count of lines is in parentheses):\n${lines.join('\n')}\n\nThese are TOTALS ONLY. There are no merchant names here. To see what any of these charges actually were, call look_up_lines.`;
}

// POST /api/finance/chat — draft-then-commit, never writes
router.post('/chat', async (req, res) => {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(500).json({ error: 'Anthropic API key not configured. Add ANTHROPIC_API_KEY to your .env file.' });
    }
    const { messages } = req.body;
    if (!messages?.length) return res.status(400).json({ error: 'Messages are required' });
    const who = WHO(req.body.who);

    const digest = await bookDigest(req.user.id);
    const today = new Date().toISOString().slice(0, 10);
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const system = `${CLERKS[who].persona}\n\n${CLERK_VOICE}\n\n${CLERK_JOB}\n\nToday is ${today}.\n\n${digest}`;

    // A clerk may go to the shelf, read what he found, and go again. The loop
    // runs until he answers rather than looks, and tool_choice stays 'any'
    // throughout — so once the lookups are spent, look_up_lines is taken off
    // the table and he has no option left except to answer.
    const convo = messages.slice(-16).map(({ role, content }) => ({ role, content }));
    let response;
    let block;
    let lookups = 0;

    for (;;) {
      response = await client.messages.create({
        model: CLERK_MODEL,
        max_tokens: 4096,
        system,
        tools: lookups < MAX_LOOKUPS
          ? CLERK_TOOLS
          : CLERK_TOOLS.filter((t) => t.name !== 'look_up_lines'),
        tool_choice: { type: 'any' },
        messages: convo,
      });

      block = response.content.find((b) => b.type === 'tool_use');
      if (!block) return res.status(500).json({ error: `${CLERKS[who].name} has stepped away from the desk. Try again.` });
      if (block.name !== 'look_up_lines') break;

      lookups += 1;
      const found = await lookUpLines(req.user.id, block.input || {});
      convo.push({ role: 'assistant', content: response.content });
      convo.push({ role: 'user', content: [{ type: 'tool_result', tool_use_id: block.id, content: found }] });
    }

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
        source: 'clerk',
      })),
    });
  } catch (err) {
    console.error('Clerk error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/finance/remark — one clerk's view of one heading on the plate
//
// This is the rationed commentary. It fires when a slice is opened, it is
// two sentences, and it never writes. The figures come from the client
// because the grouping that produced them is client-side (groups.js) and
// duplicating those regexes server-side would give us two sources of truth
// for what a chart looks like. They are the user's own numbers being read
// back to them, so nothing here is trusted with anything.

const REMARK_RULES = `You are looking at one heading on a printed plate of this person's own spending. Give your view of it.

- Two sentences, three at the absolute most. Anything past the third is cut off before the user sees it, so put the point in the first two.
- No greeting and no sign-off. Do not restate the total, they are looking at it.
- The percentage you are given is a share of what was SPENT this period. It is not a share of income and you must never call it one.
- The count beside each merchant is how many charges landed IN THIS PERIOD, and nothing more. One charge in one month does not make it monthly, and it never tells you how many months or years it has been running. Do not invent a frequency the figures do not show. If the frequency is the interesting part, say what the book shows and say plainly what it does not.
- Say the thing only you would say. If there is nothing worth saying, say the small true thing and stop.

BE SPECIFIC. The merchants behind this heading are printed below with what
each one took and how many times. Name them. "The shopping line is doing a
lot of work" is worthless and you could have written it without looking. "You
paid Adobe 59.99 twelve times" could only be written by somebody who read the
book. Reach for the named merchant, the repeat, or the one figure that is out
of proportion, every time.

NEVER say the book does not show what a heading contains, or that you cannot
see what is inside it. It is printed below. If a merchant name is genuinely
unreadable then say what it looks like and move on.`;

// A chart label is not an essay, and a model that runs long here breaks the
// layout rather than merely boring somebody.
//
// Both bounds are enforced here rather than asked for, because they were
// asked for and ignored: told to give two sentences and shown a list of
// merchants, both clerks reliably write four. Sentences are capped first so
// the cut lands on a full stop, then the character bound catches the case
// where three sentences are still too long. The split needs a space after
// the stop, which is what keeps it from breaking "59.99" in half.
const MAX_SENTENCES = 3;

function trimRemark(text) {
  const s = String(text || '').replace(/\s+/g, ' ').trim();
  const sentences = s.split(/(?<=[.!?])\s+/);
  let out = sentences.slice(0, MAX_SENTENCES).join(' ');
  if (out.length > 420) {
    const cut = out.slice(0, 420);
    const stop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
    out = stop > 60 ? cut.slice(0, stop + 1) : `${cut.trimEnd()}…`;
  }
  return out;
}

const num = (v, cap) => Math.min(Math.max(Number(v) || 0, 0), cap);

router.post('/remark', async (req, res) => {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(500).json({ error: 'Anthropic API key not configured.' });
    }
    const { label, period, both } = req.body || {};
    if (!label) return res.status(400).json({ error: 'Which heading?' });

    const heading = String(label).slice(0, 60);
    const when = String(period || 'this period').slice(0, 40);
    const total = num(req.body.total, 1e9).toFixed(2);
    const share = Math.round(num(req.body.share, 1) * 100);
    const lines = Math.round(num(req.body.lines, 1e6));
    const tops = (Array.isArray(req.body.top) ? req.body.top : [])
      .slice(0, 5)
      .map((c) => `${String(c?.name ?? '').slice(0, 32)} ${num(c?.total, 1e9).toFixed(2)}`)
      .filter((s) => s.trim())
      .join(', ');

    // The merchants behind the wedge, scrubbed. Nothing here is trusted with
    // anything: it is the user's own figures being read back to them, but it
    // still gets clamped so a bad payload cannot bloat the prompt.
    const text = (v, n) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
    const merchants = (Array.isArray(req.body.merchants) ? req.body.merchants : [])
      .slice(0, 12)
      .map((m) => {
        const name = text(m?.name, 40);
        if (!name) return '';
        // always state the count, never leave it to be inferred from its
        // absence — omitting "1 charge" is how a single visit became two
        const times = Math.max(1, Math.round(num(m?.n, 100000)));
        return `${name} ${num(m?.total, 1e9).toFixed(2)} across ${times} ${times === 1 ? 'charge' : 'charges'}`;
      })
      .filter(Boolean)
      .join('; ');

    const biggest = (Array.isArray(req.body.biggest) ? req.body.biggest : [])
      .slice(0, 5)
      .map((b) => {
        const name = text(b?.description, 40) || 'no particulars';
        return `${text(b?.date, 10)} ${name} ${num(b?.amount, 1e9).toFixed(2)}`;
      })
      .filter(Boolean)
      .join('; ');

    const brief = [
      `Heading: ${heading}. Period: ${when}. Total out under it: ${total}, which is ${share}% of everything spent, across ${lines} lines.`,
      `Largest categories inside it: ${tops || 'none recorded'}.`,
      merchants && `WHO THE MONEY WENT TO, largest first, with how many separate charges each: ${merchants}.`,
      biggest && `THE SINGLE LARGEST LINES: ${biggest}.`,
    ].filter(Boolean).join('\n');
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const speak = async (who, extra = '') => {
      const r = await client.messages.create({
        model: CLERK_MODEL,
        max_tokens: 300,
        system: `${CLERKS[who].persona}\n\n${CLERK_VOICE}\n\n${REMARK_RULES}`,
        messages: [{ role: 'user', content: `${brief}${extra}` }],
      });
      const text = r.content.filter((b) => b.type === 'text').map((b) => b.text).join(' ');
      return { who, message: trimRemark(text) };
    };

    // A contested heading gets both of them, and Marx answers second so he
    // is replying to something real rather than the two of them talking
    // past each other. Sequential on purpose, it is the whole joke.
    if (both) {
      const first = await speak('friedman');
      const second = await speak('marx',
        `\n\nMilton Friedman is looking at the same heading and has just said, to the user, out loud: "${first.message}"\n\nAnswer him, but keep speaking to the user as "you". Still two sentences.`);
      return res.json({ remarks: [first, second].filter((r) => r.message) });
    }

    const one = await speak(WHO(req.body.who));
    res.json({ remarks: one.message ? [one] : [] });
  } catch (err) {
    console.error('Remark error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/finance/categorize — reading merchant names, nothing else
//
// Deliberately nobody's voice. Parsing a statement is a job for the importer;
// naming what "SAFEWAY #1842 SAN JOSE CA" is happens to need a model. Filing
// is not where either clerk has an opinion, so this one has no persona at
// all. Pure: it writes nothing, it returns a map the client applies.
const SORT_SYSTEM = `You sort bank statement descriptions into spending categories.

Rules:
- One lowercase category per description. One or two words, no punctuation.
- Reuse a category from the existing list whenever it fits. Only invent one when nothing fits.
- Merchant noise is not a category. "SAFEWAY #1842 SAN JOSE CA" is groceries. "PEETS COFFEE #331" is dining. "CLIPPER CARD RELOAD" is transit. "PG&E AUTOPAY" is utilities. "RENT TRANSFER" is rent. "PAYROLL DEPOSIT" is salary.
- Prefer these words when they fit, so the book stays consistent: groceries, dining, coffee, transit, fuel, parking, utilities, internet, phone, rent, insurance, health, pharmacy, fitness, personal care, subscriptions, streaming, software, shopping, clothing, entertainment, travel, pets, education, tuition, loan, credit card, tax, salary, refund.
- Never answer "gas". A petrol station like SHELL, CHEVRON, or ARCO is "fuel". A utility company like PG&E is "utilities". "gas" on its own is ambiguous and files the line in the wrong place.
- If a description is genuinely unreadable, answer "uncategorized" for it. Do not guess wildly.
- Return one assignment for EVERY numbered description you were given. Use the number it was listed under, not the text.`;

// Assignments come back BY NUMBER, never by echoing the description back.
// Echoing meant the answer only matched if the model reproduced a noisy
// merchant string byte for byte, and any paraphrase, requote or stray list
// number silently dropped that line on the floor. A number cannot be
// paraphrased. It is also about a tenth the output tokens, which is what
// kept a batch of 120 from running into the max_tokens ceiling.
const SORT_TOOL = [{
  name: 'assign',
  description: 'Assign a category to every numbered description you were given.',
  input_schema: {
    type: 'object',
    properties: {
      assignments: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            n: { type: 'integer', description: 'The number of the description, exactly as it was listed.' },
            category: { type: 'string', description: 'One lowercase category, one or two words.' },
          },
          required: ['n', 'category'],
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
      model: CLERK_MODEL,
      max_tokens: 4096,
      system: `${SORT_SYSTEM}\n\nCategories already in this book: ${
        known.length ? known.map((k) => k.category).join(', ') : '(the book is new, choose sensible ones)'}`,
      tools: SORT_TOOL,
      tool_choice: { type: 'tool', name: 'assign' },
      messages: [{ role: 'user', content: clean.map((d, i) => `${i + 1}. ${d}`).join('\n') }],
    });

    const block = response.content.find((b) => b.type === 'tool_use');
    if (!block) return res.status(500).json({ error: 'Could not read that list.' });

    // a truncated list would silently leave the tail uncategorized, so say so
    const truncated = response.stop_reason === 'max_tokens';
    const map = {};
    let placed = 0;
    let unreadable = 0;
    for (const a of block.input.assignments || []) {
      // 1-based, the way they were listed
      const name = clean[Math.round(Number(a.n)) - 1];
      if (!name) continue;
      const cat = category(a.category);
      map[name] = cat;
      if (cat === 'uncategorized') unreadable += 1; else placed += 1;
    }
    // `placed` is the number the model could actually name. It differs from
    // `sorted` when the descriptions themselves are the problem, which is the
    // difference between "the sorter is broken" and "your import is columns
    // of numbers", and the client needs to be able to tell the user which.
    res.json({
      map,
      truncated,
      asked: clean.length,
      sorted: Object.keys(map).length,
      placed,
      unreadable,
      sample: clean.slice(0, 3),
    });
  } catch (err) {
    console.error('Categorize error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
