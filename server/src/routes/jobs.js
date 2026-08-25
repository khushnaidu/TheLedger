const express = require('express');
const Anthropic = require('@anthropic-ai/sdk').default;
const prisma = require('../lib/prisma');

const router = express.Router();

// ── the rewrite desk ─────────────────────────────────────────
// The classifieds section IS the rewrite desk now: the jobs wire
// (standing orders, postings, cron) was retired 2026-08 — see
// ADR-0010. Its tables stay in the schema, dormant, so nothing was
// destroyed; only the routes and the wire itself are gone.

const MAX_RESUMES = 3; // masters only; tailored copies never land here
// resume wording is worth the dearer model — a tailor call is rare and short
const REWRITE_MODEL = 'claude-sonnet-5';

// ── the rewrite desk: master resumes ─────────────────────────
// Only masters are stored. A tailoring session loads one fresh, edits in
// the browser, and leaves as a download — see ADR-0009.

router.get('/resumes', async (req, res) => {
  try {
    const resumes = await prisma.resume.findMany({
      where: { userId: req.user.id },
      orderBy: { updatedAt: 'desc' },
    });
    res.json(resumes);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/resumes', async (req, res) => {
  try {
    const { blobUrl, fileName } = req.body || {};
    if (!blobUrl || typeof blobUrl !== 'string') return res.status(400).json({ error: 'blobUrl required' });
    const count = await prisma.resume.count({ where: { userId: req.user.id } });
    if (count >= MAX_RESUMES) {
      return res.status(400).json({ error: `The desk keeps at most ${MAX_RESUMES} masters. Retire one first.` });
    }
    const name = String(req.body?.name ?? '').trim().slice(0, 60)
      || String(fileName ?? 'resume').replace(/\.docx$/i, '').slice(0, 60);
    const resume = await prisma.resume.create({
      data: { name, blobUrl: blobUrl.slice(0, 500), fileName: String(fileName ?? '').slice(0, 120), userId: req.user.id },
    });
    res.status(201).json(resume);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/jobs/resumes/:id — promote a tailored copy to master: the
// desk uploads the edited file as a fresh blob and points the row at it.
// The old blob is retired best-effort, same rent rule as delete.
router.patch('/resumes/:id', async (req, res) => {
  try {
    const resume = await prisma.resume.findFirst({
      where: { id: req.params.id, userId: req.user.id },
    });
    if (!resume) return res.status(404).json({ error: 'No such master' });
    const data = {};
    if (typeof req.body?.blobUrl === 'string' && req.body.blobUrl) data.blobUrl = req.body.blobUrl.slice(0, 500);
    if (typeof req.body?.name === 'string' && req.body.name.trim()) data.name = req.body.name.trim().slice(0, 60);
    // a touch rolls this master into the typewriter: the shelf scene
    // shows updatedAt desc, so bumping the stamp IS the promotion
    if (req.body?.touch === true) data.updatedAt = new Date();
    if (!Object.keys(data).length) return res.status(400).json({ error: 'Nothing to update' });
    const updated = await prisma.resume.update({ where: { id: resume.id }, data });
    if (data.blobUrl && data.blobUrl !== resume.blobUrl) {
      try {
        await require('@vercel/blob').del(resume.blobUrl);
      } catch { /* the row moved on; an orphaned blob is rent, not a failure */ }
    }
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/resumes/:id', async (req, res) => {
  try {
    const resume = await prisma.resume.findFirst({
      where: { id: req.params.id, userId: req.user.id },
    });
    if (!resume) return res.status(404).json({ error: 'No such master' });
    await prisma.resume.delete({ where: { id: resume.id } });
    try {
      await require('@vercel/blob').del(resume.blobUrl);
    } catch { /* the row is gone; an orphaned blob is rent, not a failure */ }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── the rewrite clerk ────────────────────────────────────────
// The browser owns the document; the clerk only ever sees numbered text
// segments and hands back replacements. Styling never crosses the wire,
// so styling can never be damaged here.

const EDITS_TOOL = {
  name: 'resume_edits',
  description: 'File your work: rewrites of existing segments, new lines to insert, format and layout changes, and a note.',
  input_schema: {
    type: 'object',
    properties: {
      edits: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            n: { type: 'integer', description: 'the segment number' },
            was: { type: 'string', description: 'the first words of segment n, copied exactly as they appear. Proof you are aiming at the right segment.' },
            text: { type: 'string', description: 'the full replacement text for that segment' },
          },
          required: ['n', 'was', 'text'],
        },
      },
      adds: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            after_p: { type: 'integer', description: 'the new line goes in right after this paragraph number' },
            after_text: { type: 'string', description: 'the first words of paragraph after_p, copied exactly. Proof you are aiming at the right paragraph.' },
            like_p: { type: 'integer', description: 'the paragraph whose formatting the new line copies; pick a sibling of the same kind, e.g. another bullet in the same job. Defaults to after_p.' },
            text: { type: 'string', description: 'the full text of the new line' },
          },
          required: ['after_p', 'after_text', 'text'],
        },
      },
      formats: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            n: { type: 'integer', description: 'the segment number whose dress changes' },
            was: { type: 'string', description: 'the first words of segment n, copied exactly. Proof you are aiming at the right segment.' },
            only: { type: 'string', description: 'dress ONLY these words within the segment, copied exactly as they appear, case and all. Omit to dress the whole segment. Every occurrence in the segment is dressed.' },
            bold: { type: 'boolean', description: 'true to make it bold, false to unbold. Omit to leave alone.' },
            italic: { type: 'boolean', description: 'true to italicize, false to remove italics. Omit to leave alone.' },
            underline: { type: 'boolean', description: 'true to underline, false to remove underline. Omit to leave alone.' },
            size_pt: { type: 'number', description: 'new font size in points. Omit to leave alone.' },
            font: { type: 'string', description: 'new font family name, e.g. the document\'s usual face when this segment strays from it. Omit to leave alone.' },
          },
          required: ['n', 'was'],
        },
      },
      layouts: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            p: { type: 'integer', description: 'the paragraph number whose geometry changes' },
            p_text: { type: 'string', description: 'the first words of paragraph p, copied exactly. Proof you are aiming at the right paragraph.' },
            indent_in: { type: 'number', description: 'left indent in inches; 0 removes the indent. Omit to leave alone.' },
            first_line_in: { type: 'number', description: 'first-line indent in inches. Omit to leave alone.' },
            hanging_in: { type: 'number', description: 'hanging indent in inches. Omit to leave alone.' },
            align: { type: 'string', enum: ['left', 'center', 'right', 'justify'], description: 'paragraph alignment. Omit to leave alone.' },
            space_before_pt: { type: 'number', description: 'space above the paragraph in points. Omit to leave alone.' },
            space_after_pt: { type: 'number', description: 'space below the paragraph in points. Omit to leave alone.' },
            line_spacing: { type: 'number', description: 'line spacing as a multiple, 1 is single, 1.15, 1.5, 2. Omit to leave alone.' },
          },
          required: ['p', 'p_text'],
        },
      },
      strikes: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            p: { type: 'integer', description: 'the paragraph number to remove entirely — words, bullet marker, and the line itself' },
            p_text: { type: 'string', description: 'the first words of paragraph p, copied exactly. For a paragraph the sheet marks [empty] there are no words; file an empty string.' },
          },
          required: ['p', 'p_text'],
        },
      },
      note: { type: 'string', description: 'one or two short sentences: what you did, what you refused' },
    },
    required: ['edits', 'note'],
  },
};

const REWRITE_SYSTEM = `You are the rewrite clerk at THE LEDGER's classifieds desk. Readers bring their resume; you reword it, extend it, and tailor it to their instruction, sometimes against a particular posting.

HOW THE RESUME REACHES YOU. Paragraph by paragraph, in reading order. Each paragraph is marked P<number>, with its kind when it is telling: [bullet] for list items, [bold Npt] for probable headings. Inside a paragraph the text comes as numbered segments. A segment is one uninterrupted stretch of same-styled text, so one visual line is often several segments: a job header is a bold title segment, then a dates segment. That is styling, not meaning. Each segment's dress is in the parentheses before its text: b for bold, i for italic, u for underline, its size in points, and a font name only when that segment strays from the document's usual face, which is named above the sheet. A paragraph's own geometry rides in its P-line brackets when it declares any: indent, first line or hanging indent in inches, alignment when not left, space before and after in points, line spacing when not single. Those marks are your only eyes on the formatting. A paragraph with no layout mark inherits its style's layout, which you cannot see, so absence of a mark is not proof of zero; read the marks before you judge a line inconsistent. A P-line marked [empty] is a paragraph with no text at all that still stands on the page: a blank line, or a bare bullet marker when it is also marked bullet.

YOUR FIVE MOVES:
1. Rewrite. File {n, was, text} in edits: the full replacement for that one segment, with "was" carrying the segment's opening words copied exactly, so a misaimed number is caught. Respect the segment's role in its line. Never fold a neighboring segment's words in, never leave a segment's job to its neighbor. Rewriting a bold title segment must not swallow the dates that follow it.
Replacement text prints on the page exactly as filed: plain prose, never markdown. No ** or _ emphasis marks, ever — they would appear literally on the resume. To bold or italicize words, file a retype (move 3) with only; a rewrite never changes dress.
2. Add a line. File {after_p, after_text, like_p, text} in adds: a new paragraph goes in right after paragraph after_p and copies the formatting of paragraph like_p; "after_text" carries the anchor paragraph's opening words copied exactly. To add a bullet under a job, set like_p to one of that job's existing bullets and after_p to the bullet it should follow; when the job has no bullets yet, anchor after the job's own header lines and point like_p at a bullet from another job, the clone carries the bullet dress with it. Watch for lookalikes before you aim: resumes repeat words like Current or a company name in different sections, sometimes twice for the same employer. Tell twins apart by their neighbors on the sheet, the dates and lines around them, and make after_text words that only the paragraph you mean contains. A new line is one plain run of text, so keep it to one sentence or item in the voice of its siblings. A BLANK spacer line is a legitimate add: file text as an empty string, and point like_p at a plain or [empty] paragraph, never a bullet, or the spacer will carry a bullet marker onto the page.
3. Retype. File {n, was, ...} in formats: change how segment n is dressed without touching its words. Set only the properties you mean to change and omit the rest: bold, italic, underline as true or false, size_pt in points, font as a family name. Use this move when the reader asks for a formatting change, or when they ask you to fix inconsistencies and the marks show one: a heading sized differently from its sibling headings, a dates segment missing the italics every other dates segment has, one line in a stray font (retype it to the document's usual face). To dress only certain WORDS inside a segment, add "only" carrying those words copied exactly as they appear, case and spacing included; the rest of the segment keeps its dress and the wording does not change. That is the move for bolding a metric, italicizing a title, underlining a name: {n, was, only: "forty percent", bold: true}. Every occurrence of the words within that one segment is dressed, so if the words repeat and you mean just one occurrence, say so in the note and ask, or pick a longer stretch of words that pins it. Spacing, indents, and alignment belong to the lay-out move below, not this one.
4. Lay out. File {p, p_text, ...} in layouts: change one paragraph's geometry without touching words or dress. Set only what you mean to change and omit the rest: indent_in is the left indent in inches and an explicit 0 removes an indent; first_line_in or hanging_in in inches; align as left, center, right, or justify; space_before_pt and space_after_pt in points; line_spacing as a multiple where 1 is single. p_text carries the paragraph's opening words copied exactly, the same proof as adds. Use this move when the reader asks about indentation, spacing, or alignment, or when they ask for consistency and the P-line marks show one paragraph's geometry straying from its siblings: one bullet indented differently from the rest, one line missing the space-after its neighbors carry, a lone centered line in a left-set section.

5. Strike. File {p, p_text} in strikes: remove paragraph p from the document entirely — its words, its bullet marker, and the line's own height, all at once. p_text carries the paragraph's opening words copied exactly; a paragraph the sheet marks [empty] has no words, so file p_text as an empty string and the number alone is trusted, but ONLY for an [empty] paragraph. Removing a line is ALWAYS a strike and never a rewrite to empty text: a bullet emptied of its words keeps its marker and its blank line on the page. An [empty] mark on the sheet is exactly such a line, real and visible to the reader even though it has no text to show you, so when the reader insists a bullet or line lingers where you see no words, believe them and look for the [empty] mark near the spot they describe.

ACROSS ALL FIVE MOVES. Formatting no mark shows you, like color or highlight, is beyond your moves; say so in the note rather than guessing. Never redesign on your own taste: change only what the instruction covers, and when the reader asks for consistency, make the odd one out match its siblings, not the other way round. Keep the moves apart: a formatting or layout problem is fixed by a retype or a lay-out and never by rewriting the words, and a wording problem is never fixed by either. A stray font or a stray indent IS an inconsistency, fix it when asked for consistency.

TRUTH. Two sources are true: what the resume already says, and what the reader tells you about themselves in the instruction. If the reader says they know a tool or did a thing, that is them saying so, write it in where they want it. What you must never do is make up substance on your own: no invented employers, dates, degrees, numbers, or skills that came from neither source. When a posting asks for something neither source gives you, leave it out and say so in the note.

LAYOUT. Rewrites stay within about fifteen percent of the original segment's length unless the instruction asks for longer or shorter. Additions are welcome when asked for, but a resume that reflows onto an extra page is a failure, so keep new lines lean and say in the note if the page is likely getting tight.

PRECISION. Do what the instruction requires, everywhere it applies, and nothing else. Names, contact lines, dates, and metrics stay exactly as they are unless the instruction is about them. File an edit only when the text actually changes.

THE CONVERSATION. You and the reader are talking across turns; the earlier turns of your exchange come before the latest message. The resume sheet in the latest message is the CURRENT state of the document, already including whatever the reader accepted from your earlier filings, so never re-propose something the sheet shows is done. If your last note asked a question, the reader's newest message is the answer, read it as one. When an instruction is genuinely unclear, you may file empty edits and use the note to ask one precise question, but prefer doing the work over interviewing the reader.

The note reports ONLY what this very tool call carries: never say you added, changed, or removed something unless the matching entry is in the edits, adds, formats, layouts, or strikes you are filing right now. Saying "adding it now" while filing nothing gaslights the reader; if you filed nothing, the note says you filed nothing and why.

The note is printed to the reader. Short spoken sentences. Never an em-dash or en-dash. No lists, no headers, no bold. No filler praise, and never a stub like "placeholder": the note is the only thing the reader sees, write it last and write it real. Say what you changed in substance, where you added lines, and name anything you refused and why.

File everything with resume_edits.`;

router.post('/tailor', async (req, res) => {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(500).json({ error: 'Anthropic API key not configured. Add ANTHROPIC_API_KEY to your .env file.' });
    }
    const { segments, instruction, posting, history } = req.body || {};
    if (!Array.isArray(segments) || !segments.length || segments.length > 500) {
      return res.status(400).json({ error: 'segments must be a non-empty array of at most 500' });
    }
    // roomy enough for a pasted job posting plus the ask — with the wire
    // retired, pasting the posting into the chat IS the tailoring flow
    const ask = String(instruction ?? '').trim().slice(0, 6000);
    if (!ask) return res.status(400).json({ error: 'Tell the clerk what to do' });

    // the conversation so far — the desk itself is stateless, the browser
    // carries the transcript and it dies with the session like the edits
    const turns = (Array.isArray(history) ? history : [])
      .slice(-12)
      .map((t) => ({
        role: t?.who === 'clerk' ? 'assistant' : 'user',
        // generous per-turn cap: clipping the clerk's own last note here
        // amputates the question the reader is currently answering
        content: String(t?.text ?? '').slice(0, 4000),
      }))
      .filter((t) => t.content.trim());

    // paragraph-grouped sheet with structure hints — a flat fragment list
    // reads as noise and the clerk edits the wrong things. The document's
    // most-used font (by characters) is the house face; only segments that
    // stray from it get a font mark, so a rogue Calibri line stands out
    // instead of drowning in two hundred identical labels.
    const fontChars = new Map();
    for (const s of segments) {
      const f = String(s?.f ?? '').trim();
      if (f) fontChars.set(f, (fontChars.get(f) || 0) + String(s?.text ?? '').length);
    }
    const houseFont = [...fontChars.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || '';
    const lines = [];
    let lastP = null;
    for (const s of segments) {
      const p = Number(s?.p) || 0;
      if (p !== lastP) {
        const jc = String(s?.jc ?? '');
        const kind = [
          s?.ghost && (s?.li ? 'empty — a bare bullet marker, no words' : 'empty line'),
          s?.li && 'bullet',
          s?.b && s?.sz >= 13 && `bold ${s.sz}pt`,
          s?.ind && `indent ${s.ind}in`,
          s?.fl && `first line ${s.fl}in`,
          s?.hang && `hanging ${s.hang}in`,
          jc && jc !== 'left' && (jc === 'both' ? 'justified' : jc),
          s?.spb && `${s.spb}pt before`,
          s?.spa && `${s.spa}pt after`,
          s?.lsp && s.lsp !== 1 && `${s.lsp} line`,
        ].filter(Boolean).join(', ');
        lines.push(`P${p}${kind ? ` [${kind}]` : ''}`);
        lastP = p;
      }
      if (s?.ghost) continue; // the P-line says it all; there is no text to number
      const stray = String(s?.f ?? '').trim();
      const marks = [s?.b && 'b', s?.i && 'i', s?.u && 'u', s?.sz && `${s.sz}pt`,
        stray && stray !== houseFont && stray].filter(Boolean).join(' ');
      lines.push(`  ${Number(s?.n)}${marks ? ` (${marks})` : ''}: ${String(s?.text ?? '').slice(0, 600)}`);
    }
    const sheet = (houseFont ? `The document's usual face is ${houseFont}.\n` : '') + lines.join('\n');
    const job = posting
      ? `\n\nTHE POSTING BEING APPLIED TO:\n${String(posting.title ?? '').slice(0, 160)} at ${String(posting.company ?? '').slice(0, 120)}\n${String(posting.description ?? '').slice(0, 5000)}`
      : '';

    // the transcript plus the fresh sheet; roles must strictly alternate
    // and open with the reader, so same-role neighbors are folded together
    const messages = [];
    for (const t of turns) {
      const last = messages[messages.length - 1];
      if (last && last.role === t.role) last.content += `\n${t.content}`;
      else messages.push({ ...t });
    }
    if (messages[0]?.role === 'assistant') messages.shift();
    const final = `THE RESUME AS IT STANDS NOW:\n${sheet}${job}\n\nTHE READER SAYS: ${ask}`;
    const last = messages[messages.length - 1];
    if (last && last.role === 'user') last.content += `\n\n${final}`;
    else messages.push({ role: 'user', content: final });

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    // The clerk aims by number but proves its aim in words (`was` /
    // `after_text`). Numbers are what models fumble — two numbering
    // schemes, lookalike lines — so the words are the authority: an echo
    // that does not match its number is re-aimed at the unique segment or
    // paragraph that does match. A filing that resolves nowhere is not
    // discarded; it is BOUNCED back to the clerk once, with a report of
    // exactly where its echo does and does not live, so good work gets
    // refiled instead of thrown out (the four-bullets-into-the-void
    // incident that motivated this).
    const flat = (v) => String(v ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
    const segText = new Map(segments.map((s) => [Number(s?.n), flat(s?.text)]));
    // raw text, exact case and spacing — word-scope retypes cut by it
    const segRaw = new Map(segments.map((s) => [Number(s?.n), String(s?.text ?? '')]));
    const paraText = new Map();
    for (const s of segments) {
      const p = Number(s?.p);
      paraText.set(p, `${paraText.get(p) ?? ''}${flat(s?.text)} `);
    }
    const aim = (echoRaw, id, textOf) => {
      const echo = flat(echoRaw).slice(0, 60);
      const own = textOf.get(id);
      if (own !== undefined && (!echo || own.includes(echo) || echo.includes(own.slice(0, 40)))) return { id };
      if (!echo) return { id: null, hits: [] };
      const hits = [...textOf.entries()].filter(([, t]) => t.includes(echo)).map(([k]) => k);
      return hits.length === 1 ? { id: hits[0] } : { id: null, hits };
    };
    const whereReport = (label, echoRaw, id, hits) => {
      const place = hits.length
        ? `your words match ${label} ${hits.join(' and ')}, and your number ${id} matches neither`
        : `no ${label} holds those words at all`;
      return `- "${String(echoRaw ?? '').slice(0, 50)}" aimed at ${label} ${id}: ${place}`;
    };
    const ALIGN = { left: 'left', center: 'center', centre: 'center', right: 'right', justify: 'both', justified: 'both', both: 'both' };
    const resolve = (input) => {
      const edits = [];
      const adds = [];
      const formats = [];
      const layouts = [];
      const strikes = [];
      const bounced = [];
      for (const s of Array.isArray(input?.strikes) ? input.strikes : []) {
        const id = Number(s?.p);
        const echo = flat(s?.p_text).slice(0, 60);
        const own = paraText.get(id);
        if (own === undefined) {
          bounced.push({ kind: 'strike', filing: s, report: whereReport('paragraph', s?.p_text, id, []) });
          continue;
        }
        const ownWords = own.trim();
        // a strike is destructive, so the number alone is only trusted for
        // a paragraph that has no words to vouch with — an [empty] line.
        // For a text paragraph the words must check out, same as an edit.
        if (!ownWords) { strikes.push({ p: id }); continue; }
        if (echo && (ownWords.includes(echo) || echo.includes(ownWords.slice(0, 40)))) { strikes.push({ p: id }); continue; }
        const hits = echo
          ? [...paraText.entries()].filter(([, t]) => t.includes(echo)).map(([k]) => k)
          : [];
        if (hits.length === 1) { strikes.push({ p: hits[0] }); continue; }
        bounced.push({ kind: 'strike', filing: s, report: whereReport('paragraph', s?.p_text, id, hits) });
      }
      for (const l of Array.isArray(input?.layouts) ? input.layouts : []) {
        const set = {};
        const inch = (v) => {
          const n = Number(v);
          return Number.isFinite(n) && n >= 0 && n <= 3 ? Math.round(n * 100) / 100 : undefined;
        };
        const pts = (v) => {
          const n = Number(v);
          return Number.isFinite(n) && n >= 0 && n <= 72 ? Math.round(n * 2) / 2 : undefined;
        };
        if (l?.indent_in !== undefined && inch(l.indent_in) !== undefined) set.indent_in = inch(l.indent_in);
        if (l?.first_line_in !== undefined && inch(l.first_line_in) !== undefined) set.first_line_in = inch(l.first_line_in);
        if (l?.hanging_in !== undefined && inch(l.hanging_in) !== undefined) set.hanging_in = inch(l.hanging_in);
        const al = ALIGN[String(l?.align ?? '').trim().toLowerCase()];
        if (al) set.align = al;
        if (l?.space_before_pt !== undefined && pts(l.space_before_pt) !== undefined) set.space_before_pt = pts(l.space_before_pt);
        if (l?.space_after_pt !== undefined && pts(l.space_after_pt) !== undefined) set.space_after_pt = pts(l.space_after_pt);
        const ls = Number(l?.line_spacing);
        if (Number.isFinite(ls) && ls >= 0.8 && ls <= 3) set.line_spacing = Math.round(ls * 100) / 100;
        if (!Object.keys(set).length) continue; // a lay-out that changes nothing is no filing
        const { id, hits } = aim(l?.p_text, Number(l?.p), paraText);
        if (id === null) { bounced.push({ kind: 'layout', filing: l, report: whereReport('paragraph', l?.p_text, Number(l?.p), hits) }); continue; }
        layouts.push({ p: id, set });
      }
      for (const f of Array.isArray(input?.formats) ? input.formats : []) {
        const set = {};
        if (typeof f?.bold === 'boolean') set.bold = f.bold;
        if (typeof f?.italic === 'boolean') set.italic = f.italic;
        if (typeof f?.underline === 'boolean') set.underline = f.underline;
        const pt = Number(f?.size_pt);
        if (Number.isFinite(pt) && pt >= 5 && pt <= 72) set.size_pt = Math.round(pt * 2) / 2;
        const font = String(f?.font ?? '').trim().slice(0, 60);
        if (font) set.font = font;
        if (!Object.keys(set).length) continue; // a retype that changes nothing is no filing
        const { id, hits } = aim(f?.was, Number(f?.n), segText);
        if (id === null) { bounced.push({ kind: 'format', filing: f, report: whereReport('segment', f?.was, Number(f?.n), hits) }); continue; }
        // word-scope: the exact words must sit in the segment verbatim —
        // dressing is applied by character position, so a paraphrase or a
        // case slip would dress the wrong letters or nothing at all
        let only;
        if (typeof f?.only === 'string' && f.only.trim()) {
          only = f.only.slice(0, 200);
          if (!segRaw.get(id)?.includes(only)) {
            bounced.push({ kind: 'format', filing: f, report: `- format aimed at segment ${id}: the words "${only.slice(0, 40)}" do not appear in it verbatim — copy them exactly, case and spacing included` });
            continue;
          }
        }
        formats.push({ n: id, set, ...(only && { only }) });
      }
      // markdown emphasis in filed text prints LITERALLY on a resume — a
      // reader once got "**forty percent**" set in ink. Bounce it back
      // with orders to refile the dress as a retype.
      const MD = /\*\*|__|(^|[^\w*])\*[^*\s][^*]*\*/;
      const mdReport = (label, id) => `- your ${label} at ${id} wraps words in markdown marks (** or * or _): the desk sets real type, and those marks would print literally on the page. Refile the text PLAIN, and file the emphasis separately as a formats filing {n, was, only: "the words", bold or italic: true}.`;
      for (const e of Array.isArray(input?.edits) ? input.edits : []) {
        if (typeof e?.text !== 'string') continue;
        if (MD.test(e.text)) { bounced.push({ kind: 'edit', filing: e, report: mdReport('rewrite of segment', Number(e?.n)) }); continue; }
        const { id, hits } = aim(e?.was, Number(e?.n), segText);
        if (id === null) { bounced.push({ kind: 'edit', filing: e, report: whereReport('segment', e?.was, Number(e?.n), hits) }); continue; }
        edits.push({ n: id, text: e.text.slice(0, 2000) });
      }
      for (const a of Array.isArray(input?.adds) ? input.adds : []) {
        // empty text is a BLANK LINE, a legitimate spacer add — the old
        // !text.trim() discard silently ate them while the clerk's note
        // honestly claimed the work, three turns running
        if (typeof a?.text !== 'string') continue;
        if (MD.test(a.text)) { bounced.push({ kind: 'add', filing: a, report: mdReport('new line after paragraph', Number(a?.after_p)) }); continue; }
        const { id, hits } = aim(a?.after_text, Number(a?.after_p), paraText);
        if (id === null) { bounced.push({ kind: 'add', filing: a, report: whereReport('paragraph', a?.after_text, Number(a?.after_p), hits) }); continue; }
        const like_p = paraText.has(Number(a?.like_p)) ? Number(a.like_p) : id;
        adds.push({ after_p: id, like_p, text: a.text.slice(0, 2000) });
      }
      // the note is the clerk's whole voice — a tight cap here guillotines
      // it mid-question and reads as a crash ("here is a half response")
      return { edits, adds, formats, layouts, strikes, bounced, note: String(input?.note ?? '').slice(0, 2400) };
    };

    // 16K output headroom: a dense one-pager tailored hard can file dozens
    // of edits, and a filing cut off by max_tokens loses its tool block
    // entirely — the reader sees "half a response" and blames the window
    const call = () => client.messages.create({
      model: REWRITE_MODEL,
      max_tokens: 16000,
      system: REWRITE_SYSTEM,
      tools: [EDITS_TOOL],
      tool_choice: { type: 'tool', name: 'resume_edits' },
      messages,
    });
    let response = await call();
    let block = response.content.find((b) => b.type === 'tool_use');
    if (!block) {
      return res.status(500).json({
        error: response.stop_reason === 'max_tokens'
          ? 'The clerk ran out of paper mid-filing. Ask for less at once — one section at a time.'
          : 'The rewrite clerk has stepped away. Try again.',
      });
    }
    let truncated = response.stop_reason === 'max_tokens';
    let { edits, adds, formats, layouts, strikes, bounced, note } = resolve(block.input);

    if (bounced.length) {
      messages.push({ role: 'assistant', content: response.content });
      messages.push({
        role: 'user',
        content: [{
          type: 'tool_result',
          tool_use_id: block.id,
          content: `THE DESK BOUNCED ${bounced.length} FILING${bounced.length === 1 ? '' : 'S'} — the aim did not check out:\n${bounced.map((b) => b.report).join('\n')}\n\nRefile ONLY these, with corrected numbers and echoes; everything else you filed was accepted and stands, do not file it again. When the same words open more than one paragraph, tell them apart by their neighbors on the sheet, the dates or bullets around them. If the right place is genuinely ambiguous, leave that filing out and ask the reader one pointed question in the note. Never write filler like "placeholder" in the note; the note is the only thing the reader sees.`,
        }],
      });
      response = await call();
      block = response.content.find((b) => b.type === 'tool_use');
      truncated = truncated || response.stop_reason === 'max_tokens';
      if (block) {
        const second = resolve(block.input);
        edits = [...edits, ...second.edits];
        adds = [...adds, ...second.adds];
        formats = [...formats, ...second.formats];
        layouts = [...layouts, ...second.layouts];
        strikes = [...strikes, ...second.strikes];
        bounced = second.bounced;
        note = [note, second.note].filter((s) => s.trim()).join(' ');
      }
    }

    if (truncated) {
      note = `${note} (The clerk ran out of paper mid-filing, so some proposals may be missing. Ask again for whatever is not covered.)`;
    }
    res.json({ edits, adds, formats, layouts, strikes, misfiled: bounced.length, note: note.slice(0, 2800) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
