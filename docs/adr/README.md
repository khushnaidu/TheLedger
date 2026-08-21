# Architecture Decision Records

One numbered record per architectural decision. A feature usually produces one or
two ADRs (its data/storage model, any special infrastructure), written alongside
the code that implements it. Records are immutable history — when a decision is
reversed, write a new ADR that supersedes the old one and link both ways.

Format per record: **Status** (accepted / superseded by NNNN), **Context** (the
problem and constraints), **Decision** (what we chose, concretely), and
**Consequences** (what it costs, what it buys, what to watch).

## Index

- [0001](0001-hub-tool-registry-and-sections.md) — The hub: tool registry + newspaper sections
- [0002](0002-single-server-route-manifest.md) — Single server route manifest (`createApp`)
- [0003](0003-route-level-code-splitting.md) — Route-level code splitting; persistent chrome stays eager
- [0004](0004-notebooks-json-pages-and-blob-storage.md) — Notebooks: JSON pages + Vercel Blob image storage
- [0005](0005-reading-room-pdf-text-and-retrieval.md) — Reading Room: client-side PDF extraction, FTS retrieval, page-anchored annotations
