# 0009 — The Rewrite Desk: ephemeral resume tailoring by docx surgery

**Status**: accepted (2026-08-24)

## Context

The user's stated main feature for THE CLASSIFIEDS: an "on the fly
ephemeral resume editor" that loads their resume as-is, without wrecking
formatting, and uses AI to reword and tailor it — typically against a
posting from the Situations Vacant column (ADR-0006).

Two decisions were locked with the user before building:

1. **DOCX is the source format.** PDF was ruled out honestly: it is a
   print format with glyphs at coordinates, and in-place text editing
   without reflow damage is not a thing anyone can truthfully ship.
   LaTeX would work but needs in-browser TeX (~30MB wasm). The user's
   resume is a .docx.
2. **The master is stored; tailored copies are ephemeral.** Masters
   (cap 3, for role variants) live in Blob under `resumes/<userId>/`
   like papers and notebook images (ADR-0004/0005). A tailoring session
   loads the master fresh, edits live only in browser memory, and leave
   only as a download. Navigating away discards everything.

## Decision

- **Formatting survives by construction, not by effort.** A .docx is XML
  in a zip; every visible string lives in a `<w:t>` text node inside a
  styled run. `client/src/tools/jobs/docx.js` edits ONLY the contents of
  those text nodes. Styles, run properties, tables, numbering, section
  geometry — every other byte — is carried through untouched. Verified
  mechanically: a structural diff of master vs tailored download shows
  `styles.xml` and all package parts byte-identical, and `document.xml`/
  `header1.xml` identical outside text-node contents.
- **Segmentation.** Editors fragment sentences into many same-styled runs
  (spell-check and revision bookkeeping), so the desk merges consecutive
  text nodes whose serialized `rPr` is identical into one segment.
  Anything that is not text — tabs, breaks, drawings, field chars — is a
  hard segment boundary: replacing across a tab would eat the tab and
  shift a column. Replacements go whole into the segment's first text
  node (`xml:space="preserve"` set); sibling nodes are emptied but never
  removed, so their runs and formatting stay in the file. Headers and
  footers (`word/header*.xml`, `word/footer*.xml`) are segmented too —
  resume templates love putting the contact line in a header.
- **The clerk's five moves (moves revised 2026-08-24 after "the clerk
  is dumb" feedback; the third and fourth added 2026-08-24 for "format
  editing support"; the fifth after the ghost-bullet standoff, same
  day).** v1 gave the model a flat numbered list of 122 fragments
  and one verb, replace — so it could not add anything and misjudged
  structure constantly. Now: (1) the sheet is paragraph-grouped with
  structure hints (bullet, bold+size heading markers, per-segment bold/
  size), because a resume read as a flat ribbon is noise; (2) an `adds`
  operation inserts a new paragraph after an anchor, formatted by
  deep-cloning a chosen sibling paragraph (`like_p`) stripped to one text
  run — a bullet added beside bullets IS a bullet, numbering and all, by
  the same formatting-by-construction argument as edits; (3) every
  proposal carries a text echo of its target (`was` on edits,
  `after_text` on adds) and the server treats the words, not the number,
  as the authority — a mismatched echo is re-aimed at the unique
  matching segment/paragraph or dropped and counted as `misfiled`, which
  the desk reports to the reader. The motivating failure: a resume with
  two "Current"-labeled blocks got its new bullet filed under the wrong
  one, and a skills edit vanished entirely, both on bare-number aiming.
  (4) The truth rule now names two sources of truth: the resume, and
  what the reader asserts about themselves in the instruction — refusal
  is only for substance the model would have to invent unbidden.
- **The third move: retype (added 2026-08-24, "in the event the resume
  has formatting inconsistencies or things i want to change").** A
  `formats` filing `{n, was, bold?, italic?, underline?, size_pt?,
  font?}` changes how one segment is dressed without touching its
  words — a sanctioned breach of "only text nodes change". The
  guarantee narrows honestly: nothing changes except text contents,
  the run properties of segments whose retype card the reader
  explicitly set, the paragraph properties of lay-out cards likewise
  set (the fourth move, below), and whole paragraphs whose strike
  card the reader set (the fifth). `applyFormat` (docx.js) edits only that segment's own
  runs' `rPr`, inserting elements at their ECMA-376 sequence position
  (an order table — Word flags out-of-order rPr children), clearing
  toggles with an explicit `w:val="0"` rather than removal (removal
  merely falls back to whatever a style inherits), pairing `sz`/`szCs`
  and `b`/`bCs`, and stripping theme-font attributes when setting
  `rFonts` literals (themed attrs outrank literal names, so leaving
  them would retype nothing). To give the clerk eyes, segment hints
  grew italic/underline/font: the sheet marks each segment `(b i u
  Npt)` plus a font name ONLY when it strays from the document's
  most-used face (named above the sheet), so a rogue Courier line
  stands out instead of drowning in identical labels — and toggle
  parsing now respects `w:val="0"` so an explicit not-bold never reads
  as bold. Retypes ride the same echo verification and bounce loop as
  edits; a retype whose properties match the segment's current dress is
  dropped server-side, and one that matches after client comparison
  never becomes a card. Prompt rules that had to be learned by test:
  the moves stay apart (the first pass "fixed" a size inconsistency by
  rewriting the heading's words), consistency means the odd one out
  matches its siblings and never the reverse, a stray font IS an
  inconsistency, and color/spacing/alignment are beyond the marks so
  the clerk must say so rather than guess. Verified on a fixture with
  three planted faults (12pt heading among 14pt siblings, a dates
  segment missing its siblings' italics, one Courier New bullet in a
  Georgia document): all three found and filed as retypes with zero
  wording changes, the download's XML differing from the master only
  inside the three accepted runs' rPr; a mixed instruction (reword one
  bullet, underline three headings) filed one edit plus three retypes
  and offered, without forcing, the unrequested fixes; a follow-up
  turn "the underlines were a mistake" filed underline-off retypes at
  the same three segments.
- **The fourth move: lay out (added 2026-08-24, after the clerk itself
  told the reader indentation and spacing were "layout properties I
  have no visibility into or control over").** The paragraph-level
  sibling of retype: a `layouts` filing `{p, p_text, indent_in?,
  first_line_in?, hanging_in?, align?, space_before_pt?,
  space_after_pt?, line_spacing?}` changes one paragraph's geometry —
  words and dress untouched. `applyLayout` (docx.js) edits only that
  paragraph's `pPr`, with its own ECMA-376 order table (pPr children
  are sequence-checked like rPr's); indents are filed in inches and
  written in twips, spacing in points written in twentieths, line
  spacing as a multiple written as `w:line` at 240/unit with
  `lineRule="auto"`. Rival attributes are kept honest: setting
  `firstLine` clears `hanging` and vice versa (Word prefers hanging
  when both exist), and setting `left` drops a stale `start`. An
  explicit zero is meaningful — it overrides an inherited style
  indent, which is how "remove the indent" actually sticks. Visibility
  came with the move: each P-line on the sheet now carries the
  paragraph's declared geometry (indent, first-line/hanging,
  non-left alignment, space before/after, non-single line spacing),
  with the caveat spelled out to the clerk that styles it inherits
  from are invisible, so a missing mark is "as styled", not zero.
  Layouts aim by `p_text` echo against paragraph text — the adds
  discipline — and ride the same bounce loop. Verified on a fixture
  with three planted faults (one bullet at 0.75in among 0.25in
  siblings, EDUCATION missing the 8pt space-before its sibling
  headings carry, one body line centered in a left-set section): a
  "fix the indentation and spacing" sweep found and filed the two
  named categories as lay-outs — and obediently left the alignment
  stray alone, since alignment was not the ask — with the download's
  XML differing from the master only in those two paragraphs' pPr;
  a directed turn (left-align the skills line, indent the University
  line half an inch with single spacing) filed one alignment lay-out
  plus one merged indent-and-line-spacing lay-out, all correctly
  aimed and rendering as ordered.
- **The fifth move: strike, and the ghost paragraphs that forced it
  (added 2026-08-24 after a reader-vs-clerk standoff).** The desk
  numbered every paragraph but the sheet listed only ones with text,
  so a paragraph EMPTIED of its words — which is exactly what an edit
  filed with empty text leaves behind: the paragraph, its numPr bullet
  marker, and its line height, all standing — was invisible to the
  clerk while plainly visible on the page. Numbering skipped (P26 to
  P29) and neither side could be argued out of its own true
  observation: the reader kept seeing a lingering bullet, the clerk
  kept truthfully reporting "there is no paragraph there", five rounds
  of "REMOVE P27 NO EXCUSES" against five refusals. Two fixes. First,
  segment() now emits a GHOST entry for every text-empty paragraph, and
  the sheet prints it as `P27 [empty — a bare bullet marker, no words]`
  (or `[empty line]`), so nothing standing on the page can hide from
  the clerk again. Second, a `strikes` filing `{p, p_text}` removes the
  whole paragraph — words, marker, line — via `deleteParagraph`
  (docx.js), which targets the paragraph element held on every segment
  (`pEl`, ghosts included) and refuses only a paragraph whose pPr
  carries a sectPr, since deleting a section break re-plumbs the page.
  Because a strike is destructive, its aim is STRICTER than the other
  moves: the number alone is trusted only for a paragraph with no
  words to vouch with; a text paragraph's echo must check out or the
  filing bounces. The prompt now bans the root cause outright —
  removing a line is always a strike, never a rewrite to empty text —
  and tells the clerk that when the reader insists a bullet lingers
  where it sees no words, believe them and look for the [empty] mark.
  Verified by replaying the standoff against a fixture with a real
  numbered ghost bullet (numbering.xml and all): the reader's exact
  opening message produced one strike card aimed at the ghost, the
  bare marker vanished from the render, and the download lost exactly
  that one `w:p` with every surviving paragraph byte-identical.
  `insertParagraphAfter` also learned to anchor on `pEl` so an add can
  land after an empty line.
- **Blank-line adds, and the note-versus-filing contract (added
  2026-08-24 after "you're saying adding but not invoking the
  proposal").** The clerk claimed "Added a blank line" three turns
  running while no card appeared — because an add's empty text hit the
  server's `!text.trim()` discard: the filing was thrown away with no
  bounce and no error, so the clerk's note honestly reported work the
  desk had silently eaten. Fixed on three fronts. (1) Empty text is
  now a legal add — a BLANK spacer line — with the prompt directing
  like_p at a plain or [empty] paragraph (never a bullet, or the
  spacer carries a marker), and `insertParagraphAfter` accepting a
  clone that strips to a pPr-only paragraph when the text is empty;
  the card reads "a blank line, for breathing room". Verified with
  the reader's exact complaint replayed: one add card, patterned on
  the document's own existing spacer, and the download gains exactly
  one empty paragraph cloned rPr-for-rPr from it. (2) The prompt now
  carries the note-versus-filing contract: the note reports only what
  this very tool call carries, and filing nothing means saying so.
  (3) The desk contradicts in print what it cannot verify: a note
  that arrives with zero raw filings is suffixed "(No filings came
  with this note.)", so a claim without a filing can never again pass
  as done work. General lesson recorded: every silent `continue` in
  resolve() is a place where the clerk can honestly believe a lie —
  discard nothing the model plausibly meant without either accepting
  it, bouncing it, or making the drop visible.
- **Text-bound rebinding after every mutation (added 2026-08-24 after
  "the bolding changes dont always apply").** Proposal cards used to
  hold direct segment/node references from consult time, which went
  stale the moment a sibling card mutated the same line — a word-scope
  retype splits one segment into three and shifts every number after
  it, so the second card of a Set All could aim at detached nodes and
  die. Now every applied card re-segments the document and re-binds
  all pending cards BY TEXT: segment cards by their stored full text,
  paragraph cards by the paragraph's joined text, and word-scope
  retypes falling back to the unique piece that still contains their
  words — which makes sequential word-formats on the same line compose
  instead of clobber. The proposal list lives in a ref as the source
  of truth because a synchronous Set All loop outruns React state, and
  Set All paints once at the end instead of racing a render per card;
  undo re-binds through the same path. Verified: bold and italic on
  two word spans of the same bullet plus an underline elsewhere, one
  Set All, all three landed as clean run splits with no error.
  **Refile hardening (same day, "update master fails often"):** the
  armed confirm no longer auto-disarms after five seconds (a reader
  pausing on the red warning clicked into a silently reset button,
  which read exactly like failure), the blob upload gets one quiet
  retry, and a real failure now states outright that the shelf still
  points at the old master. Three consecutive edit-and-refile cycles
  verified clean. Take-the-copy also lost its `setCount > 0` gate the
  same day: refiling resets the counter, so the reader's natural flow
  (edit, update master, download) landed on a disabled button; an
  unedited copy is simply the master and downloads without the
  "— tailored" tail.
- **Honest pagination (added 2026-08-24, "in the ledger preview it
  shows only one page" while Word showed two).** docx-preview does not
  simulate Word's automatic page overflow: one elastic section
  stretches past its declared min-height and everything reads as a
  single page. `paginatePreview` (ResumeDesk) runs after each render,
  inside the transform-suspended window after the tab pass: any
  section taller than its own computed page height has its overflowing
  article children moved onto a cloned section, repeatedly, and each
  filled page is locked at its true height. Preview DOM only — the
  download's XML is untouched — and the PDF print frame inherits the
  split pages, with page-break-after on every section but the last so
  no trailing blank page prints. The desk byline shows the live page
  count ("· 2 pages"), which doubles as the overflow warning the
  LAYOUT prompt rule promises. Approximation stated honestly:
  paragraph-granularity, so a paragraph Word would split mid-line
  moves whole; on resumes, where paragraphs are short, the page count
  matches. Verified: a 40-bullet fixture renders as two uniform
  page-height sections with page two opening mid-document, the print
  frame carries both, and a one-pager still renders as exactly one.
  **"pagination didnt work" — two root causes found on the real
  resume, same day.** (1) The fonts-settled check ran BEFORE
  renderAsync, but the render itself registers the document's embedded
  faces — on a fresh page nothing is pending, the check reads
  'loaded', the re-render is skipped, and the swap lands after
  pagination has measured fallback geometry. The check now runs after
  the render (rAF + 60ms, then fonts.ready + re-render). (2) The big
  one: Word's lineRule="auto" spacing is a multiple of the font's
  NATURAL line box (~1.15-1.3× the font size), but docx-preview emits
  it as a bare CSS unitless multiple — the reader's Google-Docs export
  carries w:line="232.8" (0.97×), rendered as 11.64px lines on a 12px
  font where Word sets ~14.6px; twenty percent per line compounded
  over fifty paragraphs is exactly the page the preview was missing.
  `fixLineHeights` converts every unitless inline line-height to
  Word's semantics by probing the natural line box of the element's
  own computed font (cached per family/size/weight, kept unitless so
  mixed-size runs still scale), applied after render and before the
  tab pass — vertical only, so the horizontal tab measurements are
  untouched. Result on the real master: the preview now breaks to
  page two at the same kind of boundary Word does, and fixtures that
  declare no auto spacing are untouched. Diagnostic lesson: measure
  through the SUSPENDED transform — the first reading said "content
  overflows, paginator broke" because the rects were scale-inflated
  by the fit zoom; unscaled, the content fit and the real culprit was
  line-height semantics.
- **The desk is a conversation, not a slot machine (added 2026-08-24
  after "the clerk has no memory" feedback).** v1 sent each instruction
  alone, so answering the clerk's own clarifying question met an amnesiac.
  Now the browser holds the transcript (as ephemeral as the edits) and
  sends the last 12 turns with each request; the resume sheet in the
  final message is always the CURRENT post-acceptance state, so the clerk
  never re-proposes done work; and a bookkeeping line tells it how many
  of its last proposals were set vs spiked, without printing into the
  visible chat. Same-role neighbors are folded to keep the API's strict
  role alternation. The clerk may file empty edits and ask one precise
  question when an instruction is unclear. Verified with the exact
  failing flow: an open "what would you change, change nothing yet" turn
  (clerk correctly observed the resume has no summary line and proposed
  one), followed by "do exactly what you suggested, and the same idea on
  the coursework line" — both back-references resolved, two correctly
  aimed proposals, zero misfiles.
- **Bounced filings go back to the clerk, not into the void (added
  2026-08-24 after four bullets vanished).** Discard-on-misfile was safe
  but brutal: a duplicated company line (the same employer twice, one
  role still bullet-less) made every echo ambiguous and threw out four
  good bullets with "ask again". Now a filing whose aim fails
  verification is returned to the model once, as a tool_result carrying
  a precise mismatch report per filing ("your words match paragraph 9
  and 31, and your number 10 matches neither"), with orders to refile
  only the bounced items or ask one pointed question. Accepted filings
  from the first pass stand; only what the second pass still cannot
  place is dropped and counted. One extra model call, spent only on
  misfires. The same incident produced a note reading literally
  "placeholder", so the prompt now forbids stub notes outright, and
  covers the no-bullets-yet case: anchor after the job's own header and
  clone a bullet from another job.
- **The clerk never sees the document.** `POST /api/jobs/tailor` receives
  numbered segment texts, an instruction, and optionally a posting
  (title/company/description straight from the column via the per-posting
  "Tailor" action). It returns per-segment replacements plus a note,
  tool-forced (`resume_edits`). The model never holds the document —
  only segment texts and read-only dress marks cross the wire, and a
  format proposal comes back as a whitelisted property set the browser
  applies itself, so the model can neither see nor emit raw OOXML. Model: `claude-sonnet-5` —
  resume prose is worth the dearer model and the calls are rare.
- **Hard rules in the system prompt, observed in test**: never invent
  experience, skills, employers, dates, or numbers (asked to add 5 years
  of Kubernetes it filed zero edits and said why); replacements stay
  within ~15% of the original segment length so a one-pager stays a
  one-pager; untouched means untouched — names, dates, metrics move only
  when the instruction is about them.
- **Review flow**: proposals render as diff cards (struck-through before,
  replacement under it) with per-card set/spike and a set-all; accepted
  edits mutate the XML and re-render the preview. **Undo (added
  2026-08-24)**: every set card first snapshots the serialized parts;
  ↶ Undo pops one snapshot, reparses it in place (the doc object every
  reference points at is kept, only its XML documents swap), and
  re-binds each still-pending card to its fresh segment — the restored
  state is exactly what those cards were aimed at one step earlier, so
  only a card whose target no longer reads the same is dropped. The
  set counter and the clerk's bookkeeping step back with it.
  **Markdown guard (same day, after the clerk "bolded" by typing
  literal ** into a rewrite)**: the prompt states that replacement text
  prints exactly as filed and emphasis is the retype move's job, and
  the server bounces any edit or add whose text carries markdown marks
  back through the misfile loop with orders to refile plain text plus
  a word-scope retype. Observed after the fix: told to "add ** around
  the words", the clerk files the bold retype instead and explains in
  its note why literal asterisks would be wrong. Preview is
  `docx-preview` (lazy, inside the 106KB ResumeDesk chunk with jszip)
  rendering the actual current zip, so the preview is the download.
- **Ephemerality is the default, with one deliberate exit (amended
  2026-08-24 on "add the option to update master to current edit
  version").** A tailoring session still dies with the page — but the
  reader can now PROMOTE the current edit to master: the browser packs
  the edited zip, uploads it through the same Blob handshake as a
  fresh master, and `PATCH /resumes/:id` points the row at the new
  blob (retiring the old one best-effort). The server still never
  sees document content in the tailor loop; promotion reuses the
  upload seam, so the only content path remains browser→Blob. The
  button is two-step, armed in red, because it is the one action on
  the desk that outlives the session. Downloads: `.docx` via packDocx
  (named `<master> — <company>.docx` against a posting), and PDF via
  the browser's print engine — a hidden iframe carries the rendered
  preview (docx-preview styles and embedded fonts ride along), `@page`
  is sized from the rendered section so A4 masters are not squeezed
  onto letter, and the print dialog's save-as-PDF produces vector
  text. An honest caveat: the PDF is the preview's rendering
  (normalized alignment included), not Word's.

## Consequences

- **Zoom is transform-scale applied only after the engine's delayed tab
  pass — CSS `zoom` stays banned.** The full resolution of the zoom
  saga: docx-preview's experimental tab engine runs `refreshTabStops`
  on a literal `setTimeout(…, 500)` AFTER `renderAsync` resolves, so
  any transform present in that window poisons its
  getBoundingClientRect math — which is why transform-scale appeared
  cursed through two attempts. The working protocol in `paint()`:
  suspend the transform, render (twice when embedded fonts had not
  settled, so tab widths measure the real faces), outwait the timer
  (650ms), measure natural size, only then let the dial's effect apply
  `scale(factor)` — and a `paintingRef` guard keeps the effect from
  re-applying it mid-render, which React otherwise does the moment its
  deps change. Verified: 1.5–2.6px ink spread at fit/75/100/125 (the
  100% spread times the factor, i.e. purely optical). CSS `zoom`
  remains banned outright: it re-lays-out per factor and re-breaks
  lines. A second lesson from the same episode: verify with
  `document.fonts.status === 'loaded'` waits and Range-rect line
  counting — the embedded-font swap landed after short test waits and
  made two rounds of "0 wraps" checks pass on fallback-font geometry,
  while every fonts-warm real browser showed the break. And a Range
  line-count over a mixed-font-size line (bold title + plain suffix)
  false-positives by rect tops; only same-size runs count.
- **Hand-aligned lines are normalized structurally, never simulated.**
  The final chapter of the preview war: resumes push dates to the right
  margin with runs of tabs and literal spaces, and where that soup lands
  depends on font metrics — a swept letter-spacing/word-spacing shave
  held a 7px band on one machine and the same line landed two tab stops
  short on the user's. Metric tuning cannot fix a machine-dependent
  failure, so `packPreviewDocx` (docx.js) renders a normalized clone: a
  paragraph shaped left-chunk / gap (≥1 tab or ≥3 spaces) / right-chunk
  has its gap collapsed to a single tab and gains an explicit
  right-aligned tab stop at the content margin, which every renderer on
  every machine places identically. The trigger is deliberately narrow
  so other people's resumes pass through untouched (raised after "what
  if somebody with completely different formatting uploads"): only
  hand-hammering qualifies — ≥2 tabs, a tab mixed with filler spaces,
  or a ≥6-space run — a single clean tab is presumed a designed label
  column; paragraphs with EXPLICIT `w:tabs` stops (template geometry)
  and multi-column lines (tabs outside the one gap) are never touched.
  Verified against adversarial fixtures: a template-style resume
  (declared stops, single-tab label columns, jc center/right) and a
  table-based two-column resume both pass through the normalizer with
  zero byte changes and render on the board without error. Verified: 2px right-edge spread across all 14
  aligned lines, zero wraps, and a preview-pack cycle leaves the
  download byte-faithful (the zip briefly carries the normalized XML and
  is restored in a finally block). No metric shaving remains in CSS.

- Two serializer gotchas were found and fixed by test, both worth
  remembering: Chromium's `XMLSerializer` DOES emit the `<?xml ?>`
  declaration (prepending the captured original doubled it — a file Word
  refuses), and the theme's `body { text-transform: uppercase }` plus
  docx-preview's centered flex wrapper respectively shouted over and
  clipped the preview until scoped CSS pinned both.
- First contact with the user's real resume (a Google Docs export, DM
  Sans embedded, layout driven by runs of default tab stops) produced a
  "it messed up the formatting" report that was entirely the PREVIEW:
  a zero-edit and a one-edit round-trip of the real file both proved
  semantically identical outside text-node contents (the only diffs
  being XML-equivalent entity and `\r` normalization). Three preview
  fixes followed: `experimental: true` on `renderAsync` (without it
  docx-preview does no tab-stop math and every right-aligned date
  collapses onto its line); `w:hyperlink` crossings added as segment
  boundaries so replacements can never move words in or out of a link
  run; and `letter-spacing: -0.25px` scoped to the preview, because
  browsers measure type a hair wider than Word and a tab-stop resume
  sits exactly at its margin — lines wrapped where Word's would not.
  Diagnosis rule for next time: reproduce with a zero-edit round-trip
  first; if that diff is clean, the bug is fidelity, not surgery.
- Word-scope retype (added 2026-08-24 on "can the clerk not add bold
  and italics to specific words?"): a format filing may carry `only`,
  the exact words to dress within the segment, and `applyWordFormat`
  splits the run the way Word itself does — the segment's text is
  first collapsed into one node (the applyEdit invariant reused), then
  carved into before/word/after runs, each cloning the original rPr,
  with the word's run additionally dressed; in-run content past the
  text node (a neighboring segment's tab) moves to a tail run so
  nothing reorders. The server bounces an `only` that does not appear
  verbatim (case and spacing) in the raw segment text, since dressing
  cuts by character position. Every occurrence within the segment is
  dressed; the prompt tells the clerk to pin a longer stretch of words
  when the short one repeats. Verified: "bold forty percent, italicize
  Postgres" produced two word-scope cards, the download shows the
  three-way run splits with the original Georgia/22pt rPr cloned on
  every side and b/bCs only around the words, and the document's full
  text is character-identical. Still out of reach, on purpose: a
  rewrite cannot introduce NEW formatting inside its replacement text
  (dressing rides the separate retype move so every dress change is
  its own reviewable card), and color, highlight, borders, and section
  geometry stay beyond the moves — the prompt has the clerk say so
  instead of guessing.
- `docx-preview` fidelity is high but not Word; the download, not the
  preview, is the artifact of record — it renders in Word from the
  document's own untouched styles.
- A deleted master orphans nothing the user cares about (tailored copies
  were never on the server), but blob deletion is best-effort — an
  orphaned blob is rent, not a failure.
- The fixture + structural-diff harness lives in the session scratchpad,
  not the repo; the ADR records the method so it can be rebuilt.
