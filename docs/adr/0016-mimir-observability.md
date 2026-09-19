# 0016 — Mimir observability: every house assistant logs its runs

Status: accepted (2026-09-19)

## Context

The user wants the ledger's assistants visible in Mimir (mimir.sh) — both
to record demos of that product and to have real agent traffic on a real
app. Mimir ships a Python SDK only (`mimir-observe`); the ledger's server
is Node. Reading the vendor's source (v1.2.0) showed the SDK is a thin
client over four JSON POSTs — `/api/mimir/task/register`, `run/start`,
`run/step`, `run/end` — with a Bearer key, stdlib HTTP, and fire-and-forget
semantics.

## Decision

- **Port the wire protocol, not the SDK**: `server/src/lib/mimir.js`
  mirrors the Python payloads field for field (task config hashes, run ids,
  llm_call/tool/reasoning/tool_error steps, token usage, cost from the same
  pricing table plus the models this house actually runs). The dashboard
  cannot tell the ledger apart from a Python agent.
- **Same integration shape as the vendor's**: `instrumentAnthropic()`
  patches `Messages.prototype.create` once at app boot (both entrypoints
  share createApp); `trace(name, input, fn)` scopes a named run via
  AsyncLocalStorage, so every call inside lands as steps of one run — the
  Node analogue of `with mimir.trace(...)`.
- **Each assistant is its own named agent**: Gus, Jane, Ada, Karl Marx,
  Milton Friedman (chat and plate remarks; the clerks' shelf-lookup loop is
  one traced run), The Rewrite Clerk (each filing its own run, bounce
  included), The Filing Clerk (applog parse), The Typesetting Clerk (drill
  briefs), The Sorting Clerk (finance categorize).
- **Dormant by default**: without `MIMIR_API_KEY`/`MIMIR_API_URL` nothing
  is patched and `trace` is a pass-through. Serverless-safe: runs end (and
  flush, ≤2s straggler grace) before the route responds; telemetry failures
  are swallowed — the dashboard being down must never break an assistant.

## Consequences

- Activation is two env vars (Vercel + server/.env); until then, zero
  overhead and no data leaves the building. Once on, prompts, assistant
  text (2KB caps), tool args, tokens, and cost ship to the configured
  Mimir endpoint — that is the point, but it is user data leaving the
  house, so the key only goes where the user puts it.
- One awaited HTTPS POST per assistant call (~100–300ms) once enabled.
- The port tracks mimir-observe 1.2.0; if the vendor changes the wire
  format, mimir.js follows by hand. Verified against a local sink:
  register/start/step/end payloads, Bearer auth, per-turn usage and cost,
  loop grouping, and the dormant path.
