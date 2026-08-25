# 0006 — Jobs Wire: aggregator API + daily cron into THE CLASSIFIEDS

**Status**: superseded by [ADR-0010](0010-retire-jobs-wire-desk-becomes-hero.md) (2026-08-24) — the wire was retired and the Rewrite Desk became the whole of THE CLASSIFIEDS. Originally: accepted (2026-08-23) — built as scoped, with one user-requested
addition decided at build time: an AI vetting layer between the aggregator
and the column (§ Decision, "the wire clerk"). Proposed 2026-08-21.

## Context

The Ledger's hub roadmap (ADR-0001) reserves THE CLASSIFIEDS section for a
jobs panel: the user wants a daily feed of job postings matched to their
keywords, reviewable inside the paper. Two hard user decisions were made in
planning and must not be relitigated:

1. **Aggregator API, not LinkedIn scraping.** LinkedIn scraping was explicitly
   rejected. Postings come from a legitimate aggregator (Adzuna or JSearch,
   whichever offers the workable free tier at build time) with API keys in env.
2. It ships as a hub tool following the established seams: one registry entry
   (`client/src/tools/registry.jsx`), one tool directory
   (`client/src/tools/jobs/`), one line in the `ROUTES` manifest
   (`server/src/app.js`, ADR-0002), prisma singleton, `jb-` CSS namespace
   section in the monolithic `index.css`.

Platform constraints: Vercel Hobby allows max 2 cron jobs, daily frequency
only, invoked as GET. `vercel.json` currently has no `crons` entry — this
will be the first. The api function's `maxDuration` is already 60s (raised
for the Reading Room's AI calls in ADR-0005).

## Decision

- **Aggregator**: Adzuna (the workable free tier at build time; JSearch's
  RapidAPI tier was thinner). One call per search per run at
  `results_per_page=50`, `max_days_old=7`, `sort_by=date` — the user's brief
  is a *fresh* column, so nothing older than a week is ever fetched, and a
  belt-and-braces filter on `created` re-checks it because aggregator
  freshness claims are sometimes stale. Keys `ADZUNA_APP_ID` /
  `ADZUNA_APP_KEY` in env (local + prod).
- **The wire clerk (AI vetting, added at build)**: aggregator keyword
  matching is loose — a search for one trade drags in adjacent trades,
  staffing-agency noise, and title-only matches ("machine learning" pulling
  CNC *machine* operators). So between the fetch and the book sits one
  tool-forced `claude-haiku-4-5` call per search (`wire_verdicts`,
  index-based like the finance sorter of ADR-0008 §3b): each not-yet-seen
  posting gets keep/spike + a ≤12-word reason. Kept postings are filed with
  the reason as `verdict`, printed in the column as the clerk's pencilled
  note. Spiked ones are simply not stored. Fail-open on both edges: no
  `ANTHROPIC_API_KEY` → the wire runs unvetted; a posting the clerk never
  ruled on runs unvetted (silence is not a spike). Already-stored postings
  are never re-vetted — tokens are spent once per externalId.
- **The google wire (JSearch, added 2026-08-24)**: Google for Jobs has no
  public API (Cloud Talent Solution serves employers hosting their own
  search, and scraping the jobs widget is the LinkedIn trap again), so the
  legitimate route to Google's index is JSearch on RapidAPI — initially
  rejected on economics (~200 requests/month free), reinstated when
  Adzuna's truncated ~250-char snippets proved too thin to give any
  insight into a role. Both wires now run per order via
  `Promise.allSettled`, keys decide: `JSEARCH_API_KEY` absent → adzuna
  only, either wire failing alone is a thinner morning, both failing is
  the order's error. The endpoint is `/search-v2` — the classic `/search`
  was retired by the provider in 2026 and 404s; v2 wraps results in
  `{ jobs, cursor }` and paginates by cursor, which the wire never follows
  (one page ≈ 10 postings; quota: 6 daily orders = 180/mo, inside the free
  200) with `date_posted=week`. The google wire goes **first** in the
  merged batch so that when
  the same job arrives on both wires the clerk keeps the first twin it
  reads — the copy with the full description (stored to 4,000 chars,
  `source: "jsearch"`, "off the google wire" in the column). Cross-day
  cross-wire twins (filed under `jsearch:` yesterday, arriving under
  `adzuna:` today) are caught by handing the vet the recent column as
  ALREADY IN THE COLUMN. The client grew a "Particulars" fold per entry
  that prints the stored posting text — Adzuna's snippet or JSearch's
  full text — which the column previously never displayed at all.
- **The clerk's own beat (web-search top-up, added at build)**: the clerk
  can enforce quality at the desk but cannot fix recall — a posting the
  aggregator never returned cannot be vetted into existence. So when an
  order keeps fewer than `THIN = 8` postings off the
  aggregator, the same clerk goes out with Anthropic's `web_search` server
  tool (max 3 searches) and files what the wire missed via a `wire_findings`
  tool. Three hard rules, all enforced in code, not just prompt:
  (1) a filed URL must match a URL that actually appeared in a search
  result — exact host+path, or shallower (the clerk rightly strips
  `/apply` to file the canonical page), never *deeper*, which is where an
  imagined link under a real domain would hide; (2) postings with a
  determinable date older than 7 days are dropped; (3) at most 10 finds
  per hunt. Trade craft lives in the prompt: generic "keywords + jobs"
  queries return listing pages (LinkedIn/Indeed search URLs), which are
  banned from filing, so the clerk searches ATS domains directly
  (`site:job-boards.greenhouse.io`, `site:jobs.lever.co`,
  `site:jobs.ashbyhq.com`, `after:` date operators) where individual
  posting pages rank. ATS pages may be filed without a visible date —
  firms pull them when the seat is filled. Finds carry `source: "search"`,
  externalId `search:<sha1 of host+path>`, and print "clerk's own find" in
  the column. Orders run concurrently in `runWire` (a hunt adds ~10-20s and
  six in single file would walk past the 60s function ceiling); a failed
  hunt is swallowed (the aggregator edition still goes out), and only
  every order failing identically fails the run.
- **Model** (additive migration `20260823190423_jobs_wire`, Neon is prod):
  `JobSearch(keywords, location, country @default("us"), lastRunAt?)` — a
  "standing order", max 6 per user, plus
  `JobPosting(externalId, title, company, location, url, salary, description,
  source, search, verdict, postedAt?, fetchedAt, status @default("new"))`
  with `@@unique([userId, externalId])` — per-user rather than the global
  `@unique` sketched at proposal time, since two accounts can legitimately
  hold the same posting — and `@@index([userId, status, fetchedAt])`.
  `status` is `new | seen | applied | hidden` (whitelisted strings, house
  style). `salary` is a display string; Adzuna's raw numbers are too patchy
  to keep. `search` snapshots the order's keywords at fetch time so the
  provenance line survives order deletion.
- **Cron**: first `crons` entry in `vercel.json`, `0 13 * * *` — Vercel
  cron is UTC, and 13:00 UTC is the 6am Pacific morning edition the
  proposal's `0 6 * * *` actually meant. The endpoint is a **self-guarding
  unprotected route** (`routes/jobs-cron.js`, mounted `['jobs-cron', false]`):
  Vercel sends `Authorization: Bearer ${CRON_SECRET}` automatically once the
  env var exists on the project, the route 401s anything else, because cron
  requests can't carry a user JWT. It runs every account that holds a
  standing order, each inside its own try/catch so one bad morning doesn't
  stop the presses. The wire **inserts with `createMany skipDuplicates`**
  keyed on `(userId, externalId)` (dedupe across days) and never deletes —
  old postings age out visually, and `hidden` persists across re-fetches.
- **Client**: `tools/jobs/Classifieds.jsx` at `/jobs`, registry name
  "Situations Vacant", section `classifieds` — which prints its section
  header in the sidebar for the first time (empty sections don't render).
  Styled as a literal broadsheet classified column: CSS multi-column with
  hairline column rules, dense rule-separated entries, stamp-red NEW flags,
  the clerk's verdict as the only lowercase line in the column. Tabs: the
  column (new+seen) / applied / spiked. Row actions: open (marks seen),
  applied, spike; spiked entries can be restored. A manual "Run the wire"
  button reuses the cron logic behind the normal auth middleware for
  iterating without waiting a day, and prints the per-order tally
  (fetched / set / spiked by the clerk).
- **api.js**: new comment-delimited group; standard `request()` wrappers.

## Consequences

- One of two Hobby cron slots is spent; the second stays free (finance has no
  cron need per ADR-0007, so this is not contested today).
- Aggregator free tiers are rate-limited and sometimes stale — acceptable for
  a personal daily digest; the insert-by-externalId design tolerates overlap
  and gaps, and the week filter plus clerk keep the column honest.
- The unprotected cron route is a standing security surface: the
  bearer-secret check is mandatory, same posture as the Blob uploads route
  (verified-payload-instead-of-middleware, ADR-0004).
- Keyword changes take effect on the next fetch (cron or manual), not
  retroactively.
- Spiked-by-the-clerk postings are unrecorded, so a wrongly spiked one
  cannot be recovered from the UI — it can only return if Adzuna serves it
  again after its row would be new (it won't within the same week). Accepted:
  storing rejects would grow the table with noise nobody reads. Verified
  against trap batches (CNC operator, MLM scheme, vague staffing listing,
  same-batch duplicate) before acceptance.
- The clerk's morning cost is one Haiku call per standing order per day for
  the unseen postings only — cents a month at the 6-order cap. A thin
  morning adds a hunt: up to 3 web searches (~$0.01/search) plus tokens,
  worst case ~$0.20/day if all six orders run thin, in practice pennies.
- Hand-found postings trade some freshness certainty for recall: an ATS
  page without a visible date is filed with `postedAt` null and presumed
  live. Verified at build: a thin order ("compiler engineer llvm", San
  Jose — Adzuna returned 0) yielded 3 real postings, and a liveness check
  on a full hunt found 8/8 filed URLs returning HTTP 200.
- Requires three env vars in prod that Gus/Jane didn't: `ADZUNA_APP_ID`,
  `ADZUNA_APP_KEY`, `CRON_SECRET` — plus optional `JSEARCH_API_KEY` (a
  RapidAPI key subscribed to JSearch) to light up the google wire.
- The JSearch free tier is a real meter: the daily cron alone fits, but
  every manual RUN THE WIRE spends one google-wire call per order. Running
  dry mid-month degrades gracefully (429 → adzuna-only mornings).
