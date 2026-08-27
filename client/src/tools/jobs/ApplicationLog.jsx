import { useEffect, useRef, useState } from 'react';
import { api } from '../../api';

// THE APPLICATION LOG — the job hunt's other half (ADR-0012). Paste a
// posting into the intake slip and it files itself as applied-for: a
// Haiku clerk reads company, role, location, and pay out of the paste.
// The book itself is a ruled ledger page: one line per application,
// four tick columns for what came of it, marks in a written hand.

const TICKS = [
  ['heard', 'Heard'],
  ['interview', 'Intv.'],
  ['offer', 'Offer'],
  ['closed', 'No'],
];

// ── the tally rail ─
// Everything is derived on the client from the rows already fetched.
// The beat (what kind of jobs) is keyword-bucketed from the role line;
// first match wins, so the order below is broad-before-narrow on purpose.
const DISCIPLINES = [
  ['ML / AI', /\b(ml|machine learning|ai|deep learning|llm|nlp|computer vision)\b/i],
  ['Data', /\bdata\b|analytics|\betl\b/i],
  ['Full-stack', /full[\s-]?stack/i],
  ['Frontend', /front[\s-]?end|react|\bui\b/i],
  ['Backend', /back[\s-]?end|\bapi\b/i],
  ['Platform / Infra', /platform|infra|devops|\bsre\b|site reliability|cloud|systems/i],
  ['Security', /security|appsec/i],
  ['Mobile', /mobile|\bios\b|android/i],
  ['Robotics', /robot/i],
  ['Embedded', /embedded|firmware/i],
];
const RANKS = [
  ['Intern', /intern/i],
  ['New grad', /new grad|entry[\s-]?level|junior|early career|university grad/i],
  ['Staff+', /staff|principal|distinguished|\blead\b/i],
  ['Senior', /senior|\bsr\b/i],
];
const bucket = (table, text, fallback) =>
  (table.find(([, re]) => re.test(text)) || [fallback])[0];
const tally = (rows, table, fallback) => {
  const m = new Map();
  for (const r of rows) {
    const k = bucket(table, r.role, fallback);
    m.set(k, (m.get(k) || 0) + 1);
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
};
const dayKey = (d) => d.toISOString().slice(0, 10);

function LogStats({ rows }) {
  if (!rows.length) return null;
  const n = rows.length;
  const pad = (x) => String(x).padStart(2, '0');
  const replied = rows.filter((r) => r.heard || r.interview || r.offer || r.closed).length;
  const interviews = rows.filter((r) => r.interview).length;
  const offers = rows.filter((r) => r.offer).length;
  const nos = rows.filter((r) => r.closed).length;
  const waiting = rows.filter((r) => !r.heard && !r.interview && !r.offer && !r.closed);
  const oldestWait = waiting.length
    ? Math.floor((Date.now() - Math.min(...waiting.map((r) => +new Date(r.appliedAt)))) / 86400000)
    : 0;

  // the pace: one bar per day, most recent fortnight
  const days = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    days.push({ key: dayKey(d), count: 0 });
  }
  const byDay = new Map(days.map((d) => [d.key, d]));
  let best = 0;
  const perDay = new Map();
  for (const r of rows) {
    const k = dayKey(new Date(r.appliedAt));
    perDay.set(k, (perDay.get(k) || 0) + 1);
    if (byDay.has(k)) byDay.get(k).count += 1;
  }
  for (const c of perDay.values()) best = Math.max(best, c);
  const week = days.slice(7).reduce((a, d) => a + d.count, 0);
  const firstDay = Math.min(...rows.map((r) => +new Date(r.appliedAt)));
  const span = Math.max(1, Math.ceil((Date.now() - firstDay) / 86400000));
  const avg = (n / span).toFixed(1);
  const maxBar = Math.max(1, ...days.map((d) => d.count));

  const beat = tally(rows, DISCIPLINES, 'Other');
  const ranks = tally(rows, RANKS, 'Mid-level');

  return (
    <aside className="al-stats">
      <div className="al-stats-box">
        <p className="al-stats-head">The tally</p>
        <div className="al-stat"><span>Filed</span><span>{pad(n)}</span></div>
        <div className="al-stat"><span>Replied</span><span>{pad(replied)} · {Math.round((replied / n) * 100)}%</span></div>
        <div className="al-stat"><span>Interviews</span><span>{pad(interviews)}</span></div>
        <div className="al-stat"><span>Offers</span><span>{pad(offers)}</span></div>
        <div className="al-stat"><span>Nos</span><span>{pad(nos)}</span></div>
        <div className="al-stat"><span>Still waiting</span><span>{pad(waiting.length)}</span></div>
        {waiting.length > 0 && oldestWait > 0 && (
          <p className="al-stats-note">the oldest has waited {oldestWait} {oldestWait === 1 ? 'day' : 'days'}</p>
        )}
      </div>

      <div className="al-stats-box">
        <p className="al-stats-head">The pace</p>
        <div className="al-days" aria-hidden="true">
          {days.map((d) => (
            <div key={d.key} className="al-day" title={`${d.key} — ${d.count}`}>
              <div className="al-day-bar" style={{ height: `${Math.round((d.count / maxBar) * 100)}%` }} />
            </div>
          ))}
        </div>
        <p className="al-stats-note">last fortnight, by day</p>
        <div className="al-stat"><span>This week</span><span>{pad(week)}</span></div>
        <div className="al-stat"><span>Per day, all told</span><span>{avg}</span></div>
        <div className="al-stat"><span>Best day</span><span>{pad(best)}</span></div>
      </div>

      <div className="al-stats-box">
        <p className="al-stats-head">The beat</p>
        {beat.map(([k, c]) => (
          <div key={k} className="al-stat al-stat-barred">
            <span>{k}</span><span>{pad(c)}</span>
            <div className="al-beat-bar" style={{ width: `${Math.round((c / n) * 100)}%` }} />
          </div>
        ))}
      </div>

      <div className="al-stats-box">
        <p className="al-stats-head">The rank</p>
        {ranks.map(([k, c]) => (
          <div key={k} className="al-stat"><span>{k}</span><span>{pad(c)}</span></div>
        ))}
      </div>
    </aside>
  );
}

const stamp = (iso) => {
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${String(d.getFullYear()).slice(2)}`;
};

function LogLine({ row, idx, band, onToggle, onAmend, onStrike, confirming }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ company: row.company, role: row.role });

  const save = () => {
    setEditing(false);
    if (form.company !== row.company || form.role !== row.role) onAmend(row.id, form);
  };

  return (
    <>
      <tr className={`al-line ${band ? 'al-band' : ''} ${row.closed ? 'al-line-closed' : ''}`}>
        <td className="al-no">{String(idx + 1).padStart(3, '0')}</td>
        <td className="al-date">{stamp(row.appliedAt)}</td>
        <td className="al-position" onClick={() => !editing && setOpen((o) => !o)}
          onDoubleClick={(e) => { e.stopPropagation(); setForm({ company: row.company, role: row.role }); setEditing(true); }}
          title="Click to unfold the posting · double-click to amend">
          {editing ? (
            <span className="al-edit" onClick={(e) => e.stopPropagation()}>
              <input className="al-edit-input" value={form.company} maxLength={90} autoFocus placeholder="company"
                onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))}
                onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false); }} />
              <input className="al-edit-input al-edit-role" value={form.role} maxLength={120} placeholder="role"
                onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
                onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false); }}
                onBlur={save} />
            </span>
          ) : (
            <>
              <span className="al-company">{row.company || '—'}</span>
              <span className="al-role">{row.role}</span>
              {(row.location || row.salary) && (
                <span className="al-particulars">
                  {row.location}{row.location && row.salary ? ' · ' : ''}{row.salary}
                </span>
              )}
            </>
          )}
        </td>
        {TICKS.map(([field]) => (
          <td key={field} className="al-tickcell">
            <button type="button" data-clicky
              className={`al-tick ${row[field] ? 'al-tick-on' : ''} ${field === 'closed' ? 'al-tick-no' : ''}`}
              title={row[field] ? 'Untick' : 'Tick'}
              onClick={() => onToggle(row.id, field, !row[field])}>
              {row[field] ? (field === 'closed' ? '✗' : '✓') : ''}
            </button>
          </td>
        ))}
        <td className="al-strikecell">
          <button type="button" className={`al-strike ${confirming ? 'al-strike-hot' : ''}`}
            title="Strike this line from the record" onClick={() => onStrike(row.id)}>
            {confirming ? 'SURE?' : '×'}
          </button>
        </td>
      </tr>
      {open && !editing && (
        <tr className="al-foldrow">
          <td colSpan={3 + TICKS.length + 1}>
            <div className="al-fold">
              <p className="al-fold-head">
                the posting, as pasted
                {row.url && <> · <a className="al-fold-link" href={row.url} target="_blank" rel="noreferrer">open the listing ↗</a></>}
              </p>
              <pre className="al-fold-raw">{row.raw || '(nothing kept)'}</pre>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export default function ApplicationLog() {
  const [rows, setRows] = useState(null);
  const [paste, setPaste] = useState('');
  const [filing, setFiling] = useState(false);
  const [error, setError] = useState('');
  const [confirming, setConfirming] = useState(null);
  const confirmTimer = useRef(null);

  useEffect(() => {
    api.getApplications().then(setRows).catch((e) => { setError(e.message); setRows([]); });
  }, []);

  const file = async () => {
    const raw = paste.trim();
    if (!raw || filing) return;
    setFiling(true);
    setError('');
    try {
      const row = await api.fileApplication(raw);
      setRows((old) => [row, ...(old || [])]);
      setPaste('');
    } catch (e) { setError(e.message); }
    setFiling(false);
  };

  const toggle = async (id, field, value) => {
    setRows((old) => old.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
    try {
      await api.updateApplication(id, { [field]: value });
    } catch (e) {
      setError(e.message);
      setRows((old) => old.map((r) => (r.id === id ? { ...r, [field]: !value } : r)));
    }
  };

  const amend = async (id, form) => {
    try {
      const updated = await api.updateApplication(id, form);
      setRows((old) => old.map((r) => (r.id === id ? updated : r)));
    } catch (e) { setError(e.message); }
  };

  const strike = async (id) => {
    if (confirming !== id) {
      setConfirming(id);
      clearTimeout(confirmTimer.current);
      confirmTimer.current = setTimeout(() => setConfirming((c) => (c === id ? null : c)), 2500);
      return;
    }
    setConfirming(null);
    try {
      await api.deleteApplication(id);
      setRows((old) => old.filter((r) => r.id !== id));
    } catch (e) { setError(e.message); }
  };

  const heard = (rows || []).filter((r) => r.heard).length;
  return (
    <div className="al-page stagger">
      <p className="t-label">The Classifieds · No. 02</p>
      <h1 className="t-display">The Application Log</h1>
      <p className="t-label mt-1" style={{ color: 'var(--ink-30)' }}>
        Every posting you answered, and what came of it.
      </p>

      <div className="al-intake">
        <p className="al-intake-head">Intake — paste the posting, whole</p>
        <textarea className="al-paste" rows={4} value={paste} maxLength={12000}
          placeholder="paste the job posting here — company, role, and the rest are read out of it and filed as applied-for"
          onChange={(e) => setPaste(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) file(); }} />
        <button data-clicky className="btn-black" disabled={filing || !paste.trim()} onClick={file}>
          {filing ? 'The clerk is reading…' : 'File it as applied'}
        </button>
      </div>

      {error && <p className="jb-error">{error}</p>}

      {rows === null ? (
        <div className="pt-16 flex justify-center">
          <div className="loader"><div className="loader-bar" /><div className="loader-bar" /><div className="loader-bar" /><div className="loader-bar" /></div>
        </div>
      ) : (
        <div className="al-spread">
          <div className="al-bookcol">
          <div className="al-book">
            <div className="al-holes" aria-hidden="true" />
            <div className="al-grid">
              <div className="al-plate-head">
                <span>Record of replies</span>
                <span>{rows.length} filed</span>
              </div>
              <table className="al-table">
              <thead>
                <tr className="al-cols">
                  <th className="al-no">Nº</th>
                  <th className="al-date">Filed</th>
                  <th className="al-position">Position</th>
                  {TICKS.map(([f, label]) => <th key={f} className="al-tickcell">{label}</th>)}
                  <th className="al-strikecell" aria-label="strike" />
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr><td colSpan={3 + TICKS.length + 1} className="al-empty">
                    The log lies open, unmarked. Paste your first posting above.
                  </td></tr>
                ) : rows.map((r, i) => (
                  <LogLine key={r.id} row={r} idx={rows.length - 1 - i} band={i % 2 === 1}
                    onToggle={toggle} onAmend={amend} onStrike={strike}
                    confirming={confirming === r.id} />
                ))}
              </tbody>
              </table>
            </div>
          </div>
          <p className="fig-caption mt-3">
            fig. the application log — {rows.length} filed · {heard} heard back
          </p>
          </div>
          <LogStats rows={rows} />
        </div>
      )}
    </div>
  );
}
