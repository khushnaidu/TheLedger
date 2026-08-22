import { useMemo, useRef, useState } from 'react';
import {
  cents, dayInput, fmt, foot, monthLabel, parseDayInput, shortDate, todayIso, STARTER_CATEGORIES,
} from './money';

// The book reads downward: oldest line at the top, the balance running
// with it, the total footed at the bottom. New lines are written on the
// blank rule at the foot, which is where a pen would go.

const SOURCE_MARK = { manual: '', csv: '†', vera: '‡' };

function AmountPair({ kind, amount, onChange, autoFocus }) {
  // a real book has two money columns; whichever one you write in
  // decides whether the line is a debit or a credit
  const write = (side) => (e) => onChange({ kind: side, amount: e.target.value });
  return (
    <>
      <input
        className="fin-cell fin-num" inputMode="decimal" placeholder="—"
        autoFocus={autoFocus}
        value={kind === 'expense' ? amount : ''}
        onChange={write('expense')}
      />
      <input
        className="fin-cell fin-num" inputMode="decimal" placeholder="—"
        value={kind === 'income' ? amount : ''}
        onChange={write('income')}
      />
    </>
  );
}

function DayCell({ iso, year, onChange }) {
  const [text, setText] = useState(() => dayInput(iso));
  const [bad, setBad] = useState(false);
  const type = (v) => {
    setText(v);
    const next = parseDayInput(v, year);
    if (next) { setBad(false); onChange(next); } else setBad(v.trim() !== '');
  };
  return (
    <input
      className={`fin-cell fin-date ${bad ? 'fin-cell-bad' : ''}`}
      value={text} placeholder="mm.dd" maxLength={10}
      onChange={(e) => type(e.target.value)}
    />
  );
}

function EditRow({ draft, setDraft, categories, year, onCommit, onCancel, submitLabel, lead }) {
  const submit = (e) => {
    e?.preventDefault();
    if (!draft.amount.trim()) return;
    onCommit(draft);
  };
  return (
    <div
      className="fin-line fin-line-edit"
      onKeyDown={(e) => {
        if (e.key === 'Enter') submit(e);
        if (e.key === 'Escape') onCancel?.();
      }}
    >
      {lead && <span />}
      <DayCell iso={draft.date} year={year} onChange={(date) => setDraft({ ...draft, date })} />
      <input
        className="fin-cell" placeholder="particulars…" maxLength={160}
        value={draft.description}
        onChange={(e) => setDraft({ ...draft, description: e.target.value })}
      />
      <input
        className="fin-cell fin-cat-input" placeholder="category…" list="fin-categories" maxLength={32}
        value={draft.category}
        onChange={(e) => setDraft({ ...draft, category: e.target.value })}
      />
      <AmountPair
        kind={draft.kind} amount={draft.amount}
        onChange={({ kind, amount }) => setDraft({ ...draft, kind, amount })}
      />
      <button className="fin-post" onClick={submit} disabled={!draft.amount.trim()}>{submitLabel}</button>
      {onCancel
        ? <button className="fin-strike" onClick={onCancel} title="Never mind">✕</button>
        : <span />}
      <datalist id="fin-categories">
        {[...new Set([...categories, ...STARTER_CATEGORIES])].map((c) => <option key={c} value={c} />)}
      </datalist>
    </div>
  );
}

export default function LedgerSheet({
  entries, categories, month, onCreate, onUpdate, onDelete,
  selectable, selected, onToggle, onToggleAll,
}) {
  const year = month.slice(0, 4);
  const [editId, setEditId] = useState(null);
  const [edit, setEdit] = useState(null);
  const [fresh, setFresh] = useState({
    date: todayIso(), description: '', category: '', kind: 'expense', amount: '',
  });
  const [busy, setBusy] = useState(false);
  const [confirmId, setConfirmId] = useState(null);
  const [lastMonth, setLastMonth] = useState(month);
  const confirmTimer = useRef(null);

  // turning the page moves the pen with it, so a line written on JUL does
  // not quietly land in AUG. Adjusted during render, not in an effect.
  if (month !== lastMonth) {
    setLastMonth(month);
    setFresh((f) => ({
      ...f,
      date: month === todayIso().slice(0, 7) ? todayIso() : `${month}-01`,
    }));
  }

  // oldest first, with the balance running alongside
  const rows = useMemo(() => {
    const asc = [...entries].sort((a, b) =>
      a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));
    let run = 0;
    return asc.map((e) => {
      run += e.kind === 'income' ? cents(e.amount) : -cents(e.amount);
      return { ...e, balance: run };
    });
  }, [entries]);

  const totals = rows.reduce(
    (a, e) => (e.kind === 'income'
      ? { ...a, in: a.in + cents(e.amount) }
      : { ...a, out: a.out + cents(e.amount) }),
    { in: 0, out: 0 }
  );

  const write = async (draft) => {
    if (busy) return;
    setBusy(true);
    try {
      await onCreate(draft);
      setFresh({ date: draft.date, description: '', category: '', kind: draft.kind, amount: '' });
    } finally {
      setBusy(false);
    }
  };

  const openEdit = (e) => {
    setEditId(e.id);
    setEdit({
      date: e.date.slice(0, 10),
      description: e.description,
      category: e.category,
      kind: e.kind,
      amount: e.amount,
    });
  };

  const commitEdit = async (draft) => {
    const id = editId;
    setEditId(null);
    await onUpdate(id, draft);
  };

  // two presses to strike a line, and the arming lapses on its own
  const strike = (id) => {
    clearTimeout(confirmTimer.current);
    if (confirmId !== id) {
      setConfirmId(id);
      confirmTimer.current = setTimeout(() => setConfirmId(null), 2600);
      return;
    }
    setConfirmId(null);
    onDelete(id);
  };

  return (
    <div className="fin-sheet">
      <div className="fin-holes" aria-hidden="true" />

      <div className={`fin-grid ${selectable ? 'fin-grid-sel' : ''}`}>
        <div className="fin-line fin-head">
          {selectable && (
            <input
              type="checkbox" className="fin-check"
              checked={!!rows.length && selected.size === rows.length}
              onChange={(e) => onToggleAll(e.target.checked)}
              title="Select every line on view"
            />
          )}
          <span>Date</span>
          <span>Particulars</span>
          <span>Category</span>
          <span className="fin-num">Out</span>
          <span className="fin-num">In</span>
          <span className="fin-num">Balance</span>
          <span />
        </div>

        {!rows.length && (
          <div className="fin-empty">
            <p className="t-label">No lines entered for {monthLabel(month)}</p>
            <p className="fin-empty-sub">Write one on the rule below, drop a statement, or tell Vera.</p>
          </div>
        )}

        {rows.map((e, i) => (
          editId === e.id ? (
            <EditRow
              key={e.id} draft={edit} setDraft={setEdit} categories={categories} year={year} lead={selectable}
              onCommit={commitEdit} onCancel={() => setEditId(null)} submitLabel="Amend"
            />
          ) : (
            <div
              key={e.id}
              className={`fin-line fin-row ${i % 2 ? 'fin-band' : ''}`}
              onDoubleClick={() => openEdit(e)}
            >
              {selectable && (
                <input
                  type="checkbox" className="fin-check"
                  checked={selected.has(e.id)}
                  onChange={() => onToggle(e.id)}
                />
              )}
              <span className="fin-date">{shortDate(e.date)}</span>
              <span className="fin-part" title={e.description}>
                {e.description || <em className="fin-blank">no particulars</em>}
                <i className="fin-mark">{SOURCE_MARK[e.source]}</i>
              </span>
              <span className="fin-cat">{e.category}</span>
              <span className="fin-num">{e.kind === 'expense' ? fmt(e.amount) : ''}</span>
              <span className="fin-num fin-credit">{e.kind === 'income' ? fmt(e.amount) : ''}</span>
              <span className="fin-num fin-bal">{foot(e.balance)}</span>
              <button
                className={`fin-strike ${confirmId === e.id ? 'fin-strike-armed' : ''}`}
                onClick={() => strike(e.id)}
                title={confirmId === e.id ? 'Press again to strike this line' : 'Strike this line'}
              >
                {confirmId === e.id ? '!' : '✕'}
              </button>
            </div>
          )
        ))}

        <EditRow
          key={month}
          draft={fresh} setDraft={setFresh} categories={categories} year={year} lead={selectable}
          onCommit={write} submitLabel={busy ? '…' : 'Enter'}
        />

        <div className="fin-line fin-footrow">
          {selectable && <span />}
          <span />
          <span className="fin-carried">Carried forward</span>
          <span className="fin-num t-label">{rows.length} {rows.length === 1 ? 'line' : 'lines'}</span>
          <span className="fin-num">{foot(totals.out)}</span>
          <span className="fin-num fin-credit">{foot(totals.in)}</span>
          <span className={`fin-num fin-bal ${totals.in - totals.out < 0 ? 'fin-neg' : ''}`}>
            {foot(totals.in - totals.out)}
          </span>
          <span />
        </div>
      </div>
    </div>
  );
}
