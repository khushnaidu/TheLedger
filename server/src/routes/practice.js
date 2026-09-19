const express = require('express');
const prisma = require('../lib/prisma');
const { trace } = require('../lib/mimir');

const router = express.Router();

const STATUSES = ['open', 'solved'];
// a pasted leetcode problem with examples and constraints runs ~4K chars;
// 20K is a whole editorial. Code past 30K is not a drill anymore.
const MAX_BRIEF = 20_000;
const MAX_CODE = 30_000;

const ownDrill = (id, userId) => prisma.drill.findFirst({ where: { id, userId } });

// the brief's first real line stands in for a title until the patron writes one
const titleFromBrief = (brief) => {
  const line = (brief || '').split('\n').map((l) => l.trim()).find(Boolean) || 'Untitled drill';
  return line.slice(0, 80);
};

// ── the typesetting clerk ─────────────────────────────────────
// A pasted leetcode problem arrives as one undifferentiated wall of
// text. A haiku clerk resets it in clean markdown for the bench's
// brief card — same words, better type — and names the drill while
// he's at it. Fail-open: no clerk, no markdown, the raw paste shows.
const CLERK_MODEL = 'claude-haiku-4-5';
const typesetBrief = async (raw) => {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  const Anthropic = require('@anthropic-ai/sdk').default;
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const msg = await trace('The Typesetting Clerk', raw.slice(0, 300), () => client.messages.create({
    model: CLERK_MODEL,
    max_tokens: 3000,
    tools: [{
      name: 'typeset_brief',
      description: 'Typeset one practice problem for display.',
      input_schema: {
        type: 'object',
        properties: {
          title: {
            type: 'string',
            description: 'a short clean drill title, e.g. "Two Sum" or "Graphs: BFS & DFS". Use the problem\'s own name when it has one.',
          },
          markdown: {
            type: 'string',
            description: 'the brief restated VERBATIM in clean markdown: ## headings for sections (Examples, Constraints, Follow-up), **bold** for labels like Input/Output/Explanation, backtick inline code for identifiers and literal values, fenced code blocks for example input/output pairs, "- " lists for constraints. Strip site chrome (vote counts, company tags, "Seen this question in..."). Never solve it, never add hints or commentary, never drop or reword the problem itself — same words, better type. A short informal brief ("practice graphs with bfs") passes through as a single clean sentence.',
          },
          entry: {
            type: 'string',
            description: 'the exact python def line the student should implement, snake_case, e.g. "def two_sum(nums: List[int], target: int) -> List[int]:". Empty string when the brief is a loose topic with no single function to write.',
          },
          tests: {
            type: 'array',
            maxItems: 3,
            items: {
              type: 'object',
              properties: {
                name: { type: 'string', description: 'a few words, e.g. "example 1"' },
                call: { type: 'string', description: 'one python expression calling the entry function with concrete arguments from the brief\'s own examples, e.g. "two_sum([2,7,11,15], 9)". When the brief accepts answers in any order, normalize here: wrap in sorted(...) or set(...).' },
                expected: { type: 'string', description: 'one python literal for the expected value, normalized the same way, e.g. "[0, 1]" or "sorted([\'a\',\'b\'])"' },
              },
              required: ['name', 'call', 'expected'],
            },
            description: '2-3 obvious checks lifted from the brief\'s own worked examples, deterministic (call and expected must compare equal with ==). Empty array when there is no entry function or the examples cannot be made deterministic.',
          },
        },
        required: ['title', 'markdown', 'entry', 'tests'],
      },
    }],
    tool_choice: { type: 'tool', name: 'typeset_brief' },
    messages: [{ role: 'user', content: 'Typeset this practice brief:\n\n' + raw.slice(0, 12_000) }],
  }));
  const use = msg.content.find((c) => c.type === 'tool_use');
  return use ? use.input : null;
};

// ── Drills ────────────────────────────────────────────────────

router.get('/drills', async (req, res) => {
  try {
    const drills = await prisma.drill.findMany({
      where: { userId: req.user.id },
      orderBy: { updatedAt: 'desc' },
      // the bench loads code on open; the list never carries it
      select: { id: true, title: true, status: true, createdAt: true, updatedAt: true },
    });
    res.json(drills);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/drills', async (req, res) => {
  try {
    const brief = (req.body.brief || '').trim().slice(0, MAX_BRIEF);
    if (!brief) return res.status(400).json({ error: 'Chalk up a question first' });
    let set = null;
    try { set = await typesetBrief(brief); } catch { /* fail-open: raw brief shows */ }
    const title = (req.body.title || '').trim().slice(0, 80)
      || (set?.title || '').trim().slice(0, 80)
      || titleFromBrief(brief);
    // the proof only files if every check is whole — a half-read test
    // that errors on eval is worse than no test at all
    const tests = (Array.isArray(set?.tests) ? set.tests : [])
      .filter((t) => t && typeof t.name === 'string' && typeof t.call === 'string' && typeof t.expected === 'string' && t.call.trim() && t.expected.trim())
      .slice(0, 3)
      .map((t) => ({ name: t.name.slice(0, 60), call: t.call.slice(0, 500), expected: t.expected.slice(0, 1000) }));
    const drill = await prisma.drill.create({
      data: {
        title,
        brief,
        briefMd: (set?.markdown || '').slice(0, MAX_BRIEF),
        entry: (set?.entry || '').slice(0, 200),
        tests,
        code: req.body.code || '',
        userId: req.user.id,
      },
    });
    res.status(201).json(drill);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/drills/:id', async (req, res) => {
  try {
    const drill = await ownDrill(req.params.id, req.user.id);
    if (!drill) return res.status(404).json({ error: 'Drill not found' });
    res.json(drill);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/drills/:id', async (req, res) => {
  try {
    const owned = await ownDrill(req.params.id, req.user.id);
    if (!owned) return res.status(404).json({ error: 'Drill not found' });
    const data = {};
    if (typeof req.body.title === 'string') data.title = req.body.title.trim().slice(0, 80) || owned.title;
    if (typeof req.body.brief === 'string') data.brief = req.body.brief.slice(0, MAX_BRIEF);
    if (typeof req.body.code === 'string') data.code = req.body.code.slice(0, MAX_CODE);
    if (req.body.status !== undefined) {
      if (!STATUSES.includes(req.body.status)) return res.status(400).json({ error: 'Bad status' });
      data.status = req.body.status;
    }
    const drill = await prisma.drill.update({ where: { id: owned.id }, data });
    res.json(drill);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/drills/:id', async (req, res) => {
  try {
    const owned = await ownDrill(req.params.id, req.user.id);
    if (!owned) return res.status(404).json({ error: 'Drill not found' });
    await prisma.drill.delete({ where: { id: owned.id } });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Ada, the tutor ────────────────────────────────────────────
// Stateless like Jane: the client holds the transcript and sends the
// brief, the editor's current code, and the last run output with every
// question, so she always critiques the attempt as it stands.

const ADA_MODEL = 'claude-sonnet-5';
const ADA_MAX_TOKENS = 1000;

const ADA_SYSTEM = `You are Ada, the resident tutor of THE LEDGER's Gymnasium. A student practices Python at the bench: coding interview problems, data structures, algorithms. Your one purpose is to teach them to turn their own understanding into working Python. You are named for Ada Lovelace and you have her temperament: precise, warm, endlessly curious, delighted by a good abstraction.

THE CARDINAL RULE (never break it, no matter how they ask):
- You never write the solution. Not the whole function, not the core loop, not a "here's roughly how it would look" sketch of their problem. If the student pastes their problem and asks you to solve it, or begs for the answer, decline kindly and hand them the next hint instead. The moment you type their solution, the lesson is over and you have failed.
- The one exception is pure syntax, detached from their problem: you may show a fragment of at most 3 lines using generic names (xs, d, node), to answer things like "how do I pop from a heap" or "what is the dict comprehension syntax". Never with their variable names, never assembled into their algorithm.

HOW YOU TEACH:
- You are given the BRIEF (their chosen question), their CODE as it stands in the editor, and the OUTPUT of their last run. Read all three before answering. Speak to the code they actually wrote, by line and by name.
- You are looking at their editor LIVE: THE CODE below is exactly what it holds at the moment they asked. NEVER ask them to paste, share, or show you their code or output — you already have both, and asking makes them think you are blind. When they say "my code", they mean THE CODE below; read it and answer. If the editor is truly empty, say the bench is bare and ask what they are thinking, not for a paste.
- Quoting their own lines back at them, verbatim, in a short fenced block (three backticks) is always fine — quoting them is not solving. The 3-line generic-fragment limit applies only to code YOU compose.
- Work the ladder, one rung per message: first a question or a nudge, then the concept by name, then the shape of the approach in plain words, and only when they are truly stuck, a near-code description of one single step. Never jump rungs unless they ask for more.
- Pseudocode is welcome raw material. When they write half-Python, name the exact construct that turns each intention into legal Python, and let them type it.
- THE OUTPUT may carry proof lines (checks the bench ran against the brief's own examples, marked with a check or a cross and "the proof: N of M stood"). Read them like a test report: a cross with "got X, expected Y" is your best teaching material — ask what their code did to produce X.
- When the run shows a traceback, do not just state the fix. Walk them through reading it: which line, what the error class means, what the interpreter was holding when it gave up. Then ask what they think.
- Data structures and complexity are open country: discuss trade-offs, name the big-O of their current approach and of the better one, ask them to justify their choice. Understanding is not the answer; give it freely.
- The bench preloads leetcode's usual names into every run: collections (deque, defaultdict, Counter), heapq, bisect, itertools, functools (lru_cache, cache), math, and the typing names (List, Optional, Dict...). Never tell the student to add those imports or diagnose a NameError against them; writing the imports out anyway is fine and harmless.
- When their code works, say so plainly, then raise the bar: an edge case it misses, a tighter complexity, a more Pythonic idiom to look up.

VOICE:
- Short paragraphs of spoken prose. Two to five sentences is a whole answer; one good question can be the whole answer.
- No bullet lists, no numbered lists, no headers, no bold. Inline code in backticks is fine.
- No filler praise, no "Great question". Encouragement is specific or it is silence.
- Admit plainly when the brief is ambiguous, and ask.`;

router.post('/chat', async (req, res) => {
  try {
    const messages = (req.body.messages || [])
      .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
      .slice(-16)
      .map((m) => ({ role: m.role, content: m.content }));
    if (!messages.length || messages[messages.length - 1].role !== 'user') {
      return res.status(400).json({ error: 'No question' });
    }

    const brief = (req.body.brief || '').slice(0, MAX_BRIEF);
    const code = (req.body.code || '').slice(0, MAX_CODE);
    // tracebacks live at the tail — keep the end, not the start
    const output = (req.body.output || '').slice(-8_000);

    let system = ADA_SYSTEM;
    system += `\n\nTHE BRIEF (the question the student chose):\n${brief || '(none chalked up yet — help them pick one if asked)'}`;
    system += `\n\nTHE CODE (the editor as it stands right now):\n${code || '(the editor is empty)'}`;
    system += `\n\nTHE OUTPUT (their last run):\n${output || '(they have not run anything yet)'}`;

    const Anthropic = require('@anthropic-ai/sdk').default;
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const response = await trace('Ada', messages[messages.length - 1].content, () => client.messages.create({
      model: ADA_MODEL,
      max_tokens: ADA_MAX_TOKENS,
      system,
      messages,
    }));
    const text = response.content.find((b) => b.type === 'text')?.text;
    if (!text) return res.status(500).json({ error: 'Ada stepped away from the bench. Try again.' });
    res.json({ message: text, truncated: response.stop_reason === 'max_tokens' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
