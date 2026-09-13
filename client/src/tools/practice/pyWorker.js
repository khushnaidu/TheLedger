// The engine room: real CPython (Pyodide, WASM) in a worker so a runaway
// loop hangs this thread, not the page — the manager just terminates us
// and spawns a fresh one. Module worker; pyodide arrives as ESM off the
// CDN at first boot (~10MB, cached by the browser after that).

const INDEX = 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/';

// The bench keeps leetcode's table manners: the names every drill
// reaches for are already in scope, so `deque()` and `List[int]` work
// from the first line, imports written or not. Each run gets a fresh
// namespace seeded with these — no stale variables from the last run.
const PRELUDE = `
import collections, itertools, heapq, bisect, math, functools, re, json, string, random
from collections import deque, defaultdict, Counter, OrderedDict, namedtuple
from typing import List, Dict, Tuple, Set, Optional, Union, Any, Iterator, Callable
from functools import lru_cache, cache, reduce
from heapq import heappush, heappop, heapify, nlargest, nsmallest
from itertools import permutations, combinations, product, accumulate, groupby, chain, pairwise
from bisect import bisect_left, bisect_right, insort
from math import inf, gcd, ceil, floor, sqrt, comb, factorial
`;

let bootPromise = null;
const boot = () => {
  bootPromise ??= (async () => {
    const { loadPyodide } = await import(/* @vite-ignore */ `${INDEX}pyodide.mjs`);
    const py = await loadPyodide({ indexURL: INDEX });
    self.postMessage({ ready: true });
    return py;
  })();
  return bootPromise;
};

self.onmessage = async ({ data }) => {
  if (data.warm) { boot().catch((e) => self.postMessage({ bootError: String(e) })); return; }
  const { id, code } = data;
  try {
    const py = await boot();
    // `running` starts the manager's timeout clock — boot time never counts
    self.postMessage({ id, running: true });
    py.setStdout({ batched: (s) => self.postMessage({ id, stream: s, kind: 'out' }) });
    py.setStderr({ batched: (s) => self.postMessage({ id, stream: s, kind: 'err' }) });
    await py.loadPackagesFromImports(code);
    const ns = py.toPy({});
    try {
      py.runPython(PRELUDE, { globals: ns });
      const result = await py.runPythonAsync(code, { globals: ns });
      let echo = null;
      if (result !== undefined && result !== null) {
        echo = String(result);
        if (typeof result.destroy === 'function') result.destroy();
      }
      self.postMessage({ id, done: true, result: echo });
    } finally {
      ns.destroy();
    }
  } catch (err) {
    // PythonError.message carries the whole traceback — the good stuff.
    // But it opens with pyodide's own eval_code_async frames, which read
    // as someone else's bug; cut to the student's first frame ("<exec>")
    let msg = (err && err.message) || String(err);
    const own = msg.indexOf('  File "<exec>"');
    if (msg.startsWith('Traceback') && own > 0) {
      msg = `Traceback (most recent call last):\n${msg.slice(own)}`;
    }
    self.postMessage({ id, done: true, error: msg });
  }
};
