# 0003 — Route-level code splitting; persistent chrome stays eager

**Status:** accepted (2026-08-20)

## Context

The client shipped as one eager ~448KB chunk — every page, the wall, the globe,
the drag-and-drop library — statically imported in `App.jsx`. Each new tool
(notebooks brings a canvas engine; thesis will bring pdf.js at ~1MB) would
compound that for users who never open it.

## Decision

Every routed page loads via `React.lazy()` declared in the tool registry
(ADR-0001), rendered inside a single `<Suspense fallback={<RouteLoader/>}>`
boundary in App's content slot. `RouteLoader` reuses the existing `.loader`
bars aesthetic.

**Persistent chrome is exempt and must stay statically imported outside
`Routes`/`Suspense`:** `Sidebar` (and the `TvSet` it hosts — its YouTube iframe
must never remount so playback survives navigation), `GusAssistant`,
`Masthead`, `Colophon`. Moving any of these inside the route tree is a
regression.

## Consequences

- Each tool ships only when opened; the main chunk carries just the shell +
  chrome. Heavy per-tool deps (perfect-freehand, pdf.js) stay out of the
  critical path.
- Navigation to a not-yet-loaded tool shows a brief loader flash on slow
  connections — acceptable, on-theme.
- Anything imported by the chrome (e.g. `TvSet` via `Sidebar`) is still on the
  critical path; keep the chrome lean.
