# 0012 — The Application Log: paste a posting, it files itself

**Status**: accepted (2026-08-26)

## Context

The Rewrite Desk covers the outbound half of a job hunt (tailoring the
resume); nothing tracked the inbound half. The user's ask: paste a
posting's text, have it "automatically get filed as something I applied
for," with tick columns for whether they heard back — a logbook, using
"a haiku model to parse and extract details from the pasted posting."

## Decision

- **Model** (additive migration `20260826*_application_log`, Neon is
  prod): `Application(company, role, location, salary, url, raw,
  heard, interview, offer, closed, appliedAt, userId)` with
  `@@index([userId, appliedAt])`. `raw` keeps the paste (4,000 chars)
  as the record of what was answered; the four booleans are the tick
  columns, `closed` being the "no" column. The dormant wire tables
  were not reused — they are shaped for aggregator postings, not
  applications, and stay dormant per ADR-0010.
- **The parse** (`routes/jobs.js`): `POST /api/jobs/applications
  {raw}` makes one `claude-haiku-4-5` call, tool-forced
  (`application_details`) to pull company/role/location/salary/url
  out of the paste (input capped at 8,000 chars, `max_tokens` 400 —
  fractions of a cent). **Fail-open**: no API key or a throwing parse
  still files the row, with the paste's first line standing in as the
  role; everything is amendable by hand afterward. PATCH accepts the
  four booleans plus the five string fields; GET is `appliedAt desc`;
  DELETE is ownership-checked like every jobs route.
- **The page** (`tools/jobs/ApplicationLog.jsx`, `al-` CSS, route
  `/jobs/log`, registry "The Application Log" under THE CLASSIFIEDS;
  the desk's registry row gained `end: true` so the sidebar marks the
  right tool). First cut wore a papergrain-and-red-margin "logbook"
  skin; the user's verdict ("that paper look is horrible. think more
  like the finance sheet log") reset it to the accounts' cloth: the
  punched-hole margin with the printer's double red rule (painted,
  same recipe as `fin-holes`), `--fin-paper` ground with the
  leaf-underneath edge, a plate-head caption bar ("RECORD OF
  REPLIES · N FILED"), green-bar banding on alternate lines, dense
  mono lines with tabular numerals. The tick columns are printed
  hairline boxes whose marks are written in a hand (Gochi Hand): blue
  ✓ for HEARD / INTV. / OFFER, stamp-red ✗ for NO, which also strikes
  the line's position through red. Clicking a line unfolds the paste
  (plus an "open the listing ↗" link when a URL was extracted);
  double-clicking the position opens inline company/role amendment;
  striking a line is the house two-step ×. Ticks update optimistically
  and roll back on a failed PATCH.
- A Notice to Patrons entry (ADR-0011) covers the page, matched
  before the desk's `/jobs` prefix.

## Consequences

- Two tools now share the jobs route file and the `/jobs` path space;
  `/jobs/log` must stay clear of resume-desk deep links (the desk
  uses `?id=`, so it is).
- The parse trusts the paste: a mangled paste files a mangled row,
  by design — the reader amends it in place rather than fighting a
  rejection.
- Haiku cost is one short call per filing; there is no re-parse
  endpoint. Editing is manual once filed.
