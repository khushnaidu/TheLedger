# 0013 — XP moves server-side: the account's experience, not the browser's

**Status**: accepted (2026-08-27)

## Context

XP lived in `localStorage` (`ledger_xp`) and was awarded in exactly one
place: the board's drag-into-DONE handler. Every other road to
completion — the ticket detail page's status buttons, a clerk filing
work — paid nothing, and the ledger was per-browser besides. The lived
result, per the user: "stuck on 0xp and level 1 for the whole time."

## Decision

- **Schema** (additive migration `20260827*_xp_server_side`):
  `User.xp Int @default(0)` and `Ticket.xpAwarded Boolean
  @default(false)` — the paid mark rides the ticket so reopening and
  re-completing never pays twice, and deleting a done ticket never
  claws back what was earned.
- **The paymaster is the tickets API.** A shared `awardIfDone` in
  `routes/tickets.js` runs after create, patch, and move: a ticket
  sitting in DONE without the paid mark pays its priority's rate
  (CRITICAL 50 / HIGH 30 / MEDIUM 20 / LOW 10, unknown 10) in one
  transaction that marks the ticket and increments the user. The
  response carries `xpAward: {earned, totalXp} | null`.
- **Clients announce, never compute.** `lib/xp.js` keeps only the
  level table (`getLevelInfo`) and `xpEventDetail`, which dresses a
  server award as the existing `gus-xp-gained` event. The board and
  the detail page dispatch it off their responses; the sidebar
  initializes from `user.xp` (now on `/auth/me`) and updates on the
  event. The localStorage award machinery is deleted.
- **History paid.** A one-off backfill swept every DONE ticket without
  the paid mark: 6,040 XP across five accounts (the heaviest reader
  landed at Level 10, the ceiling).

## Consequences

- XP now survives browsers, devices, and sign-outs, and every
  completion path pays. Levels jumped for everyone with history.
- Quests remain localStorage — a separate, deliberately lighter game.
- A ticket completed while offline/failed-request earns nothing until
  the move actually lands; the award rides the API response, so there
  is no client-side IOU.
