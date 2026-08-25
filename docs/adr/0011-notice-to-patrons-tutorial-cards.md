# 0011 — Notice to Patrons: the house tutorial cards

**Status**: accepted (2026-08-25)

## Context

Every tool in the paper is metaphor-first — a card catalog, a wall, a
typewriter, a book kept by two clerks. Charming, but opaque: a visitor
landing on the Reading Room or the Accounts has no idea what the page
is for or how to work it. The user's ask: "create small tutorials /
make each feature page more indicative of what it is for." The teaching
had to stay in the paper's voice — no generic product-tour spotlights,
no tooltip libraries.

## Decision

- **One system, one mount.** `components/PageNotice.jsx` renders from
  App.jsx beside `AssistantOnDuty` and resolves the current route
  against an ordered notice table (deepest path first, so
  `/finance/lines` beats `/finance`). Zero per-page edits; hidden
  reader pages (notebook reader, paper reader, the ledger sheet) carry
  their own notices distinct from their parents'.
- **The card.** A small printed instruction slip (`ntc-` CSS): double
  rule, stamp-red "NOTICE TO PATRONS · <section>" kicker, the tool's
  name, a one-line "what this is," then numbered steps separated by
  dashed rules. Every step names the real on-screen control ("MARK
  IT", "+ bind new", "Sort all", the pen) — the copy was written off a
  survey of each page's actual labels, and documents at least one move
  per page that was previously undiscoverable on screen (the notebook
  corner-drag, the board's burn chute, the sheet's †/‡ marks).
- **Once, then on demand.** The card opens itself on a patron's first
  visit to each page and never again after "Noted." — seen state is a
  JSON array under `localStorage.ledger_notices_seen`, try/caught per
  the house rule. The chip ("¶ How this page works") prints at the
  content's top-right, level with each page's kicker and title, from a
  zero-height `.ntc-anchor` under the masthead — it scrolls with the
  page like print rather than floating (first build was a fixed
  bottom-left chip; the user moved it up). The card drops beneath it
  at z 150: over the page and the assistants' peeks, under their
  drawers.
- **Twelve notices**: command center, board, archive, wall, face-off,
  notebooks + reader, reading room + paper reader, rewrite desk,
  accounts + sheet. The ticket forms stayed bare — a form with labeled
  fields teaches itself.

## Consequences

- New tools must add a notice entry by hand; the registry does not
  enforce it. Acceptable: the copy needs writing anyway.
- Seen-state is per browser, not per account (consistent with every
  other UI flag in the app). A new browser replays the notices once.
- The bottom-left corner is now spoken for on every page; the board's
  sky strip and severity walk sit under the card by z-order, which
  reads as the slip lying on top of the scene.
