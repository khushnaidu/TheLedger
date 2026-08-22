# 0007 — The Accounts: manual + CSV expense ledger with an AI bookkeeper

**Status**: accepted (2026-08-21). Proposed and built the same day; the
proposal is kept below as written, with an **As built** section recording
where implementation refined it. The AI bookkeeper described here (Vera) is
**superseded by [ADR-0008](0008-two-clerks-marx-and-friedman.md)**, which
replaced her with two clerks; the ledger, importer, and plate below still
describe what is running.

## Context

The hub roadmap (ADR-0001) reserves THE ACCOUNTS section for a finance
tracker — originally pitched as "Taia's finance tracking tool," so expect a
second regular user besides the owner; nothing may assume a single account.
The locked user decision from planning:

- **Manual entry + CSV import. No bank APIs, no Plaid, no scraping.**
  Statements arrive as CSV exports from the user's bank; everything else is
  typed in by hand.

It follows every established hub seam: registry entry + `tools/finance/`
directory + one `ROUTES` line (`['finance', true]`), prisma singleton,
additive-only migration against Neon (prod), `fin-` CSS namespace section in
`index.css`, api.js comment group. An AI helper follows the house AI
patterns: Gus (`routes/ai.js`) for tool-forced draft-then-commit, Jane
(`routes/research.js`, ADR-0005) for the newer stateless-prose approach.

Platform constraints: `express.json` limit is 1MB (do not raise — batch
instead, as notebooks and the Reading Room both do); api `maxDuration` 60s.

## Decision

- **Model** (additive migration):
  `Expense(id, amount Decimal @db.Decimal(12,2), category, date DateTime,
  description @default(""), source @default("manual") // manual | csv,
  externalKey String? , userId + relation, @@index([userId, date]))`.
  `amount` is Decimal, never Float — money. `externalKey` is a dedupe hash
  (date+amount+description) so re-importing the same statement is idempotent,
  mirroring the Jobs upsert-by-externalId posture (ADR-0006). Categories are
  free strings normalized lowercase; a fixed starter set in the client, not
  an enum in the schema.
- **CSV import is client-side** (the server never parses CSV, same
  spirit as ADR-0005's client-side PDF extraction): parse in the browser,
  show a mapping preview (which column is date/amount/description; sign
  convention), let the user assign categories in bulk, then POST in
  ≤500-row batches to a `POST /finance/expenses/batch` endpoint with
  `createMany({ skipDuplicates })` semantics via `externalKey`.
- **Views** in `tools/finance/` at `/finance`: `ExpenseLog` as a literal
  ledger table (ruled rows, right-aligned figures, debit red from the
  existing `--stamp` token), `StatsPanel` (monthly totals and per-category
  groupings via `$queryRaw` — the FTS-precedent for raw SQL is ADR-0005),
  `CsvImport` (the mapping flow), and the buddy.
- **The AI bookkeeper clones the Gus pattern, not Jane's**: expense entry is
  a machine-committable write, so it wants `tools` + `tool_choice: 'any'`
  with a `log_expense` tool and draft-then-commit (the model drafts rows,
  the user presses a commit button, a separate endpoint writes). Model:
  haiku-class is sufficient — the context is small, unlike Jane's papers.
  Whether the buddy is a new character or an extension of an existing one is
  an open styling question for build time; the server pattern is decided.

## As built

Four refinements were made at implementation time, each on a user decision:

- **The book records income, not only spending.** The model is therefore
  `LedgerEntry`, not `Expense`: it carries `kind` (`expense | income`) and
  `amount` is **always positive**, so the sign lives in exactly one place and
  a CSV with an inverted convention cannot corrupt a total. The sheet shows a
  running balance and foots to a net. `source` gained a third value, `vera`.
- **`externalKey` is a readable composite, not a hash.**
  `csv:<date>:<±amount>:<slugged description>`, with a `#2` occurrence suffix
  when a file genuinely repeats a line (two identical coffees on one day both
  survive). A 32-bit hash was rejected: a collision would silently drop a real
  line, and silence is the one failure a ledger cannot have. Idempotency is
  enforced by a **`@@unique([userId, externalKey])` index** plus
  `createMany({ skipDuplicates: true })`, so it holds at the database rather
  than in application code. NULLs are distinct in Postgres, so hand-written
  lines never collide.
- **The bookkeeper is Vera**, a new character, not Gus and not Jane. Deadpan
  auditor: flat declarative sentences, no em-dashes, no lists, and forbidden
  from moralizing about spending. The server pattern is exactly as proposed
  (haiku-class, `tools` + `tool_choice: 'any'`, `draft_entries` / `reply`,
  draft-then-commit through the same `/entries/batch` the CSV import uses).
  She answers questions from a twelve-month digest of the book injected into
  the system prompt, so no query tools were needed. Her avatar falls back to a
  monogram until a portrait is dropped at `/art/vera.png`.
- **Stats are mostly `groupBy`, raw SQL only where Prisma cannot reach.** The
  twelve-month trend needs `to_char`/`date_trunc`, so it is `$queryRaw` with
  `SUM(...)::text` to keep Decimals arriving as plain strings like the rest of
  the API. Everything else is `prisma.ledgerEntry.groupBy`.

The date cell is a `mm.dd` text input that fills the year in from the page you
are on. A native `<input type="date">` was tried first and is roughly twice the
width the column can spare, which is the same trap noted in the theme memory.

## Revision, same day: what the first build got wrong

Two failures showed up the moment a real bank export met the tool.

- **"CSV import" was too narrow a door.** The user's bank exports Excel or a
  fixed-width text dump, neither of which is a CSV, so the only way in was to
  paste the dump into Vera — who misread the columns and lost lines. Import now
  takes a **paste** as its primary intake (an Excel selection copies as TSV, so
  no spreadsheet library is needed) and sniffs the separator: tab, comma, pipe,
  or runs of two-or-more spaces, whichever cuts the file most consistently. It
  also finds the real header row and reports the bank preamble it skipped, and
  reads bracketed, trailing-minus and `DR`/`CR` negatives. Nothing is ever
  dropped silently: unreadable rows are counted and listed with their text.
- **A language model must not parse a statement.** Vera's prompt now refuses
  any pasted tabular blob outright and points at the importer, rather than
  drafting a partial guess. Her actual AI job is the one deterministic code
  cannot do: reading `SAFEWAY #1842 SAN JOSE CA` as *groceries*. That is
  `POST /finance/categorize`, a pure endpoint that takes distinct descriptions
  plus the categories already in the book and returns a map, writing nothing.
  It is offered before posting an import and again from the drill-down for
  lines already filed loose, applied through `PATCH /finance/entries/bulk`
  (one call per category, `updateMany` filtered by `userId`).

The UI was also rebuilt on a second complaint: hundreds of lines on the front
page is the wrong altitude. `/finance` is now an **overview** and the green-bar
sheet moved to `/finance/lines`, a new hidden route with filter chips
(category, kind, source), whole-book search, tick-box multi-select and bulk
strike. Vera moved from a permanent rail into a drawer. The source filter plus
multi-select exists specifically so a bad import can be isolated and struck
without touching anything else.

A first attempt at that overview was rejected for being a generic dashboard —
thin grey bars on white, no material. What replaced it, and what the tool now
leads with:

- **A printed plate, not a chart widget.** The overview is a leaf of the book:
  punched margin, paper grain, and the leaves beneath showing at the edge. The
  centrepiece is a pie drawn the way one ink on paper would print it — slices
  told apart by halftone **screen** rather than colour, a hairline rule between
  them, leader lines out to the labels, and a second plate laid down a hair out
  of register in `--stamp` red. Screens are assigned **by rank, lightest to
  heaviest**: a 70% wedge gets the faintest stipple and a sliver gets solid
  ink, because equal-area ink weight is what keeps the plate from reading as a
  blot. This means a swatch's pattern is not stable across months, which is
  why the legend always sits next to it.
- **Categories roll up before they are drawn.** Eleven thin slices is a
  barcode, so `groups.js` buckets categories into seven headings by keyword
  (`Roof over it`, `The table`, `Getting about`, `Keeping going`,
  `Standing orders`, `For pleasure`, `Owed elsewhere`, plus `Unaccounted`).
  Subscriptions were folded into `For pleasure` at first and pulled out on
  request: a recurring debit is a different kind of money from a night out,
  and burying it hides the one class of spending you can actually cancel. This is deliberately
  **deterministic keyword matching, not a model call** — Vera already decided
  the category, and what a chart looks like should not depend on a sampling
  temperature.
- **The plate has a period.** A `Month / Year / All time` toggle sets the
  range; `GET /entries` gained `from`/`to` (exclusive `to`) and its ceiling
  went to 5000 lines, with the client saying so plainly when a plate is
  truncated rather than quietly under-reporting a total. A separate
  `GET /finance/trend` returns every month and every year the book covers, so
  the strip under the plate can show context outside whatever range is on
  screen; clicking a bar drills from a year into a month.
- **The wedges are photographs of pies.** Each heading owns one — pumpkin,
  pepperoni, apple lattice, margherita, white pizza, birthday cake, pecan,
  cheesecake — and its wedge is that photograph clipped to its share, so the
  plate is one pie assembled out of eight and a chosen slice pulls a real
  slice out. The eight source images are **normalised at build time into
  `/art/pie/<heading>.webp`: square, pie centred, radius exactly half the
  width**, which is what lets the SVG place them with no per-file constants.
  Re-cut any replacement the same way. Normalising also stripped two flattened
  transparency checkerboards, cropped the stock watermarks out with the
  corners, and took the set from 8.7MB to 768KB — the originals must not ship,
  everything under `client/public/` is deployed.
- **Colour survives as the fallback, and stays printerly.** Each heading owns a muted
  spot ink and keeps it month to month, with its halftone screen printed over
  the top at low opacity — flat colour plus texture, the way a limited-run
  offset job looks. Screens and inks are per-heading and stable rather than
  assigned by rank, and they are what a heading draws with when its photograph
  is missing.
- **A slice opens onto its purchases in place.** The overview loads the whole
  month's entries once, so pressing a wedge costs no request: the wedge pulls
  out of the plate, its legend row inverts, and the lines behind it unroll as
  ruled rows underneath. Drilling to the full sheet stays one link away.

## Consequences

- No live bank connection: balances are only as fresh as the last CSV, and
  the user owns categorization quality. This is the accepted trade for zero
  third-party financial access (also the household privacy preference).
- Decimal amounts push a small amount of care into the client (string math
  or integer cents at the edges; Prisma returns Decimal as string in JSON).
- Idempotent imports mean users can re-drop a whole statement after a botched
  mapping without duplicate rows.
- Two-user reality (owner + Taia) means every query filters by `userId` from
  day one, house style — no shared-household ledger in v1; if a shared view
  is wanted later it gets its own ADR (the partner/face-off Connection model
  is prior art for linking accounts).
