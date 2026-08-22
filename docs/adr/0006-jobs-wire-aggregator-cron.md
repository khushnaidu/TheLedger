# 0006 — Jobs Wire: aggregator API + daily cron into THE CLASSIFIEDS

**Status**: proposed (2026-08-21) — scoped and user-approved, not yet built. Written ahead of implementation so the scope survives session/model handoffs.

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

- **Model** (additive migration, Neon is prod):
  `JobPosting(id, externalId @unique, title, company, location, url,
  salary?, description?, source, postedAt?, fetchedAt, status @default("new"),
  userId + relation, @@index([userId, status, fetchedAt]))` where `status` is
  `new | seen | applied | hidden` (whitelisted strings, house style).
  Search keywords live on a small `JobSearch` model (or a JSON column on the
  user's single search config) — keywords, location, editable in the UI.
- **Cron**: first `crons` entry in `vercel.json` (`0 6 * * *`). The endpoint
  is a **self-guarding unprotected route** (mounted `['jobs-cron', false]` or
  a guarded subpath of `routes/jobs.js`): it checks
  `Authorization: Bearer ${CRON_SECRET}` itself and 401s otherwise, because
  Vercel cron requests can't carry a user JWT. `CRON_SECRET` goes in env
  (local + prod). The handler fetches ~2 paginated aggregator calls per
  search, **upserts by `externalId`** (dedupe across days), and never deletes
  — old postings age out visually, and `hidden` persists across re-fetches.
- **Client**: `tools/jobs/` at `/jobs`, section `classifieds` — which prints
  its section header in the sidebar for the first time (empty sections don't
  render). Styled as a literal broadsheet classified column: dense
  rule-separated entries, small caps, column layout. Row actions: open URL,
  mark applied, hide. A manual "fetch now" button reuses the cron logic
  behind the normal auth middleware for iterating without waiting a day.
- **api.js**: new comment-delimited group; standard `request()` wrappers.

## Consequences

- One of two Hobby cron slots is spent; the second stays free (finance has no
  cron need per ADR-0007, so this is not contested today).
- Aggregator free tiers are rate-limited and sometimes stale — acceptable for
  a personal daily digest; the upsert-by-externalId design tolerates overlap
  and gaps.
- The unprotected cron route is a standing security surface: the
  bearer-secret check is mandatory, same posture as the Blob uploads route
  (verified-payload-instead-of-middleware, ADR-0004).
- Keyword changes take effect on the next fetch (cron or manual), not
  retroactively.
