# 0015 — The Gymnasium: python drills in the browser, with a tutor who never solves

Status: accepted (2026-09-12)

## Context

The Sparring Ring (ADR-0014) logs the interview grind; nothing in the house
helps with the grind itself. The user wanted a practice workspace: a real
editor and a real Python runtime, plus an AI teacher whose job is to turn
high-level understanding (and half-Python pseudocode) into working, compiling
code — explicitly NOT an assistant that fills in the answer. Flexibility
mattered: a drill can be a fully structured pasted leetcode problem or one
loose line ("practice graphs in python with bfs and dfs"), and the discussion
should range over data structures and time complexity, not just syntax.

Constraints: serverless deploy (no server-side code execution, ever — running
untrusted Python on the API is a non-starter), Vite 5 client, Neon additive
migrations, the house's one-page-one-tool registry conventions.

## Decision

1. **Execution is entirely client-side: Pyodide (CPython 3.12 on WASM) in a
   Web Worker.** The worker pulls `pyodide.mjs` from the jsDelivr CDN on first
   boot (~10MB, browser-cached after) via a `/* @vite-ignore */` dynamic
   import, so the app bundle carries none of it. A runaway loop hangs the
   worker, not the page: the manager (`py.js`) starts a 15s clock only when
   the worker reports `running` (boot time never counts), then terminates and
   respawns on overrun. stdout/stderr stream line-by-line into "the readout";
   tracebacks are trimmed to start at the student's own frame (`File "<exec>"`)
   because pyodide's eval_code_async preamble reads as someone else's bug.
   Run output is deliberately ephemeral — the code is the record, the run is
   the moment.

2. **Editor is CodeMirror 6** (`codemirror` + `@codemirror/lang-python` +
   one-dark palette on the ledger's near-black printout card), lazy-loaded in
   the DrillRoom chunk (~470KB, in line with the pdf/resume chunks). Mod-Enter
   runs; Tab indents; per-keystroke onChange feeds a 1.2s-idle autosave.

3. **A Drill row is the persistence unit**: `{title, brief, code, status}`.
   The brief is the question exactly as the patron gave it; the title is its
   first line until renamed. Code round-trips on a debounced PATCH so a drill
   reopens exactly where it was left, on any device. No stored transcripts,
   no stored runs.

4. **Ada, the tutor, is stateless text-in/text-out** (claude-sonnet-5, same
   shape as Jane, ADR-0005): the client holds the transcript in localStorage
   (`gym_ada_<drillId>`) and sends the brief, the editor's current code, and
   the last run's output with every question, so she always critiques the
   attempt as it stands. Her system prompt carries a cardinal rule — she never
   writes the solution, whole or sketched, no matter how she is asked; the
   sole exception is a ≤3-line generic-name syntax fragment. She teaches on a
   hint ladder (question → concept → shape → one near-code step), walks
   tracebacks instead of stating fixes, and gives complexity/data-structure
   discussion freely. Homage: Ada Lovelace; she/her.

5. **Placement**: The Study · No. 03, route `/practice`, bench at
   `/practice/:drillId` (hidden route). Gus stands down on the floor — Ada is
   the resident (App.jsx AssistantOnDuty). CSS namespace `gym-`.

## Consequences

- Zero server attack surface for code execution; also zero server cost. The
  trade: first run on a cold cache needs the CDN and a few seconds ("stoking
  the engine"), and heavy pip packages are limited to what Pyodide ships —
  irrelevant for interview drills, which are stdlib affairs.
- Output not being persisted means Ada can honestly say "the readout is
  empty" after a reload; the fix is to run the code again, which is the
  pedagogically correct nudge anyway.
- The cardinal rule lives in a prompt, not a fence; a determined patron can
  paste Ada's hints into another tool. That is their loss to take.
- 15s wall clock rules out drills that legitimately compute for longer;
  acceptable at the bench, adjustable in one constant.

## Amendment (2026-09-12, same day): the bench goes dark, the brief gets typeset

User feedback on the first cut, three faults:

1. **Everything typed out in ALL CAPS.** The ledger sets the whole paper
   uppercase at the body level (`body { text-transform: uppercase }`), and
   the gym block never opted its content out the way every other tool does.
   Python is case-sensitive; a code editor that displays `PRINT` is broken on
   arrival. Fixed with `text-transform: none` on the editor, console, brief,
   tutor transcript and inputs, the intake textarea, drill titles. Chrome
   (labels, stamps, buttons) stays uppercase — that's the house.
2. **The light paper cards clashed at the bench.** The brief and Ada now sit
   in the same near-black printout (#14130e) as the editor and readout — the
   bench is one dark workspace set into the paper page. Type sizes came up
   (messages 0.75rem, brief 0.6875rem).
3. **The rail was fixed-width and cramped.** A col-resize divider between
   bench and rail now drags 340–720px (default 460), persists in
   localStorage `gym_rail_w`, double-click resets. Stacks below 1100px.

Plus one addition in the applog's tradition: **the typesetting clerk**. A
pasted problem arrives as an undifferentiated wall of text; at intake a
haiku call (`typeset_brief`, tool-forced) resets it VERBATIM in a small
markdown dialect (## sections, **labels**, inline code, fenced examples,
constraint lists) and names the drill properly ("Two Sum", not "1. Two
Sum"). Stored in `Drill.briefMd` (additive migration `drill_brief_md`);
rendered by a hand-rolled five-construct renderer (`BriefMd.jsx`) — no
markdown dependency for five constructs. Fail-open: clerk out → raw brief
in a plain pre. The clerk is charter-bound like Ada: strip site chrome,
never solve, never hint, never reword.

## Amendment (2026-09-13): Ada's manners, and the proof

Two more rounds of user feedback:

1. **"I'm having to constantly paste my code to Ada."** The plumbing was
   never the problem — every question already carries the editor's live
   content (verified by request capture on local and prod). The problem was
   her manners: the greeting literally said "paste your thinking", and
   nothing forbade her asking for code she already has. Her charter now
   states she watches the editor live and must NEVER ask for a paste; the
   greeting and her role line ("reads your editor live") say so; and her
   replies may quote the student's own lines back in fenced blocks (quoting
   is not solving — the 3-line limit applies only to code she composes),
   which the panel now renders as proper blocks.
2. **Static tests ("the proof").** The typesetting clerk also extracts, at
   intake: `Drill.entry` (the def line the brief expects) and `Drill.tests`
   (≤3 `{name, call, expected}` checks lifted verbatim from the brief's own
   worked examples, normalized to compare with `==`; migration
   `drill_proofs`). The bench shows the expected signature under the brief
   and a PROVE IT button: the student's code runs with a harness appended
   that evals each check in the same namespace and reports on one JSON
   sentinel line, which the readout formats as ✓ / "✗ got X, expected Y" /
   "the proof: N of M stood". Results land in the readout, so Ada reads
   them as part of THE OUTPUT with no extra plumbing. Loose briefs
   ("practice bfs") get no entry and no tests; the button simply absents
   itself. The engine's leetcode preloads (collections, typing, heapq,
   itertools, functools, bisect, math) went in the same day — each run in a
   fresh prelude-seeded namespace — so clerk-written calls like
   `two_sum([2,7,11,15], 9)` with `List[int]` hints run regardless of the
   student's own imports.
