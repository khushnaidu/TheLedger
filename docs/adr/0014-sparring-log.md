# 0014 — The Sparring Ring: the leetcode bout, separate from the Face-Off

**Status**: accepted (2026-09-04) — first built as a section inside the
Face-Off; split into its own page the same day (user: "i still want the
old one with taia active… this is a leetcode specific faceoff")

## Context

The user and their brother want to log how many leetcode/neetcode
problems they study or solve each day, "with proof," and compete head
to head. The Face-Off (THE PARLOR) already holds the entire social
frame — partner linking via `Connection`, the tale of the tape, the
correspondence — so the sparring log is a section of the bout, not a
new tool.

## Decision

- **Model** (additive migration `20260904*_sparring_log`):
  `Problem(title, url, kind solved|studied, difficulty
  ''|easy|medium|hard, proofUrl, note, solvedAt, userId)` with
  `@@index([userId, solvedAt])`. `solvedAt` accepts a backdate up to a
  fortnight — yesterday's grind counts, nobody pre-logs tomorrow.
- **Routes** ride `routes/partner.js` (they need `findConnection`):
  `GET /partner/problems` returns the whole bout's rows — yours and
  your rival's, flagged `mine` — so **the proof is social**: the other
  corner can always inspect the receipt. POST validates and caps;
  DELETE strikes your own rows only.
- **Proof** is either a pasted link (the submission URL) or an
  uploaded screenshot through the existing Blob client-upload seam
  (`proofs/<userId>/`, images ≤6MB, new branch in uploads.js). A row
  with proof prints "RECEIPT ↗" in credit green; without, an italic
  "on honor" — the register does the shaming.
- **The section** (`SparringLog` in FaceOff.jsx, `spar-` CSS) sits
  between the week chart and the correspondence: a scoreboard reusing
  the tape's own `TapeRow` (rounds today / this week / all-time /
  hards felled / grind streak), a quick-log form where a pasted
  leetcode/neetcode URL names its own problem (slug → title), a
  solved/studied toggle, and the log itself — interleaved newest
  first, black corner square for you and red for the rival, a
  stamp-red scoreline where each day turns ("TODAY — KHUSH 3 : 1
  RAUNAQ"), difficulty letters (E green, M ink, H red), and the house
  two-step × on your own rows.
- The Face-Off's Notice to Patrons gained the sparring step.

## Amendment — its own ring, its own rival (same day)

- `Connection` gained `kind String @default("tickets")` (additive
  migration `20260904*_connection_kinds`): one bout per KIND per user,
  so the tickets face-off (Taia) and the leetcode ring (Raunaq) are
  fought against different rivals from the same account.
  `findConnection(userId, kind)` defaults to 'tickets', leaving every
  face-off route untouched; the ring has its own
  `/partner/spar[/invite|/accept]` endpoints and the problems routes
  key off the 'leetcode' connection.
- The section became a page: `pages/SparringRing.jsx` at `/sparring`,
  registry "The Sparring Ring" in THE PARLOR, with the full bout
  lifecycle (call out by email / step into the ring / hang up the
  gloves) and its own Notice to Patrons. It imports the Face-Off's
  exported fight furniture (FighterArt/FighterPortrait/TapeRow/
  FloorFire) rather than duplicating it.
- The full-body miis (`khush-mii2.gif`, `raunaq-mii.gif`, supplied by
  the user) render pair-aware in `miiFor(u, vs)`: the brothers' bout
  wears the full-body pair (normalized to a shared 3:5 crop so the
  corners sit level), while the khush–taia bout keeps its matched
  head pair.

## Consequences
- Proof is evidence, not enforcement — an "on honor" row still
  counts. The scoreline shames; it does not block.
- Struck rows may orphan an uploaded receipt blob (rent, per the
  house rule on best-effort blob hygiene).
