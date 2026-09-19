// Mimir agent observability — a Node port of mimir-observe 1.2.0's wire
// protocol (the vendor ships Python only; the protocol is four JSON POSTs).
// Payload shapes mirror src/mimir/core/sdk.py field for field, so the
// dashboard cannot tell the ledger apart from a Python agent.
//
// Wiring: instrumentAnthropic() patches Messages.prototype.create once, at
// app boot. Every house assistant wraps its call(s) in trace('Name', ...)
// so runs land under the assistant's name; a bare create outside any trace
// auto-creates a run named after the model, exactly like the Python SDK.
//
// Dormant by default: without MIMIR_API_KEY or MIMIR_API_URL in the env,
// nothing is patched and trace() is a pass-through — zero overhead, no
// data leaves the building. Telemetry failures never break an assistant.

const crypto = require('crypto');
const { AsyncLocalStorage } = require('async_hooks');

// USD per token [input, output] by model prefix — the vendor's Anthropic
// rows, plus the models this house actually runs
const PRICING = {
  'claude-sonnet-5': [3.00 / 1e6, 15.00 / 1e6],
  'claude-opus-4-8': [5.00 / 1e6, 25.00 / 1e6],
  'claude-opus-4-7': [5.00 / 1e6, 25.00 / 1e6],
  'claude-sonnet-4-6': [3.00 / 1e6, 15.00 / 1e6],
  'claude-haiku-4-5': [1.00 / 1e6, 5.00 / 1e6],
  'claude-opus-4': [15.00 / 1e6, 75.00 / 1e6],
  'claude-sonnet-4': [3.00 / 1e6, 15.00 / 1e6],
  'claude-3-5-sonnet': [3.00 / 1e6, 15.00 / 1e6],
  'claude-3-5-haiku': [0.80 / 1e6, 4.00 / 1e6],
};

const enabled = () => !!(process.env.MIMIR_API_KEY || process.env.MIMIR_API_URL);
const baseUrl = () => (process.env.MIMIR_API_URL || 'https://api.mimir.sh').replace(/\/+$/, '');
const now = () => Date.now() / 1000;

const post = (path, payload) => {
  try {
    const headers = { 'Content-Type': 'application/json' };
    if (process.env.MIMIR_API_KEY) headers.Authorization = `Bearer ${process.env.MIMIR_API_KEY}`;
    return fetch(baseUrl() + path, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5000),
    }).then((r) => r.arrayBuffer()).catch(() => {});
  } catch { return Promise.resolve(); }
};

const computeCost = (model, inTok, outTok) => {
  const exact = PRICING[model];
  if (exact) return inTok * exact[0] + outTok * exact[1];
  for (const prefix of Object.keys(PRICING).sort((a, b) => b.length - a.length)) {
    if (model.startsWith(prefix)) return inTok * PRICING[prefix][0] + outTok * PRICING[prefix][1];
  }
  return null;
};

// best-effort JSON-safe conversion, same shape as the Python _safe_serialize
const safe = (obj) => {
  if (obj === null || obj === undefined) return null;
  if (['string', 'number', 'boolean'].includes(typeof obj)) return obj;
  if (Array.isArray(obj)) return obj.map(safe);
  if (typeof obj === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(obj)) out[String(k)] = safe(v);
    return out;
  }
  return String(obj).slice(0, 1000);
};

// ── tasks (agent identities, stable via config hash) ─────────
const tasks = new Map();
const getTask = (name, { config, tools, model } = {}) => {
  if (!tasks.has(name)) {
    const cfg = config || name;
    const hash = crypto.createHash('sha256').update(cfg).digest('hex').slice(0, 12);
    tasks.set(name, { name, config: cfg, tools: tools || [], model: model || '', taskTypeId: `tg_${hash}`, configHash: hash, registered: false });
  }
  return tasks.get(name);
};

const register = (task) => {
  if (task.registered) return;
  task.registered = true;
  post('/api/mimir/task/register', {
    task_type_id: task.taskTypeId,
    name: task.name,
    config: task.config,
    config_hash: task.configHash,
    tools: task.tools,
    model: task.model,
  });
};

// ── runs ──────────────────────────────────────────────────────
const als = new AsyncLocalStorage();

const startRun = (task, input) => {
  register(task);
  const run = {
    task,
    runId: crypto.randomBytes(8).toString('hex'),
    input: input || {},
    steps: [],
    usage: { input_tokens: 0, output_tokens: 0 },
    costUsd: null,
    output: null,
    startedAt: now(),
    pending: [],
  };
  run.pending.push(post('/api/mimir/run/start', {
    run_id: run.runId,
    task_type_id: task.taskTypeId,
    task_name: task.name,
    input: run.input,
    started_at: run.startedAt,
  }));
  return run;
};

const addStep = (run, step) => {
  const full = { ...step, ts: now() };
  run.steps.push(full);
  run.pending.push(post('/api/mimir/run/step', { run_id: run.runId, ...full }));
};

const endRun = async (run, status) => {
  try {
    // let stragglers land, but never hold an assistant hostage for them
    await Promise.race([Promise.allSettled(run.pending), new Promise((r) => setTimeout(r, 2000))]);
    await post('/api/mimir/run/end', {
      run_id: run.runId,
      task_type_id: run.task.taskTypeId,
      task_name: run.task.name,
      status,
      duration_s: Math.round((now() - run.startedAt) * 1000) / 1000,
      steps: run.steps,
      usage: run.usage,
      cost_usd: run.costUsd,
      output: safe(run.output),
      ended_at: now(),
    });
  } catch { /* dashboard down — never break the agent */ }
};

// ── the anthropic response, read into steps (port of _process_response) ─
const processResponse = (run, response, model, durationMs) => {
  const usage = response?.usage;
  const turnIn = usage?.input_tokens || 0;
  const turnOut = usage?.output_tokens || 0;
  if (usage) {
    run.usage = {
      input_tokens: run.usage.input_tokens + turnIn,
      output_tokens: run.usage.output_tokens + turnOut,
    };
    const cost = computeCost(model, run.usage.input_tokens, run.usage.output_tokens);
    if (cost !== null) run.costUsd = Math.round(cost * 1e6) / 1e6;
  }
  if (turnIn || turnOut) {
    const turnCost = computeCost(model, turnIn, turnOut);
    addStep(run, {
      type: 'llm_call',
      model,
      input_tokens: turnIn,
      output_tokens: turnOut,
      cost_usd: turnCost ? Math.round(turnCost * 1e6) / 1e6 : null,
      duration_ms: Math.round(durationMs * 10) / 10,
    });
  }
  const content = response?.content || [];
  const toolCount = content.filter((b) => b?.type === 'tool_use').length;
  const perToolMs = toolCount ? durationMs / toolCount : 0;
  for (const block of content) {
    if (block?.type === 'tool_use') {
      addStep(run, { type: 'tool', tool: block.name || 'unknown', args: safe(block.input || {}), result: null, duration_ms: Math.round(perToolMs * 10) / 10 });
    } else if (block?.type === 'text' && block.text?.trim()) {
      addStep(run, { type: 'reasoning', text: block.text.slice(0, 2000), tokens: turnOut });
    } else if (block?.type === 'thinking' && block.thinking) {
      addStep(run, { type: 'reasoning', text: `[thinking] ${block.thinking.slice(0, 2000)}`, tokens: 0 });
    }
  }
  const stop = response?.stop_reason;
  if (stop && stop !== 'end_turn' && stop !== 'stop_sequence') {
    addStep(run, { type: 'reasoning', text: `[stop_reason: ${stop}]`, tokens: 0 });
  }
};

const lastUserText = (messages) => {
  for (const m of [...(messages || [])].reverse()) {
    if (m?.role !== 'user') continue;
    if (typeof m.content === 'string' && m.content) return m.content.slice(0, 500);
    if (Array.isArray(m.content)) {
      for (const b of m.content) if (b?.type === 'text' && b.text) return b.text.slice(0, 500);
    }
  }
  return '';
};

// ── public: trace + instrument ────────────────────────────────

// Group every messages.create inside fn into one named run:
//   await trace('Jane', question, () => client.messages.create({...}))
async function trace(name, input, fn) {
  if (!enabled()) return fn();
  const run = startRun(getTask(name), input ? { prompt: String(input).slice(0, 500) } : {});
  try {
    const result = await als.run(run, fn);
    await endRun(run, 'success');
    return result;
  } catch (err) {
    await endRun(run, 'error');
    throw err;
  }
}

let instrumented = false;
function instrumentAnthropic() {
  if (instrumented || !enabled()) return;
  const { Messages } = require('@anthropic-ai/sdk/resources/messages');
  const orig = Messages.prototype.create;
  Messages.prototype.create = function (params, opts) {
    // streaming keeps the untouched path; nothing in the house streams
    if (!params || params.stream) return orig.call(this, params, opts);
    const active = als.getStore();
    const started = Date.now();
    const exec = async (run) => {
      try {
        const result = await orig.call(this, params, opts);
        processResponse(run, result, params.model, Date.now() - started);
        return result;
      } catch (err) {
        addStep(run, { type: 'tool_error', tool: 'messages.create', args: { model: params.model }, error: String(err?.message || err), duration_ms: Date.now() - started });
        throw err;
      }
    };
    if (active) return exec(active);
    // a call outside any trace auto-creates a run named by its model
    const task = getTask(params.model, { model: params.model, tools: (params.tools || []).map((t) => t?.name).filter(Boolean) });
    const run = startRun(task, { prompt: lastUserText(params.messages) });
    return (async () => {
      try {
        const result = await exec(run);
        run.output = (result.content || []).map((b) => ({ type: b?.type || '', text: String(b?.text || '').slice(0, 200) }));
        await endRun(run, 'success');
        return result;
      } catch (err) {
        await endRun(run, 'error');
        throw err;
      }
    })();
  };
  instrumented = true;
}

module.exports = { trace, instrumentAnthropic };
