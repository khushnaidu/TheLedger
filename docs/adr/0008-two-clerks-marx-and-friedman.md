# 0008 — The Accounts: two clerks instead of one bookkeeper

**Status**: accepted (2026-08-21). Supersedes the Vera portion of
[ADR-0007](0007-finance-manual-csv-ledger.md); everything else in 0007
(schema, statement import, the printed plate, the period toggle) stands.

## Context

ADR-0007 shipped The Accounts with **Vera**, a bookkeeper whose defining
trait was having no opinion. Her prompt said it outright: "you never
moralize about how the user spends." That was the right call for a filing
clerk and it made her forgettable. Nobody opens a finance tool to be told
the arithmetic checks out.

The replacement brief was a caricature: the person responsible for the
misery of managing money, and their opposite. Adam Smith was the first
candidate and is miscast — he wrote *The Theory of Moral Sentiments*,
distrusted merchants, and preached frugality, so a "gotcha" reading of him
is a popular misreading rather than a joke. The foil needs **authorship** of
the modern condition, and it needs to be *cheerful* about it, because a
scold is not funny twice.

Two further constraints came out of the same discussion:

- **Rationing.** A character whose whole identity is a worldview will
  editorialize on every coffee if permitted. What is hilarious on day one is
  unbearable by week two. Whatever we built had to separate *filing* (flat,
  factual, high frequency) from *commentary* (in voice, low frequency).
- **A stocks feature is planned but not built.** Whatever personas ship now
  will be asked for stock picks the moment it lands, and a bot named after a
  Nobel economist recommending securities is both a liability and a worse
  joke than the alternative.

## Decision

### 1. Two clerks, split by heading, not by feature

**Karl Marx** and **Milton Friedman** replace Vera. The obvious split —
Friedman on markets, Marx on savings strategy — is backwards and we rejected
it: Friedman's Nobel was partly for the permanent income hypothesis, an
actual theory of household consumption smoothing, while Marx has no theory
of personal saving at all.

The axis we shipped is **chosen versus taken**:

| Steward | Headings | Their material |
|---|---|---|
| **Marx** | `roof`, `standing`, `owed` | Rent, subscriptions, interest, debt, fees, tax. Money gone before you wake up. Labour-time conversion, necessity vs luxury, subscriptions-as-rent. |
| **Friedman** | `table`, `moving`, `pleasure`, `other` | Groceries, dining, shopping, travel, fuel. Revealed preference, permanent income, prices vs behaviour. |
| **Both** | `keeping` | Health, pharmacy, gym. Genuinely contested: a gym membership is either a consumption choice or the cost of reproducing labour power. |

This lives as a `steward` field on each entry in `client/src/tools/finance/groups.js`,
so **the heading you press decides who speaks**. No mode toggle to remember,
and `buildSlices` already spreads the group onto the slice, so nothing
downstream needed threading.

### 2. Commentary is rationed, structurally

Two separate server surfaces, deliberately not one:

- `POST /api/finance/chat` — filing. Same draft-then-commit posture as
  ADR-0007 (`draft_entries` / `reply`, `tool_choice: any`, nothing written
  until the user presses POST). Takes `who`. The shared `CLERK_JOB` block
  carries a hard rule: *"When you are filing lines, file them. Your view of
  the world goes at the end, in one sentence... A clerk who has an argument
  about every coffee is a clerk nobody talks to twice."*
- `POST /api/finance/remark` — commentary. Fires only when a slice is
  opened, capped at two sentences, writes nothing.

A contested heading runs **sequentially, Friedman first**, with his line fed
into Marx's context so Marx is answering something real rather than the two
of them talking past each other. The rebuttal is the whole point; parallel
calls would have been faster and pointless.

Remarks are cached client-side in a module-level `Map` keyed by
heading + period + total, so re-opening a slice you already opened does not
bill for the same sentence twice.

### 3. The clerks can read the actual lines (`look_up_lines`)

Added the same day, after Marx was asked which subscriptions were running and
answered: *"The book does not show what those subscriptions are. It only shows
that six separate charges went out in July... I would need to see the
descriptions."* He was telling the truth. `bookDigest` sends twelve months of
totals grouped by month, kind and category, and **no descriptions at all**, so
no clerk could ever name a merchant. The digest is a good cheap grounding for
"how much" and useless for "which".

The fix is a third tool, `look_up_lines`, with a **bounded server-side loop**
in `/chat`: the clerk may go to the shelf, read what he found, and go again,
up to `MAX_LOOKUPS = 3`. `tool_choice` stays `{ type: 'any' }` throughout;
once the lookups are spent the tool is filtered out of the `tools` array, so
he has no option left except to answer. Worst case is four API calls.

Two things this exposed, both fixed in the prompt rather than the schema:

- **The user's words are looser than the book's categories.** "Subscriptions"
  meant six charges spread across `subscriptions`, `streaming`, `saas` and
  `membership`; searching the single word returned three of six, which is
  worse than returning nothing because the user will believe it. The tool
  therefore takes a `categories` **array**, and rule 3b tells them to read the
  digest for which categories exist and pass every one that fits at once.
- **They would still claim blindness.** Marx said "there is no way to search
  for that" about uncategorized lines when a lookup would have found them.
  Rule 3aa forbids both "there is no way to search" and "I only have totals",
  and carves out the one safe inference: a category absent from the digest has
  no lines under it, so absence may be answered without a lookup.

The lookup is scoped by `req.user.id` from the session. The model never gets a
field in which to name a user, so a clerk cannot reach another book.

### 3a. Sorting loose lines works on the whole book

A year of statements imported in one go arrives entirely uncategorized,
because a bank export names merchants and never categories. The plate draws
that as one grey Unaccounted wedge covering almost everything.

The sorting itself already existed (`POST /categorize`, deliberately
persona-free — see Consequences). What did not work was reaching it at that
scale. Four separate faults, all found by importing 1,400 lines:

1. **`sortLoose` only saw the month on screen.** `LedgerLines` loads one
   month at a time, so a year needed twelve presses and twelve waits. It now
   calls `sortBook()`, which fetches `month: 'all', category: 'uncategorized'`
   regardless of what is displayed.
2. **`recategorize` was not chunked.** `PATCH /entries/bulk` refuses more
   than 1,000 ids with a 413, verified. Any category with more than a
   thousand lines — groceries over a year, easily — would have thrown and
   aborted the entire sort. Now chunked at `ID_BATCH = 1000`.
3. **The map keys did not match.** `/categorize` trims and clips each
   description to 160 chars before using it as a key; the client looked up
   the raw `e.description`. Any padded or over-long merchant name missed
   silently and the line stayed grey for no visible reason. Both sides now
   go through one exported `nameKey()`.
4. **No progress.** Seven sequential model calls with a static "Reading the
   names…" reads as hung. Both callers now show `reading 38 of 38` then
   `filing 1236 of 1400`.

All of it lives in `client/src/tools/finance/sortLoose.js` so the importer,
the sheet and the overview share one implementation. `GET /finance/loose`
returns just a count, so the overview can offer the sort without loading a
year of lines to discover whether it should.

Two category-mapping gaps surfaced in the same test and are fixed in
`groups.js`: `clothing`, `education` and `personal care` matched no heading
and fell to Unaccounted **after** being correctly categorized, which looks
identical to the sort having failed. Separately the sorter was answering
`gas` for petrol stations, and `roof` matches `/^gas$/` before `moving` does,
so fuel was filing under housing. Rather than reorder the headings and break
utility gas, `SORT_SYSTEM` now pins a canonical vocabulary and forbids the
bare word `gas` outright.

### 3b. Assignments come back by number, not by echoed description

`POST /categorize` originally returned `{ description, category }` pairs and
the client keyed off the echoed description. That only worked if the model
reproduced a noisy merchant string byte for byte, and any requote, paraphrase
or stray list number dropped that line silently. It now returns
`{ n, category }` against the 1-based position it was given, which cannot be
paraphrased and costs about a tenth the output tokens — which is also what
keeps a batch of 120 clear of the `max_tokens` ceiling.

It also now returns `placed` (names given a real category) separately from
`sorted` (names answered at all), plus a `sample` of what it actually read.
That distinction is the whole point: **"could not place any of them" covers
two unrelated failures.** Either the sorter could not read the descriptions,
or it read them and the filing failed. Only the first is the user's to act
on, and when it happens the cause is almost always that the import took the
wrong column, so `sortReport` now says:

> None of the 360 descriptions could be read as a merchant. This is what the
> book has: "3712.10", "3980.44", "4211.09". If that is not shop names, the
> import took the wrong column and these lines need reimporting, not
> resorting.

A report that names the real problem is worth more here than any improvement
to the classifier, which was measured at 120 of 120 on realistic bank noise.

### 3c. Duplicates, and emptying the book

**Duplicates.** `externalKey` makes re-importing the *same* export idempotent,
because the key is derived from the line. It cannot catch two *different*
exports that overlap — a re-download with a wider date range, or a month
whose spacing changed, arrives with keys never seen before and doubles every
shared line. `GET /finance/duplicates` groups on day + kind + amount +
description and reports what is doubled; `POST /finance/duplicates/strike`
keeps the earliest of each group by `createdAt` and deletes the rest.

It never runs on its own. Two real coffees on one day at one shop for one
price are indistinguishable from a double import, and no rule can separate
them, so the tool reports and the user decides. The bar offers **Look first**
before **Strike the extras** for exactly that reason.

**Reset.** `DELETE /finance/entries/all` requires the literal phrase
`BURN THE BOOK` in the request body. The client asks for it to be typed out
and the server checks it again, because a confirmation that only exists in
the client is not a confirmation. There is no soft-delete or undo behind
this, which is why it is gated twice and why the affordance is a quiet link
rather than a button.

### 3d. Remarks get the merchants, not just the total

`look_up_lines` (§3) fixed blindness in `/chat` and left the identical fault
in `/remark`, which still received only heading, total, share and category
names. The result was a clerk describing a wedge he could not see into:

> The shopping line is doing a lot of work there, and the book does not show
> what it contains.

True, useless, and roughly the same sentence for every heading. `/remark`
now also receives the **merchants behind the wedge** — folded by name, with
what each took and how many charges — plus the largest individual lines. No
tool loop and no extra round trip, because `buildSlices` already carries
those lines on the client. Specificity here costs payload, not latency.

Folding is loose (`NETFLIX.COM` and `NETFLIX.COM #4471` collapse) so a
merchant charged twelve times reads as one recurring claim rather than twelve
strangers. That recurrence is the single most useful fact about a heading,
and it is what turns the line above into:

> Adobe takes 59.99 every month without asking again, and Netflix takes 22.99
> most months. That is 82.98 a month before anything else lands.

Three rules were needed to make this safe, each added after watching it fail:

- **Sentence count is enforced, not requested.** Told "two sentences" and
  shown a merchant list, both clerks reliably wrote four. `trimRemark` now
  caps at three sentences before applying the character bound. The split
  requires whitespace after the stop, which is what keeps it from cutting
  `59.99` in half.
- **Counts are stated, never implied.** The brief originally printed a count
  only when it exceeded one, and a single Walgreens charge came back as
  "across two visits". Every merchant now carries an explicit
  "across N charges".
- **Frequency may not be invented.** From one August charge Marx asserted
  "you have paid Equinox 215.00 every month for years". The counts are for
  the displayed period only and the prompt now says so; recurrence is named
  when the count supports it and hedged when it does not.

One further rule went into `CLERK_VOICE`, so it covers chat as well: a clerk
speaks **to** the account holder, always as "you", never in the third person.
Marx had written "the question is not whether *she* used it enough", which
both breaks the register and guesses at something about the user that the
book does not record and nobody asked him to infer.

### 4. Figures come from the client, and are trusted with nothing

`/remark` takes the heading's total, share, line count and top categories
from the caller rather than recomputing them. The grouping that produced
them is the client-side regex table in `groups.js`, and duplicating those
regexes server-side would create two sources of truth for what a chart
looks like. Every value is clamped and stringified before it reaches a
prompt. These are the user's own numbers being read back to them, so there
is no trust boundary to defend.

### 5. No investment advice, in the prompt, now

Both personas carry: *"You will not tell the user what to buy, sell, or
hold... You comment on what the book already shows."* Written before the
stocks feature exists so it is not retrofitted under pressure. It is also
the better joke — Friedman explaining that your loss was an efficient
allocation of capital beats Friedman being right about a stock.

### 6. They replace Gus on `/finance`, as a pair

`AssistantOnDuty` in `App.jsx` already routes `/research` to Jane. It now
routes `/finance` to `ClerkPeek`, which leans both heads in from the right
edge on separate animation clocks. **Which head you poke is how you pick who
you are talking to.** The drawer carries a swap button, and the two keep
separate `localStorage` transcripts (`fin_clerk_marx`, `fin_clerk_friedman`)
because they are different people and a shared transcript would have each
answering for the other.

### 7. Portraits follow the pie contract

`client/public/art/clerk/{marx,friedman}.webp`: 320px square, transparent,
head centred, **head height 86% of the canvas**. Measured programmatically
(alpha bbox for Friedman, a speckle-tolerant content bbox above the
shoulders for Marx, whose supplied cutout is head-and-shoulders with a
ragged edge). Same principle as the pie photographs in ADR-0007 — normalise
once so the components need no per-file constants. Paths live in
`lib/theme.js` beside `JANE_HEAD` so the eagerly-imported peek can name them
without dragging the finance chunk into the main bundle.

### 8. `source` gains `clerk`; `vera` stays readable

New drafts file as `source: 'clerk'`. `'vera'` remains in the `SOURCES`
whitelist and in `SOURCE_MARK`, and the sheet's filter offers "Filed by Vera
(retired)". It is a plain `String` column, so this needed no migration, and
rows she filed still read back correctly. **Do not remove `'vera'` from the
whitelist** while any row still carries it.

## Consequences

**What it buys.** The tool has a point of view without becoming a nag. The
split is legible from the plate itself, so a user learns who owns what by
using it. Adding a third clerk later is a key in `clerks.js`, a `steward`
value, and a persona in `finance.js`.

**What it costs.** A "which merchants" question is now two to four model
calls instead of one, because the clerk has to go and read before he answers.
Opening a contested slice is two sequential model calls,
so it is the slowest interaction in the tool. Capped at two sentences on
haiku with a client cache, which keeps it tolerable; if it ever drags, drop
the contested pair to a single call before touching anything else.

**What to watch.**

- **Rationing is a prompt rule, not a mechanism.** If either of them starts
  editorializing line by line in the chat, tighten `CLERK_JOB` — do not
  assume the split alone will hold them.
- **`trimRemark` cuts at the last full sentence under 420 chars**, ellipsis
  only as a last resort. An earlier 300-char cap with a 120-char floor
  truncated Marx mid-clause, which reads as a bug rather than as brevity.
- **The share passed to `/remark` is a share of spending, not income.** Marx
  called it income on the first run; there is now an explicit prompt rule.
  Any new figure sent into a remark needs the same treatment.
- **Categorization stayed anonymous.** `POST /categorize` has no persona at
  all. Naming what `SAFEWAY #1842` is should not depend on who is at the
  desk, and neither clerk has an opinion about filing.
- **Both are real historical figures rendered as caricatures.** The comedy
  runs on documented biography (Marx's stock speculation and his thirty
  years of debt to Engels; Friedman's cheerfulness). Keep it there.
