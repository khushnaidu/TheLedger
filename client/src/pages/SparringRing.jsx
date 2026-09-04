import { useState, useEffect, useRef } from 'react';
import { api } from '../api';
import { FighterArt, FighterPortrait, TapeRow, FloorFire, fmtDate } from './FaceOff';

// THE SPARRING RING — the code bout (ADR-0014). A SEPARATE rivalry from
// the Face-Off: its own partner link (connection kind 'leetcode').
// The flow is one slip: paste a link or name the problem, tap the
// chips, ring the bell. Both corners read the whole log, so the
// receipt is always inspectable.

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
const looksLikeUrl = (s) => /^https?:\/\//i.test(s.trim());

// ── the round slip: one line in, chips, bell ─
function RoundSlip({ nextNo, onLogged }) {
  const [entry, setEntry] = useState('');
  const [title, setTitle] = useState('');
  const [difficulty, setDifficulty] = useState('');
  const [kind, setKind] = useState('solved');
  const [proofUrl, setProofUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [proofBusy, setProofBusy] = useState(false);
  const [err, setErr] = useState('');
  const fileRef = useRef(null);

  const take = (v) => {
    setEntry(v);
    if (looksLikeUrl(v)) {
      const named = titleFromUrl(v);
      if (named) setTitle(named);
    } else {
      setTitle(v.trim());
    }
  };

  const attachProof = async (file) => {
    if (!file) return;
    setProofBusy(true);
    setErr('');
    try { setProofUrl(await api.uploadProofImage(file)); } catch (e) { setErr(e.message); }
    setProofBusy(false);
  };

  const log = async (e) => {
    e.preventDefault();
    if (!title.trim() || busy || proofBusy) return;
    setBusy(true);
    setErr('');
    try {
      const row = await api.logProblem({
        title, difficulty, kind, proofUrl,
        url: looksLikeUrl(entry) ? entry.trim() : '',
      });
      onLogged(row);
      setEntry(''); setTitle(''); setDifficulty(''); setProofUrl('');
    } catch (e2) { setErr(e2.message); }
    setBusy(false);
  };

  return (
    <form className="spar-slip" onSubmit={log}>
      <p className="spar-slip-head">
        <span>Round slip</span>
        <span>Nº {String(nextNo).padStart(3, '0')}</span>
      </p>
      <input
        className="spar-slip-input"
        placeholder="paste the leetcode / neetcode link — or just name the problem"
        value={entry}
        onChange={(e) => take(e.target.value)}
      />
      {title.trim() && (
        <div className="spar-slip-body">
          <p className="spar-slip-read">
            logging <input className="spar-slip-title" value={title} maxLength={140}
              onChange={(e) => setTitle(e.target.value)} />
            {looksLikeUrl(entry) && <span className="spar-slip-linked">· linked ↗</span>}
          </p>
          <div className="spar-slip-chips">
            <div className="spar-chipset" role="group" aria-label="difficulty">
              {['easy', 'medium', 'hard'].map((d) => (
                <button key={d} type="button"
                  className={`spar-chip spar-chip-${d} ${difficulty === d ? 'spar-chip-on' : ''}`}
                  onClick={() => setDifficulty((cur) => (cur === d ? '' : d))}>
                  {d}
                </button>
              ))}
            </div>
            <div className="spar-chipset" role="group" aria-label="kind">
              {['solved', 'studied'].map((k) => (
                <button key={k} type="button"
                  className={`spar-chip ${kind === k ? 'spar-chip-on' : ''}`}
                  onClick={() => setKind(k)}>{k}</button>
              ))}
            </div>
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden"
              onChange={(e) => { attachProof(e.target.files?.[0]); e.target.value = ''; }} />
            {proofUrl ? (
              <button type="button" className="spar-chip spar-chip-proof spar-chip-on"
                title="Receipt attached — click to drop it" onClick={() => setProofUrl('')}>
                receipt ✓
              </button>
            ) : (
              <button type="button" className="spar-chip spar-chip-proof" disabled={proofBusy}
                onClick={() => fileRef.current?.click()}>
                {proofBusy ? 'attaching…' : '+ receipt'}
              </button>
            )}
            <button type="submit" className="spar-bell" disabled={busy || proofBusy || !title.trim()}>
              {busy ? 'ringing…' : 'Ring it in'}
            </button>
          </div>
        </div>
      )}
      {err && <p className="t-small mt-2" style={{ color: 'var(--stamp)' }}>{err}</p>}
    </form>
  );
}

// ── the rounds, interleaved, a scoreline where the day turns ─
function Rounds({ rows, you, partner, onStrike, confirming }) {
  const today = sparDay(new Date());
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
          <span className="spar-dayline-rule" />
          {k === today ? 'today' : fmtDate(r.solvedAt)} · {you.name} {mineN} — {dayRows.length - mineN} {partner.name}
          <span className="spar-dayline-rule" />
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
            title="Strike this round from your log" onClick={() => onStrike(r.id)}>
            {confirming === r.id ? 'SURE?' : '×'}
          </button>
        )}
      </div>,
    );
  }
  return <div className="spar-rounds">{lines}</div>;
}

export default function SparringRing() {
  const [conn, setConn] = useState(null);
  const [me, setMe] = useState(null);
  const [rows, setRows] = useState(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirming, setConfirming] = useState(null);

  const load = () => Promise.all([api.getSparBout(), api.getMe()])
    .then(([c, u]) => {
      setConn(c);
      setMe(u);
      if (c.status === 'CONNECTED') api.getProblems().then(setRows).catch(() => setRows([]));
    })
    .catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  const act = async (fn) => {
    setBusy(true);
    setError('');
    try { await fn(); await load(); } catch (e) { setError(e.message); }
    setBusy(false);
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
    } catch (e) { setError(e.message); }
  };

  if (conn === null || me === null) {
    return <p className="t-label pt-10">weighing in…</p>;
  }

  const connected = conn.status === 'CONNECTED';
  const list = rows || [];
  const today = sparDay(new Date());
  const weekAgo = Date.now() - 7 * 86400000;
  const n = (mine, pred = () => true) => list.filter((r) => r.mine === mine && pred(r)).length;
  const streakOf = (mine) => {
    const days = new Set(list.filter((r) => r.mine === mine).map((r) => sparDay(r.solvedAt)));
    let s = 0;
    const d = new Date();
    if (!days.has(sparDay(d))) d.setDate(d.getDate() - 1); // today is still open
    while (days.has(sparDay(d))) { s += 1; d.setDate(d.getDate() - 1); }
    return s;
  };
  const todayYou = n(true, (r) => sparDay(r.solvedAt) === today);
  const todayThem = n(false, (r) => sparDay(r.solvedAt) === today);

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
          {/* the poster: fighters flanking today's score */}
          <div className="flex items-center justify-between mb-4">
            <FighterPortrait user={me} vs={conn.partner} corner="black" ungated />
            <div className="text-center self-center px-4">
              <p className="t-label mb-2" style={{ letterSpacing: '0.22em' }}>today's rounds</p>
              <p className="spar-bigscore">
                <span>{todayYou}</span>
                <span className="spar-bigscore-sep">:</span>
                <span className="spar-bigscore-red">{todayThem}</span>
              </p>
              <p className="t-label mt-3" style={{ color: 'var(--ink-30)' }}>no purse · big O only</p>
            </div>
            <FighterPortrait user={conn.partner} vs={me} corner="red" flipped ungated />
          </div>

          {/* the slip — logging is the first thing at hand */}
          <RoundSlip nextNo={n(true) + 1}
            onLogged={(row) => setRows((old) => [row, ...(old || [])])} />

          {/* the rounds */}
          {rows === null ? null : list.length === 0 ? (
            <p className="t-body mt-8 mb-12 text-center">No rounds logged. First blood is available.</p>
          ) : (
            <div className="mt-8 mb-12">
              <Rounds rows={list} you={me} partner={conn.partner} onStrike={strike} confirming={confirming} />
            </div>
          )}

          {/* the tape, as the stats footer */}
          <div className="mb-16">
            <p className="t-label mb-5">Tale of the tape</p>
            <div style={{ borderTop: '1px solid var(--ink)' }}>
              <TapeRow label="Rounds this week" you={n(true, (r) => +new Date(r.solvedAt) > weekAgo)} partner={n(false, (r) => +new Date(r.solvedAt) > weekAgo)} />
              <TapeRow label="Rounds all-time" you={n(true)} partner={n(false)} />
              <TapeRow label="Hards felled" you={n(true, (r) => r.difficulty === 'hard' && r.kind === 'solved')} partner={n(false, (r) => r.difficulty === 'hard' && r.kind === 'solved')} />
              <TapeRow label="Grind streak" you={streakOf(true)} partner={streakOf(false)} suffix="d" />
            </div>
            <p className="fig-caption mt-2">fig. the tape — a receipt or it's on honor; the other corner is watching</p>
          </div>

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
            <div className="w-[200px]"><div className="border border-[var(--ink)] p-1 bg-white"><FighterArt user={me} ungated /></div></div>
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
