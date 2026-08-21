# 0001 — The hub: tool registry + newspaper sections

**Status:** accepted (2026-08-20)

## Context

The Ledger is growing from a task tracker into a hub of diverse mini-apps
("tools"): notebooks, thesis research, a jobs feed, finance tracking, and more
later — eventually plug-and-play. Before that, the nav was a flat 5-link array
hardcoded in `Sidebar.jsx`, and routes were hardcoded separately in `App.jsx`;
adding a tool meant touching both in parallel, and a flat list doesn't scale to
10+ diverse entries.

## Decision

- **Single registry** at `client/src/tools/registry.jsx` exporting `SECTIONS`,
  `TOOLS`, and `HIDDEN_ROUTES` (detail/editor routes with no nav row). Sidebar
  nav and App routes both render from it. Tool entries carry `id`, `name`,
  `route`, `section`, a lazy `Component`, and optional flags (`end` for exact
  NavLink match, `personalOnly` for edition gating).
- **Buckets are newspaper sections**, on-theme with the editorial-broadsheet
  identity: THE DESK (productivity), THE STUDY (notebooks, thesis), THE
  CLASSIFIEDS (jobs), THE ACCOUNTS (finance), THE PARLOR (wall, face-off).
  Sections with no registered tools don't render.
- Sidebar renders sections as micro-eyebrow slugs (`.nav-section-label`,
  "§ THE DESK") over tightened rows, numbering running continuously across
  sections like a paper's index column. The nav is the elastic scroll region;
  the bottom art collapses first, Sign Out never clips.
- **Per-tool code convention:** new tools live in `client/src/tools/<toolId>/`
  (existing pages stay in `pages/` — no churny moves). CSS stays in the
  monolithic `index.css` as one banner section per tool with a namespace prefix
  and its own vars, following the proven MY WALL precedent (`wall-*`). Server
  side: one `server/src/routes/<toolId>.js` + models in `schema.prisma`.

Adding a tool = one registry entry + one tools/ directory (+ one server route
line, see ADR-0002).

## Consequences

- Nav and routing can never drift apart; the registry is the future seam for
  plug-and-play tools (a manifest per tool is already the data shape).
- Section taxonomy is fixed vocabulary — future tools must pick a section (or
  add one to `SECTIONS`, which is one line).
- `index.css` keeps growing (~350 lines per tool); revisit the monolith
  convention if it passes ~4000 lines.
