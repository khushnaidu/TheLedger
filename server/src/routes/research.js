const express = require('express');
const prisma = require('../lib/prisma');
const { Prisma } = require('@prisma/client');

const router = express.Router();

const COLORS = ['marigold', 'rose', 'sage', 'ink'];
const STATUSES = ['processing', 'ready', 'scanned'];
// per-page text cap — a dense academic page runs ~3K chars, 15K is a poster
const MAX_PAGE_TEXT = 15_000;
// reject ingestion batches before express's own 1mb limit turns them opaque
const MAX_BATCH_BYTES = 900_000;

const ownPaper = (id, userId) => prisma.paper.findFirst({ where: { id, userId } });

// ── Collections (the catalog drawers) ─────────────────────────

router.get('/collections', async (req, res) => {
  try {
    const collections = await prisma.collection.findMany({
      where: { userId: req.user.id },
      orderBy: { name: 'asc' },
      include: { _count: { select: { papers: true } } },
    });
    res.json(collections);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/collections', async (req, res) => {
  try {
    const name = req.body.name?.trim().slice(0, 40);
    if (!name) return res.status(400).json({ error: 'A drawer needs a label' });
    const existing = await prisma.collection.findFirst({ where: { name, userId: req.user.id } });
    if (existing) return res.status(400).json({ error: 'That drawer already exists' });
    const collection = await prisma.collection.create({ data: { name, userId: req.user.id } });
    res.status(201).json(collection);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/collections/:id', async (req, res) => {
  try {
    const owned = await prisma.collection.findFirst({ where: { id: req.params.id, userId: req.user.id } });
    if (!owned) return res.status(404).json({ error: 'Drawer not found' });
    const name = req.body.name?.trim().slice(0, 40);
    if (!name) return res.status(400).json({ error: 'A drawer needs a label' });
    const collection = await prisma.collection.update({ where: { id: owned.id }, data: { name } });
    res.json(collection);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/collections/:id', async (req, res) => {
  try {
    const owned = await prisma.collection.findFirst({ where: { id: req.params.id, userId: req.user.id } });
    if (!owned) return res.status(404).json({ error: 'Drawer not found' });
    // papers go unfiled via onDelete: SetNull
    await prisma.collection.delete({ where: { id: owned.id } });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Papers ────────────────────────────────────────────────────

router.get('/papers', async (req, res) => {
  try {
    const papers = await prisma.paper.findMany({
      where: { userId: req.user.id },
      orderBy: { updatedAt: 'desc' },
      include: { _count: { select: { annotations: true } } },
    });
    res.json(papers);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/papers', async (req, res) => {
  try {
    const { title, authors, year, blobUrl, fileName, pageCount, collectionId } = req.body;
    if (!title?.trim()) return res.status(400).json({ error: 'A paper needs a title' });
    if (!blobUrl) return res.status(400).json({ error: 'Missing the uploaded file' });
    // filing straight into a drawer at intake — own drawers only
    let fileInto = null;
    if (collectionId) {
      const drawer = await prisma.collection.findFirst({ where: { id: collectionId, userId: req.user.id } });
      if (drawer) fileInto = drawer.id;
    }
    const paper = await prisma.paper.create({
      data: {
        title: title.trim().slice(0, 200),
        authors: (authors || '').trim().slice(0, 300),
        year: Number.isInteger(year) ? year : null,
        blobUrl,
        fileName: (fileName || '').slice(0, 200),
        pageCount: Number.isInteger(pageCount) ? pageCount : 0,
        collectionId: fileInto,
        userId: req.user.id,
      },
    });
    res.status(201).json(paper);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/papers/:id', async (req, res) => {
  try {
    // annotations ride along; page texts never do (they can be hundreds of KB)
    const paper = await prisma.paper.findFirst({
      where: { id: req.params.id, userId: req.user.id },
      include: { annotations: { orderBy: [{ page: 'asc' }, { createdAt: 'asc' }] } },
    });
    if (!paper) return res.status(404).json({ error: 'Paper not found' });
    res.json(paper);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/papers/:id', async (req, res) => {
  try {
    const owned = await ownPaper(req.params.id, req.user.id);
    if (!owned) return res.status(404).json({ error: 'Paper not found' });
    const data = {};
    const { title, authors, year, collectionId, status, pageCount } = req.body;
    if (title !== undefined) {
      if (!title.trim()) return res.status(400).json({ error: 'A paper needs a title' });
      data.title = title.trim().slice(0, 200);
    }
    if (authors !== undefined) data.authors = (authors || '').trim().slice(0, 300);
    if (year !== undefined) data.year = Number.isInteger(year) ? year : null;
    if (status !== undefined) {
      if (!STATUSES.includes(status)) return res.status(400).json({ error: 'Bad status' });
      data.status = status;
    }
    if (pageCount !== undefined && Number.isInteger(pageCount)) data.pageCount = pageCount;
    if (collectionId !== undefined) {
      if (collectionId === null) data.collectionId = null;
      else {
        const drawer = await prisma.collection.findFirst({ where: { id: collectionId, userId: req.user.id } });
        if (!drawer) return res.status(404).json({ error: 'Drawer not found' });
        data.collectionId = drawer.id;
      }
    }
    const paper = await prisma.paper.update({ where: { id: owned.id }, data });
    res.json(paper);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/papers/:id', async (req, res) => {
  try {
    const owned = await ownPaper(req.params.id, req.user.id);
    if (!owned) return res.status(404).json({ error: 'Paper not found' });
    await prisma.paper.delete({ where: { id: owned.id } });
    // the blob is orphaned otherwise; a failure here must never block the delete
    try {
      const { del } = require('@vercel/blob');
      await del(owned.blobUrl);
    } catch { /* best-effort */ }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Page text ingestion (client-side pdfjs extraction lands here) ──

router.delete('/papers/:id/pages', async (req, res) => {
  try {
    const owned = await ownPaper(req.params.id, req.user.id);
    if (!owned) return res.status(404).json({ error: 'Paper not found' });
    await prisma.paperPage.deleteMany({ where: { paperId: owned.id } });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/papers/:id/pages', async (req, res) => {
  try {
    const owned = await ownPaper(req.params.id, req.user.id);
    if (!owned) return res.status(404).json({ error: 'Paper not found' });
    if (JSON.stringify(req.body).length > MAX_BATCH_BYTES) {
      return res.status(413).json({ error: 'Send smaller batches' });
    }
    const pages = req.body.pages;
    if (!Array.isArray(pages) || !pages.length) return res.status(400).json({ error: 'No pages' });
    const data = pages
      .filter((p) => Number.isInteger(p.pageNumber) && p.pageNumber >= 1 && typeof p.text === 'string')
      .map((p) => ({ paperId: owned.id, pageNumber: p.pageNumber, text: p.text.slice(0, MAX_PAGE_TEXT) }));
    const result = await prisma.paperPage.createMany({ data, skipDuplicates: true });
    res.json({ ok: true, count: result.count });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Annotations ───────────────────────────────────────────────

const validRects = (rects) =>
  Array.isArray(rects) && rects.length >= 1 && rects.length <= 40 &&
  rects.every((r) => r && ['x', 'y', 'w', 'h'].every((k) => typeof r[k] === 'number' && Number.isFinite(r[k])));

router.post('/papers/:id/annotations', async (req, res) => {
  try {
    const owned = await ownPaper(req.params.id, req.user.id);
    if (!owned) return res.status(404).json({ error: 'Paper not found' });
    const { page, rects, quote, note, color } = req.body;
    if (!Number.isInteger(page) || page < 1) return res.status(400).json({ error: 'Bad page' });
    if (!validRects(rects)) return res.status(400).json({ error: 'Bad rects' });
    if (typeof quote !== 'string' || !quote.trim()) return res.status(400).json({ error: 'Nothing selected' });
    const annotation = await prisma.annotation.create({
      data: {
        paperId: owned.id,
        page,
        rects: rects.map((r) => ({ x: r.x, y: r.y, w: r.w, h: r.h })),
        quote: quote.trim().slice(0, 1000),
        note: (note || '').slice(0, 2000),
        color: COLORS.includes(color) ? color : 'marigold',
      },
    });
    res.status(201).json(annotation);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/papers/:id/annotations/:annId', async (req, res) => {
  try {
    const owned = await prisma.annotation.findFirst({
      where: { id: req.params.annId, paper: { id: req.params.id, userId: req.user.id } },
    });
    if (!owned) return res.status(404).json({ error: 'Annotation not found' });
    const data = {};
    if (req.body.note !== undefined) data.note = String(req.body.note).slice(0, 2000);
    if (req.body.color !== undefined) {
      if (!COLORS.includes(req.body.color)) return res.status(400).json({ error: 'Bad color' });
      data.color = req.body.color;
    }
    const annotation = await prisma.annotation.update({ where: { id: owned.id }, data });
    res.json(annotation);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/papers/:id/annotations/:annId', async (req, res) => {
  try {
    const owned = await prisma.annotation.findFirst({
      where: { id: req.params.annId, paper: { id: req.params.id, userId: req.user.id } },
    });
    if (!owned) return res.status(404).json({ error: 'Annotation not found' });
    await prisma.annotation.delete({ where: { id: owned.id } });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Jane, the resident consultant ─────────────────────────────
// Stateless text-in/text-out on sonnet — no tool forcing (Gus needs tools
// for machine-committable drafts; Jane's product is prose). Citations are
// a [p:N] / [Title, p:N] micro-format the client linkifies. See ADR-0005.

const JANE_MODEL = 'claude-sonnet-5';

// Jane's answers were being cut off at 1500 tokens with nothing to say so.
//
// The cap was only half of it. Sonnet emits thinking blocks before its prose,
// and that thinking is spent out of the SAME max_tokens. At 1500 the thinking
// could eat most of the budget and leave a stub, or eat all of it and leave no
// text block at all — which this route then reported as an unexplained 500.
// Any ceiling here has to cover the thinking as well as the answer.
//
// The model itself will take 128,000 here, but three ceilings sit below that
// and the lowest one wins. The SDK refuses any non-streaming request it
// estimates could run past ten minutes, measured at ~21,340 for this model.
// Below that, vercel.json caps the function at 60 seconds. And below THAT,
// a paper-mode request spends the first seconds prefilling up to 150K chars
// of context before a token comes back. What is left fits roughly four to
// five thousand tokens of prose.
//
// So a ceiling far above this does not buy longer answers, it trades a
// truncated answer for a 504 and no answer at all. 8000 is comfortably more
// than any real reply needs while still landing inside the function.
// Genuinely unbounded answers need streaming, which is a different change.
const JANE_MAX_TOKENS = 8000;
const CONTEXT_CHAR_BUDGET = 150_000; // paper mode ceiling (~38K tokens)
const LIBRARY_LIMIT = 20;

const JANE_SYSTEM = `You are Jane, the resident consultant of THE LEDGER's Reading Room. You read the user's research papers and help them think. You are very sharp, endlessly curious, and economical with words. You notice small details in the text and deduce from them. When you infer something, say what you observed first, then the inference.

VOICE RULES (hard requirements):
- Short spoken sentences. Like a person talking, thinking out loud.
- Never use an em-dash or en-dash. Use a period or a comma instead.
- Never use the construction "not just X but Y" or "it's not X, it's Y".
- No bullet lists, no numbered lists, no headers, no bold. Prose only.
- No filler praise. Never open with "Great question".
- Admit gaps plainly: "The pages I have don't say."

CITATIONS (hard requirement):
- You only know what is in the PROVIDED PAGES below. Cite every claim.
- Same-paper cite: [p:4]. Cross-library cite: [Attention Is All You Need, p:3].
- Quote at most one short phrase per claim, in quotation marks, then the cite.`;

// FTS over extracted page text. The tsvector expression must stay
// byte-identical to the GIN index in the reading_room migration.
async function retrievePages(userId, q, { paperId = null, limit = 12 } = {}) {
  try {
    return await prisma.$queryRaw`
      SELECT pp."paperId", pp."pageNumber", pp."text", p."title", p."authors", p."year",
             ts_rank(to_tsvector('english', pp."text"), websearch_to_tsquery('english', ${q})) AS rank
      FROM "PaperPage" pp JOIN "Paper" p ON p."id" = pp."paperId"
      WHERE p."userId" = ${userId}
        ${paperId ? Prisma.sql`AND pp."paperId" = ${paperId}` : Prisma.empty}
        AND to_tsvector('english', pp."text") @@ websearch_to_tsquery('english', ${q})
      ORDER BY rank DESC LIMIT ${limit}`;
  } catch {
    return []; // pathological tsquery input — callers fall back to recency
  }
}

async function paperContext(paper, lastUserText, currentPage) {
  if (paper.status === 'scanned') return { header: `"${paper.title}" is a scanned PDF with no extractable text. Say so plainly when asked about its contents.`, body: '' };
  const pages = await prisma.paperPage.findMany({
    where: { paperId: paper.id },
    orderBy: { pageNumber: 'asc' },
  });
  if (!pages.length) return { header: `No text has been extracted from "${paper.title}" yet. Say so plainly.`, body: '' };

  const renderPage = (p) => `=== PAGE ${p.pageNumber} ===\n${p.text}`;
  const whole = pages.map(renderPage).join('\n\n');
  if (whole.length <= CONTEXT_CHAR_BUDGET) return { header: '', body: whole };

  // long paper: front matter + where the user is reading + in-paper retrieval
  const want = new Set([1, 2, 3]);
  if (Number.isInteger(currentPage)) [currentPage - 1, currentPage, currentPage + 1].forEach((n) => want.add(n));
  const hits = await retrievePages(paper.userId, lastUserText, { paperId: paper.id, limit: 15 });
  hits.forEach((h) => want.add(h.pageNumber));
  let picked = pages.filter((p) => want.has(p.pageNumber));
  let body = '';
  for (const p of picked) {
    const block = renderPage(p);
    if (body.length + block.length > CONTEXT_CHAR_BUDGET) break;
    body += (body ? '\n\n' : '') + block;
  }
  return { header: 'Only a selection of pages is provided below. If the answer may live elsewhere, say which pages you would want to see.', body };
}

async function libraryContext(userId, lastUserText) {
  const papers = await prisma.paper.findMany({
    where: { userId },
    orderBy: { updatedAt: 'desc' },
    select: { id: true, title: true, authors: true, year: true, status: true },
  });
  const shelf = papers.map((p) => `- "${p.title}"${p.authors ? ` (${p.authors}${p.year ? `, ${p.year}` : ''})` : ''}${p.status === 'scanned' ? ' [scanned, no text]' : ''}`).join('\n');

  let rows = await retrievePages(userId, lastUserText, { limit: LIBRARY_LIMIT });
  if (!rows.length) {
    // no lexical hits — fall back to the front pages of the freshest papers
    rows = await prisma.paperPage.findMany({
      where: { paper: { userId }, pageNumber: { lte: 2 } },
      orderBy: { paper: { updatedAt: 'desc' } },
      take: 6,
      include: { paper: { select: { title: true, authors: true, year: true } } },
    }).then((ps) => ps.map((p) => ({ ...p, title: p.paper.title, authors: p.paper.authors, year: p.paper.year })));
  }
  const body = rows
    .map((r) => `=== "${r.title}"${r.authors ? ` (${r.authors}${r.year ? `, ${r.year}` : ''})` : ''} — PAGE ${r.pageNumber} ===\n${r.text}`)
    .join('\n\n');
  return { shelf, body };
}

router.post('/chat', async (req, res) => {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(500).json({ error: 'Anthropic API key not configured. Add ANTHROPIC_API_KEY to your .env file.' });
    }
    const { mode, paperId, currentPage } = req.body;
    if (mode !== 'paper' && mode !== 'library') return res.status(400).json({ error: 'Bad mode' });

    // last 12 sanitized turns — the server holds no chat state
    const messages = (req.body.messages || [])
      .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
      .slice(-12)
      .map((m) => ({ role: m.role, content: m.content }));
    if (!messages.length || messages[messages.length - 1].role !== 'user') {
      return res.status(400).json({ error: 'No question' });
    }
    const lastUserText = messages[messages.length - 1].content.slice(0, 1000);

    let system = JANE_SYSTEM;
    if (mode === 'paper') {
      if (!paperId) return res.status(400).json({ error: 'Missing paperId' });
      const paper = await ownPaper(paperId, req.user.id);
      if (!paper) return res.status(404).json({ error: 'Paper not found' });
      const { header, body } = await paperContext(paper, lastUserText, currentPage);
      system += `\n\nThe user is reading "${paper.title}". Cited page numbers must be the printed PAGE N markers.`;
      if (header) system += `\n${header}`;
      if (body) system += `\n\nPROVIDED PAGES:\n\n${body}`;
    } else {
      const { shelf, body } = await libraryContext(req.user.id, lastUserText);
      system += `\n\nThe user is asking across their whole shelf. Name which paper each fact comes from.`;
      system += `\n\nTHE SHELF (every paper the user owns):\n${shelf || '(empty)'}`;
      system += body ? `\n\nPROVIDED PAGES:\n\n${body}` : '\n\nNo passages matched the question. Say what the shelf holds and ask what to dig into.';
    }

    const Anthropic = require('@anthropic-ai/sdk').default;
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const response = await client.messages.create({
      model: JANE_MODEL,
      max_tokens: JANE_MAX_TOKENS,
      system,
      messages,
    });
    const text = response.content.find((b) => b.type === 'text')?.text;
    if (!text) {
      // He thought until the budget was gone and never got to the answer.
      // That is not a failure worth a red error, it is a question that needs
      // narrowing, and saying so is more use than a shrug.
      if (response.content.some((b) => b.type === 'thinking')) {
        console.warn(`Jane ran out of room while thinking (${JANE_MAX_TOKENS} tokens)`);
        return res.json({
          message: 'That one needed more room than I had. Give me a narrower question, or take it a section at a time.',
          truncated: true,
        });
      }
      return res.status(500).json({ error: 'Jane stepped out for tea. Try again.' });
    }
    // A cut-off answer used to arrive looking finished, which is worse than
    // arriving short — the reader has no way to tell a complete thought from
    // half of one. Say when he ran out of room.
    res.json({ message: text, truncated: response.stop_reason === 'max_tokens' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
