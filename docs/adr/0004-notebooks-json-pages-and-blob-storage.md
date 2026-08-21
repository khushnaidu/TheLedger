# 0004 — Notebooks: JSON pages + Vercel Blob image storage

**Status:** accepted (2026-08-20)

## Context

The first THE STUDY tool: vintage notebooks — analog-feeling pages holding
typed handwriting-font text, freehand ink, stuck-on photos, and stickers. Two
storage questions: how to persist heterogeneous page content, and where image
files live (the repo had no upload pipeline; Vercel functions have a read-only
FS and a 4.5MB request cap).

## Decision

- **Content-as-JSON per page.** `NotebookPage.content` is one Json column
  (`{ v, items: [] }`, documented in `client/src/tools/notebooks/model.js`).
  Items are heterogeneous (text/ink/image/sticker) with divergent fields; the
  page is the atomic load/save/undo unit and is never queried into
  server-side; the shape evolves via the `v` field with zero migrations.
  Guardrails: client blocks past 300KB serialized, server 413s past 400KB.
- **Fixed 700×920 logical page space**, scaled uniformly via
  `transform: scale()`; all stored coordinates are page units, so content is
  resolution-independent and pointer math is one division.
- **Ink as raw point arrays** (`[x, y, pressure]`, thinned <1.5u), outlined at
  render time by `perfect-freehand` (~2KB) into one memoized SVG path per
  stroke. No canvas engine dependency (excalidraw/tldraw rejected: huge, and
  their look fights the analog aesthetic).
- **Images via Vercel Blob client-upload flow**: browser downscales to
  ≤1600px JPEG (GIFs pass through), uploads directly to Blob, and only the
  URL enters page JSON — files never transit the API function. The token
  route `/api/uploads` is mounted unprotected because the Blob SDK handshake
  can't carry our Bearer header; instead the ledger JWT rides as
  `clientPayload` and is verified in `onBeforeGenerateToken`, with pathname
  forced under `notebooks/<userId>/`. Requires a Blob store on the Vercel
  project (`BLOB_READ_WRITE_TOKEN`).
- **Autosave** debounced 1200ms per dirty page; flush with `keepalive` fetch
  on tab-hide/unmount. Undo is an in-memory per-page snapshot stack (cap 50),
  lost on refresh — accepted for v1.

## Consequences

- Adding item types (or fonts, frames) is a JSON `v`-bump, no migration.
- Orphaned blobs: deleting an image item or notebook does not delete its Blob
  file; acceptable at personal scale, revisit with a sweep job if storage
  bills appear.
- Image uploads are dead until the Blob store exists on the Vercel project
  (`/api/uploads` returns a clear config error until then).
- Whole-stroke erase only; partial erase would need stroke splitting.
