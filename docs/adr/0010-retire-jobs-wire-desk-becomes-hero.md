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
  `/jobs/resume` stays as a bookmark alias. The shelf landing wears
  the double-ruled house-ad banner as its masthead.
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
