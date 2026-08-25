# 0010 — Retire the jobs wire; the Rewrite Desk becomes THE CLASSIFIEDS

**Status**: accepted (2026-08-24) — supersedes ADR-0006

## Context

The classifieds shipped as two halves: the jobs wire (standing orders,
Adzuna + JSearch aggregation, Haiku vetting, web-search top-up, daily
cron — ADR-0006) and the Rewrite Desk (ADR-0009). In use, the desk
became the feature and the wire became overhead. The user's verdict:
"scrape the job search tool. make the resume editor the hero tool."

## Decision

- **All wire code paths removed**: the searches/postings/fetch routes,
  `lib/wire.js`, the `jobs-cron` route and its app.js registration, the
  vercel.json cron entry, the Situations Vacant column
  (`Classifieds.jsx`), its api.js group, and its CSS. The wire's env
  vars (`ADZUNA_APP_ID`, `ADZUNA_APP_KEY`, `JSEARCH_API_KEY`,
  `CRON_SECRET`) are no longer read and can be removed from Vercel.
- **The data was NOT destroyed.** `JobSearch` and `JobPosting` stay in
  the Prisma schema and their tables stay in Neon, dormant. Dropping
  prod tables is irreversible and the standing rule is additive-only
  migrations; the rows cost nothing and make this decision reversible.
  A future migration may drop them on an explicit ask.
- **The desk is the section.** The registry's classifieds tool is now
  `The Rewrite Desk` at `/jobs`, rendering `ResumeDesk` directly;
  `/jobs/resume` stays as a bookmark alias. The shelf landing first
  wore the double-ruled house-ad banner; it was reworked the same day
  (user ask: "minimalist like the reading room") into the desk scene —
  the reading room's header idiom over three real objects on one
  hairline desk edge: the typewriter (`/art/typewriter!.png`) holding
  the latest master with page one live-rendered into the platen
  (docx-preview at stamp scale; click sits you down at the desk), the
  remaining masters fanned in a pile beside it (each sheet opens its
  own master; hover lifts it; retiring is the house two-step ×), and
  the pen (`/art/pen.png`) as the only way to file a new master.
  "Latest" is the server's `updatedAt desc`, so a refiled master walks
  back into the machine on its own. The stations also trade paper by
  hand: dragging a pile sheet into the machine or the machine's page
  onto the pile swaps which master holds the platen. The whole move is
  one `PATCH {touch: true}` (bump `updatedAt` and let the ordering do
  the rest); the drag is pointer-events with a 6px threshold below
  which a press stays a click, the real element follows the cursor,
  and the receiving station shows a dashed stamp-red catch outline.
  The machine's catch area is the union of the typewriter's box and
  the jutting page (absolutely positioned overflow is outside
  `getBoundingClientRect`).
- **Tailor-to-posting survives as paste.** The per-posting Tailor
  action died with the column, so the ask field and server instruction
  cap grew to 6,000 characters: pasting a job description into the
  clerk chat IS the tailoring flow now, and the placeholder says so.
  The tailor route's structured `posting` parameter was removed with
  the postings that fed it.

## Consequences

- ADR-0006's wire craft (dual-source merge, cross-wire twin spiking,
  ATS-hunting web search) is retired but documented there if a future
  tool wants it.
- The desk inherits the section badge in the sidebar; nothing else in
  the ledger references postings.
- One live cron slot on Vercel Hobby is freed.
