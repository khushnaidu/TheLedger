import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../../api';
import LedgerSheet from './LedgerSheet';
import { monthLabel, shiftMonth, todayIso } from './money';

// The book itself. Reached by drilling in from the overview, filtered by
// whatever was clicked. This is also where a bad import gets cleaned up:
// filter to one source, select, strike.

const SOURCES = [
  { id: 'manual', label: 'Written by hand' },
  { id: 'csv', label: 'From a statement' },
  { id: 'vera', label: 'Filed by Vera' },
];

const thisMonth = () => todayIso().slice(0, 7);

export default function LedgerLines() {
  const [params, setParams] = useSearchParams();
  const month = params.get('month') || thisMonth();
  const category = params.get('category') || '';
  const source = params.get('source') || '';
  const kind = params.get('kind') || '';
  const [query, setQuery] = useState(params.get('q') || '');

  const [entries, setEntries] = useState([]);
  const [categories, setCategories] = useState([]);
  const [selected, setSelected] = useState(() => new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const searching = query.trim().length > 0;
  const loose = entries.filter((e) => e.category === 'uncategorized').length;

  const set = (patch) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v); else next.delete(k);
    }
    setParams(next, { replace: true });
    setSelected(new Set());
  };

  const load = useCallback(async () => {
    setError('');
    try {
      const [rows, sums] = await Promise.all([
        api.getEntries({
          month: searching ? 'all' : month,
          ...(category && { category }),
          ...(source && { source }),
          ...(kind && { kind }),
          ...(searching && { q: query.trim() }),
        }),
        api.getFinanceSummary(month),
      ]);
      setEntries(rows);
      setCategories(sums.categories);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [month, category, source, kind, query, searching]);

  useEffect(() => {
    const t = setTimeout(load, searching ? 250 : 0);
    return () => clearTimeout(t);
  }, [load, searching]);

  const guard = (fn) => async (...args) => {
    setError('');
    try {
      const out = await fn(...args);
      await load();
      return out;
    } catch (err) {
      setError(err.message);
      throw err;
    }
  };

  const toggle = (id) => setSelected((s) => {
    const next = new Set(s);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  // the same sorting the importer offers, pointed at lines already in the
  // book — how a bad filing gets put right without retyping anything
  const sortLoose = async () => {
    const rows = entries.filter((e) => e.category === 'uncategorized');
    if (!rows.length || busy) return;
    setBusy(true);
    setError('');
    try {
      const names = [...new Set(rows.map((e) => e.description).filter(Boolean))];
      const map = {};
      for (let i = 0; i < names.length; i += 120) {
        const res = await api.sortCategories(names.slice(i, i + 120));
        Object.assign(map, res.map);
      }
      // one call per category rather than one per line
      const byCategory = new Map();
      for (const e of rows) {
        const cat = map[e.description];
        if (!cat || cat === 'uncategorized') continue;
        if (!byCategory.has(cat)) byCategory.set(cat, []);
        byCategory.get(cat).push(e.id);
      }
      for (const [cat, ids] of byCategory) await api.recategorize(ids, cat);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const strikeSelected = async () => {
    if (!selected.size || busy) return;
    setBusy(true);
    try {
      // one at a time, so a single failure cannot take the rest with it
      for (const id of selected) await api.deleteEntry(id);
      setSelected(new Set());
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const chips = [
    category && { key: 'category', label: category, clear: () => set({ category: '' }) },
    kind && { key: 'kind', label: kind === 'income' ? 'money in' : 'money out', clear: () => set({ kind: '' }) },
    source && {
      key: 'source',
      label: SOURCES.find((s) => s.id === source)?.label || source,
      clear: () => set({ source: '' }),
    },
  ].filter(Boolean);

  return (
    <div className="fin-page">
      <Link to="/finance" className="fin-back" data-clicky>← The Accounts</Link>

      <h1 className="t-title mt-3">
        {searching ? `“${query.trim()}” across the whole book` : monthLabel(month)}
      </h1>
      <div className="meta-strip mt-2">
        <span>{entries.length} lines</span>
        {chips.map((c) => (
          <button key={c.key} className="fin-chip" onClick={c.clear}>{c.label} ✕</button>
        ))}
      </div>

      <div className="rule mt-4" />

      <div className="fin-controls">
        <div className="fin-monthnav">
          <button onClick={() => set({ month: shiftMonth(month, -1) })} title="Previous month">‹</button>
          <span className="fin-monthlabel">{monthLabel(month)}</span>
          <button
            onClick={() => set({ month: shiftMonth(month, 1) })}
            disabled={month >= thisMonth()}
            title="Next month"
          >›</button>
        </div>
        <input
          className="input-field fin-search"
          placeholder="search the whole book…"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setSelected(new Set()); }}
        />
        <span className="fin-controls-gap" />
        <select className="select-field fin-sourcepick" value={source}
          onChange={(e) => set({ source: e.target.value })}>
          <option value="">Every line</option>
          {SOURCES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
      </div>

      {error && <p className="fin-error mb-3">{error}</p>}

      {!!loose && !selected.size && (
        <div className="fin-loosebar">
          <span className="t-label">
            {loose} {loose === 1 ? 'line has' : 'lines have'} no category
          </span>
          <button className="btn-ghost" onClick={sortLoose} disabled={busy}>
            {busy ? 'Vera is reading them…' : 'Have Vera sort them'}
          </button>
        </div>
      )}

      <div className={`fin-selbar ${selected.size ? 'fin-selbar-on' : ''}`}>
        <span className="t-label">
          {selected.size} {selected.size === 1 ? 'line' : 'lines'} selected
        </span>
        <button className="btn-black fin-selstrike" onClick={strikeSelected} disabled={busy}>
          {busy ? 'Striking…' : `Strike ${selected.size}`}
        </button>
        <button className="fin-linkish" onClick={() => setSelected(new Set())}>never mind</button>
      </div>

      {loading
        ? <p className="t-label">Opening the book…</p>
        : <LedgerSheet
            entries={entries}
            categories={categories}
            month={month}
            onCreate={guard((draft) => api.createEntry(draft))}
            onUpdate={guard((id, draft) => api.updateEntry(id, draft))}
            onDelete={guard((id) => api.deleteEntry(id))}
            selectable
            selected={selected}
            onToggle={toggle}
            onToggleAll={(on) => setSelected(on ? new Set(entries.map((e) => e.id)) : new Set())}
          />}

      <p className="fin-note t-small">
        Double-click a line to amend it. † came from a statement, ‡ came from Vera.
      </p>
    </div>
  );
}
