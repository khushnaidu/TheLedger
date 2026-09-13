// The bench's side of the engine room: one worker, replaced wholesale
// when a run overstays its welcome. The timeout clock starts when the
// worker says `running`, so the first boot (a 10MB download on a cold
// cache) never gets a drill killed for slow wifi.

let worker = null;
let seq = 0;
const pending = new Map();
const stateListeners = new Set();
let engineState = 'cold'; // cold | booting | ready

const setState = (s) => {
  engineState = s;
  for (const fn of stateListeners) fn(s);
};

export const onEngineState = (fn) => {
  stateListeners.add(fn);
  fn(engineState);
  return () => stateListeners.delete(fn);
};

const spawn = () => {
  worker = new Worker(new URL('./pyWorker.js', import.meta.url), { type: 'module' });
  setState('booting');
  worker.onmessage = ({ data }) => {
    if (data.ready) { setState('ready'); return; }
    if (data.bootError) { setState('cold'); return; }
    const job = pending.get(data.id);
    if (!job) return;
    if (data.running) {
      job.timer = setTimeout(() => {
        pending.delete(data.id);
        worker.terminate();
        worker = null;
        setState('cold');
        job.resolve({ timedOut: true, error: `Stopped after ${job.timeout / 1000}s. An infinite loop, perhaps? The engine has been restarted.` });
      }, job.timeout);
    } else if (data.stream !== undefined) {
      job.onStream?.(data.stream, data.kind);
    } else if (data.done) {
      clearTimeout(job.timer);
      pending.delete(data.id);
      job.resolve({ result: data.result ?? null, error: data.error });
    }
  };
};

export const warmUp = () => {
  if (!worker) spawn();
  worker.postMessage({ warm: true });
};

export function runPython(code, { onStream, timeout = 15_000 } = {}) {
  if (!worker) spawn();
  const id = ++seq;
  return new Promise((resolve) => {
    pending.set(id, { onStream, resolve, timeout, timer: null });
    worker.postMessage({ id, code });
  });
}
