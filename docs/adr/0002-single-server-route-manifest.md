# 0002 — Single server route manifest (`createApp`)

**Status:** accepted (2026-08-20)

## Context

The API has two entrypoints: `server/src/index.js` (local dev / standalone) and
`api/index.js` (Vercel serverless wrapper). Both duplicated the full list of
`app.use('/api/...', authMiddleware, router)` mounts. Every new route had to be
added in both files; forgetting one meant it worked locally and 404'd in prod —
a footgun we hit repeatedly (e.g. the channels router).

## Decision

`server/src/app.js` exports `createApp({ before })`: cors + `express.json({
limit: '1mb' })` (notebook page autosaves exceed the 100KB default) + optional
`before` middlewares (morgan locally) + one `ROUTES` manifest of
`[mountName, isProtected]` pairs, each mounted as `/api/<name>` with
`authMiddleware` when protected. Both entrypoints are now thin wrappers.
Adding a server route = one file in `routes/` + **one line in one place**.

All routes must use the `server/src/lib/prisma.js` singleton; the three
offenders that constructed their own `PrismaClient` (events, feeds, channels)
were migrated in the same change — per-file clients exhaust Neon's serverless
connection pool.

## Consequences

- The dual-mount failure mode is structurally gone.
- Route mount names are now coupled to file names (`routes/<name>.js` mounts at
  `/api/<name>`); a route needing a different mount path would need a manifest
  extension.
- Body limit is global (1mb) — routes needing more must not exist; large
  payloads (images, PDFs) go client → Vercel Blob directly, never through the
  function (see the notebooks ADR).
