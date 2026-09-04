import { useState, useEffect, useRef } from 'react';
import { api } from '../api';
import { FighterArt, FighterPortrait, TapeRow, FloorFire, fmtDate } from './FaceOff';

// THE SPARRING RING — the code bout (ADR-0014). A SEPARATE rivalry from
// the Face-Off: its own partner link (connection kind 'leetcode'), so
// the tickets bout and the leetcode bout can be fought against
// different rivals. Leetcode/neetcode rounds logged per day with proof;
// both corners read the whole log, so the receipt is always inspectable.

const DIFF_LETTER = { easy: 'E', medium: 'M', hard: 'H' };
const sparDay = (d) => {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
};
// a pasted leetcode/neetcode link names its own problem
const titleFromUrl = (url) => {
  const m = String(url).match(/(?:leetcode\.com\/problems|neetcode\.io\/(?:problems|solutions))\/([\w-]+)/i);
  return m ? m[1].split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') : '';
};

function SparringLog({ you, partner }) {
  const [rows, setRows] = useState(null);
  const [form, setForm] = useState({ url: '', title: '', difficulty: '', kind: 'solved', proofUrl: '', note: '' });
  const [logBusy, setLogBusy] = useState(false);
  const [proofBusy, setProofBusy] = useState(false);
  const [err, setErr] = useState('');
  const [confirming, setConfirming] = useState(null);
  const fileRef = useRef(null);

  useEffect(() => { api.getProblems().then(setRows).catch(() => setRows([])); }, []);

  const log = async (e) => {
    e.preventDefault();
    if (!form.title.trim() || logBusy || proofBusy) return;
    setLogBusy(true);
    setErr('');
    try {
      const row = await api.logProblem(form);
      setRows((old) => [row, ...(old || [])]);
      setForm((f) => ({ url: '', title: '', difficulty: '', kind: f.kind, proofUrl: '', note: '' }));
    } catch (e2) { setErr(e2.message); }
    setLogBusy(false);
  };

  const attachProof = async (file) => {
    if (!file) return;
    setProofBusy(true);
    setErr('');
    try {
      const proofUrl = await api.uploadProofImage(file);
      setForm((f) => ({ ...f, proofUrl }));
    } catch (e2) { setErr(e2.message); }
    setProofBusy(false);
  };

  const strike = async (id) => {
    if (confirming !== id) {
      setConfirming(id);
      setTimeout(() => setConfirming((c) => (c === id ? null : c)), 2500);
      return;
    }
    setConfirming(null);
    try {
      await api.deleteProblem(id);
      setRows((old) => old.filter((r) => r.id !== id));
    } catch (e2) { setErr(e2.message); }
  };

  if (rows === null) return null;

  const today = sparDay(new Date());
  const weekAgo = Date.now() - 7 * 86400000;
  const n = (mine, pred = () => true) => rows.filter((r) => r.mine === mine && pred(r)).length;
  const streakOf = (mine) => {
    const days = new Set(rows.filter((r) => r.mine === mine).map((r) => sparDay(r.solvedAt)));
    let s = 0;
    const d = new Date();
    if (!days.has(sparDay(d))) d.setDate(d.getDate() - 1); // today is still open
    while (days.has(sparDay(d))) { s += 1; d.setDate(d.getDate() - 1); }
    return s;
  };

  // the log, interleaved newest-first with a scoreline where the day turns
  const lines = [];
  let lastDay = null;
  for (const r of rows) {
    const k = sparDay(r.solvedAt);
    if (k !== lastDay) {
      lastDay = k;
      const dayRows = rows.filter((x) => sparDay(x.solvedAt) === k);
      const mineN = dayRows.filter((x) => x.mine).length;
      lines.push(
        <p key={`day-${k}`} className="spar-dayline">
          {k === today ? 'today' : fmtDate(r.solvedAt)} — {you.name} {mineN} : {dayRows.length - mineN} {partner.name}
        </p>,
      );
    }
    lines.push(
      <div key={r.id} className="spar-round">
        <span className={`spar-corner ${r.mine ? '' : 'spar-corner-red'}`} aria-hidden="true" />
        {r.url
          ? <a className="spar-title" href={r.url} target="_blank" rel="noreferrer">{r.title}</a>
          : <span className="spar-title">{r.title}</span>}
        {r.difficulty && <span className={`spar-diff spar-diff-${r.difficulty}`}>{DIFF_LETTER[r.difficulty]}</span>}
        {r.kind === 'studied' && <span className="spar-studied">studied</span>}
        {r.proofUrl
          ? <a className="spar-receipt" href={r.proofUrl} target="_blank" rel="noreferrer">receipt ↗</a>
          : <span className="spar-honor">on honor</span>}
        {r.note && <span className="spar-note">{r.note}</span>}
        {r.mine && (
          <button type="button" className={`spar-x ${confirming === r.id ? 'spar-x-hot' : ''}`}
            title="Strike this round from your log" onClick={() => strike(r.id)}>
            {confirming === r.id ? 'SURE?' : '×'}
          </button>
        )}
      </div>,
    );
  }

  return (
    <div className="mb-16">
      <p className="t-label mb-2">The rounds</p>
      <p className="fig-caption mb-5">counted head to head — a receipt or it's on honor</p>

      <div style={{ borderTop: '1px solid var(--ink)' }}>
        <TapeRow label="Rounds today" you={n(true, (r) => sparDay(r.solvedAt) === today)} partner={n(false, (r) => sparDay(r.solvedAt) === today)} />
        <TapeRow label="Rounds this week" you={n(true, (r) => +new Date(r.solvedAt) > weekAgo)} partner={n(false, (r) => +new Date(r.solvedAt) > weekAgo)} />
        <TapeRow label="Rounds all-time" you={n(true)} partner={n(false)} />
        <TapeRow label="Hards felled" you={n(true, (r) => r.difficulty === 'hard' && r.kind === 'solved')} partner={n(false, (r) => r.difficulty === 'hard' && r.kind === 'solved')} />
        <TapeRow label="Grind streak" you={streakOf(true)} partner={streakOf(false)} suffix="d" />
      </div>

      <form className="spar-form" onSubmit={log}>
        <div className="spar-form-row">
          <input className="input-field flex-1" placeholder="paste the problem link — leetcode or neetcode"
            value={form.url}
            onChange={(e) => {
              const url = e.target.value;
              setForm((f) => ({ ...f, url, title: f.title || titleFromUrl(url) }));
            }} />
          <input className="input-field flex-1" placeholder="problem name" maxLength={140}
            value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
        </div>
        <div className="spar-form-row">
          <select className="select-field" value={form.difficulty}
            onChange={(e) => setForm((f) => ({ ...f, difficulty: e.target.value }))}>
            <option value="">difficulty —</option>
            <option value="easy">easy</option>
            <option value="medium">medium</option>
            <option value="hard">hard</option>
          </select>
          <div className="spar-kind">
            {['solved', 'studied'].map((k) => (
              <button key={k} type="button"
                className={`spar-kind-btn ${form.kind === k ? 'spar-kind-on' : ''}`}
                onClick={() => setForm((f) => ({ ...f, kind: k }))}>{k}</button>
            ))}
          </div>
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden"
            onChange={(e) => { attachProof(e.target.files?.[0]); e.target.value = ''; }} />
          {form.proofUrl ? (
            <span className="spar-attached">
              receipt attached
              <button type="button" className="spar-x" title="Drop the receipt"
                onClick={() => setForm((f) => ({ ...f, proofUrl: '' }))}>×</button>
            </span>
          ) : (
            <button type="button" className="btn-ghost" disabled={proofBusy}
              onClick={() => fileRef.current?.click()}>
              {proofBusy ? 'attaching…' : 'attach a receipt'}
            </button>
          )}
          <button type="submit" className="btn-black" disabled={logBusy || proofBusy || !form.title.trim()}>
            {logBusy ? 'logging…' : 'log the round'}
          </button>
        </div>
      </form>
      {err && <p className="t-small mb-4" style={{ color: 'var(--stamp)' }}>{err}</p>}

      {rows.length === 0
        ? <p className="t-body">No rounds logged. First blood is available.</p>
        : <div className="spar-rounds">{lines}</div>}
    </div>
  );
}

export default function SparringRing() {
  const [conn, setConn] = useState(null);
  const [me, setMe] = useState(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = () => Promise.all([api.getSparBout(), api.getMe()])
    .then(([c, u]) => { setConn(c); setMe(u); })
    .catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  const act = async (fn) => {
    setBusy(true);
    setError('');
    try { await fn(); await load(); } catch (e) { setError(e.message); }
    setBusy(false);
  };

  if (conn === null || me === null) {
    return <p className="t-label pt-10">weighing in…</p>;
  }

  const connected = conn.status === 'CONNECTED';

  return (
    <div className="max-w-[820px] stagger">
      <div className="flex items-end justify-between pt-10 mb-12">
        <div>
          <p className="t-label mb-4">Bout № 002 · the code ring · sanctioned by the bureau</p>
          <h1 className="t-display">The Sparring Ring</h1>
        </div>
        {connected && (
          <p className="t-label text-right">sparring since<br />{conn.since ? fmtDate(conn.since) : '—'}</p>
        )}
      </div>

      {connected ? (
        <>
          <div className="flex items-center justify-between mb-10">
            <FighterPortrait user={me} vs={conn.partner} corner="black" />
            <div className="text-center self-center px-4">
              <p className="t-display" style={{ fontSize: '4rem', color: 'var(--stamp)', lineHeight: 1 }}>vs</p>
              <p className="t-label mt-3">no purse ·<br />big o only</p>
            </div>
            <FighterPortrait user={conn.partner} vs={me} corner="red" flipped />
          </div>
          <SparringLog you={me} partner={conn.partner} />
          {error && <p className="t-small mb-6" style={{ color: 'var(--stamp)' }}>{error}</p>}
          <div className="pb-10">
            <button className="btn-ghost" disabled={busy}
              onClick={() => { if (window.confirm('Hang up the gloves? The log stays filed, but the ring closes.')) act(api.unlinkSpar); }}>
              hang up the gloves
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="flex items-center justify-center gap-10 mb-12">
            <div className="w-[200px]"><div className="border border-[var(--ink)] p-1 bg-white"><FighterArt user={me} /></div></div>
            <p className="t-display" style={{ fontSize: '3rem', color: 'var(--stamp)' }}>vs</p>
            <div className="w-[200px] relative"><div className="border border-[var(--ink)] p-1 bg-white relative"><FighterArt mystery opposeUser={me} /></div></div>
          </div>

          {conn.status === 'PENDING_SENT' && (
            <div className="text-center">
              <p className="t-body mb-6">The challenge is out to {conn.partner?.name || 'your rival'}. The ring waits.</p>
              <button className="btn-ghost" disabled={busy} onClick={() => act(api.unlinkSpar)}>withdraw the challenge</button>
            </div>
          )}
          {conn.status === 'PENDING_RECEIVED' && (
            <div className="text-center">
              <p className="t-body mb-6">{conn.partner?.name} calls you out for code sparring.</p>
              <div className="flex gap-4 justify-center">
                <button className="btn-black" disabled={busy} onClick={() => act(api.acceptSpar)}>step into the ring</button>
                <button className="btn-ghost" disabled={busy} onClick={() => act(api.unlinkSpar)}>decline</button>
              </div>
            </div>
          )}
          {conn.status === 'NONE' && (
            <form className="max-w-[380px] mx-auto text-center"
              onSubmit={(e) => { e.preventDefault(); if (inviteEmail.trim()) act(() => api.inviteSpar(inviteEmail)); }}>
              <p className="t-body mb-6">
                A separate bout from the Face-Off: leetcode rounds, counted daily, receipts inspected. Call out your sparring partner by email.
              </p>
              <input type="email" className="input-field w-full mb-4" placeholder="rival@example.com"
                value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} />
              <button type="submit" className="btn-black mx-auto" disabled={busy}>call them out</button>
            </form>
          )}
          {error && <p className="t-small text-center mt-6" style={{ color: 'var(--stamp)' }}>{error}</p>}
        </>
      )}

      <div className="mt-24"><FloorFire /></div>
    </div>
  );
}
