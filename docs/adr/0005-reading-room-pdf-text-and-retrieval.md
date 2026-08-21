# 0005 — Reading Room: client-side PDF extraction, FTS retrieval, page-anchored annotations

**Status**: accepted (2026-08-21)

## Context

The thesis research tool needs a PDF library whose full text is available to an
AI buddy for grounded, page-cited answers — on a serverless deploy with hard
constraints: Vercel functions default to 10s, `express.json` is capped at 1MB,
the filesystem is read-only, and the server has no PDF tooling. Papers arrive
as user uploads (typically 5–50 pages, up to 25MB). Two AI modes are required
from day one: chat about the open paper, and Q&A across the whole library.

## Decision

1. **The browser does all PDF work.** `pdfjs-dist` renders the reader *and*
   extracts per-page text right after upload (the reader needs pdfjs anyway for
   its selectable text layer, so extraction is free). Text is POSTed in
   25-page batches (≤15K chars/page, 413 past 900KB) into a `PaperPage` row per
   page. The server never parses a PDF.
2. **Retrieval is Postgres FTS, no embeddings.** Both AI modes fetch context
   via `websearch_to_tsquery` + `ts_rank` over a GIN expression index on
   `to_tsvector('english', text)` (hand-added to the migration; runtime SQL
   must repeat the expression byte-identically). One query, no new infra,
   plenty at personal-library scale. Upgrade path if recall disappoints:
   a pgvector column on PaperPage.
3. **Annotations are %-of-page rect arrays in a Json column.** Selection rects
   are normalized against the rendered page box; because a PDF page's aspect is
   fixed and zoom scales the box uniformly, the same percentages re-render
   correctly at any zoom with zero re-anchoring math. Same content-as-JSON
   spirit as ADR-0004.
4. **The buddy (Jane) is stateless text-in/text-out on `claude-sonnet-5`** —
   no `tool_choice` forcing, unlike Gus (ADR precedent: Gus's tools exist for
   machine-committable ticket drafts; Jane's product is prose). Citations use a
   `[p:N]` / `[Title, p:N]` micro-format the client linkifies into jump chips.
   Jane is a separate character with her own component and CSS namespace
   (`jn-`); Gus is untouched.
5. **PDFs ride the existing Blob client-upload seam** (`/api/uploads`) under a
   new `papers/<userId>/` prefix branch (application/pdf, 25MB), keeping the
   JWT-in-clientPayload verification. `maxDuration` for the api function is
   raised to 60s in vercel.json for sonnet latency headroom.

## Consequences

- Zero server PDF dependencies; functions stay small. But extraction depends
  on the uploading browser — a paper is `processing` until its uploader
  finishes, and a re-extract endpoint (`DELETE /papers/:id/pages` + re-POST)
  covers interrupted uploads.
- Retrieval is keyword-recall only; paraphrase-heavy questions may miss pages.
- Scanned/image-only PDFs (≥80% empty pages at extraction) are marked
  `scanned`: viewable, but no highlights or AI grounding. No OCR in v1.
- Papers are public-by-unlisted-URL on Blob (random suffix), same accepted
  posture as notebook images (ADR-0004).
- Non-streaming sonnet answers can take several seconds; `max_tokens: 1500`
  and bounded retrieval keep p95 inside the raised ceiling. Streaming is the
  known escape hatch, deliberately out of v1.
