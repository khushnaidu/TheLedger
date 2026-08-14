import { useState, useEffect } from 'react';
import { api } from '../api';

// the two contenders — mii portraits keyed by identity
const miiFor = (u) =>
  /khush/i.test(`${u?.name || ''} ${u?.email || ''}`) ? '/art/khush-mii.gif' : '/art/taia-mii.gif';

const fmtDate = (d) =>
  new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit' }).replace(/\//g, '.');

const DAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
// server sends last 7 days oldest→today; label them by actual weekday
function dayLabels() {
  const out = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    out.push(DAY_LETTERS[(d.getDay() + 6) % 7]);
  }
  return out;
}

// a low fire smoldering along the bottom of the page — same recipe as the board's fire pit
function FloorFire() {
  return (
    <div className="relative h-[32px] pointer-events-none" aria-hidden="true">
      <div
        className="absolute inset-x-0 bottom-0 h-full opacity-35"
        style={{ backgroundImage: "url('/art/fire.gif')", backgroundRepeat: 'repeat-x', backgroundSize: 'auto 100%', backgroundPosition: '60px bottom' }}
      />
      <div
        className="absolute inset-x-0 bottom-0 h-[22px] opacity-60"
        style={{ backgroundImage: "url('/art/fire.gif')", backgroundRepeat: 'repeat-x', backgroundSize: 'auto 100%', backgroundPosition: 'bottom' }}
      />
    </div>
  );
}

function FighterPortrait({ user, corner, flipped }) {
  const red = corner === 'red';
  return (
    <div className={`w-[200px] ${red ? 'text-right' : ''}`}>
      <div className="border border-[var(--ink)] p-1 bg-white">
        <img
          src={miiFor(user)}
          alt=""
          className="block w-full"
          style={flipped ? { transform: 'scaleX(-1)' } : undefined}
        />
      </div>
      <p
        className="t-title text-[1.15rem] uppercase mt-3 leading-none"
        style={red ? { color: 'var(--stamp)' } : undefined}
      >
        {user.name}
      </p>
      <p className="fig-caption mt-1.5">{red ? 'in the red corner' : 'in the black corner'}</p>
    </div>
  );
}

// one line of the tale of the tape — bars grow toward the center label
function TapeRow({ label, you, partner, suffix = '', lowerWins = false }) {
  const max = Math.max(you, partner, 1);
  const youLeads = lowerWins ? you < partner : you > partner;
  const partnerLeads = lowerWins ? partner < you : partner > you;
  const bar = (v, leads, red) => (
    <div
      className="h-[7px]"
      style={{
        width: `${(v / max) * 100}%`,
        minWidth: v > 0 ? 3 : 0,
        background: leads ? (red ? 'var(--stamp)' : 'var(--ink)') : 'var(--ink-15)',
      }}
    />
  );
  return (
    <div className="grid grid-cols-[1fr_150px_1fr] items-center gap-4 py-2.5 border-b border-[var(--ink-08)]">
      <div className="flex items-center justify-end gap-3">
        <span className="counter-num text-[0.8125rem]" style={youLeads ? { fontWeight: 700 } : { color: 'var(--ink-50)' }}>
          {String(you).padStart(2, '0')}{suffix}
        </span>
        <div className="flex-1 flex justify-end max-w-[190px]">{bar(you, youLeads, false)}</div>
      </div>
      <p className="t-label text-center">{label}{lowerWins ? ' ↓' : ''}</p>
      <div className="flex items-center gap-3">
        <div className="flex-1 max-w-[190px]">{bar(partner, partnerLeads, true)}</div>
        <span className="counter-num text-[0.8125rem]" style={partnerLeads ? { fontWeight: 700, color: 'var(--stamp)' } : { color: 'var(--ink-50)' }}>
          {String(partner).padStart(2, '0')}{suffix}
        </span>
      </div>
    </div>
  );
}

// seven days, two bars per day — black you, red them
function WeekChart({ you, partner }) {
  const labels = dayLabels();
  const max = Math.max(...you, ...partner, 1);
  return (
    <div className="flex items-end justify-center gap-5">
      {labels.map((l, i) => (
        <div key={i} className="flex flex-col items-center gap-1.5">
          <div className="flex items-end gap-[3px] h-[64px]">
            <div className="w-[10px]" style={{ height: `${Math.max((you[i] / max) * 100, you[i] ? 6 : 0)}%`, background: 'var(--ink)' }} />
            <div className="w-[10px]" style={{ height: `${Math.max((partner[i] / max) * 100, partner[i] ? 6 : 0)}%`, background: 'var(--stamp)' }} />
          </div>
          <span className="text-[0.5rem] tracking-[0.14em] text-[var(--ink-30)]" style={{ fontFamily: 'var(--font)' }}>
            {l}
          </span>
        </div>
      ))}
    </div>
  );
}

function NoteSlip({ note, mine, authorName, i }) {
  return (
    <div
      className={`max-w-[420px] border border-[var(--ink)] px-5 py-4 ${mine ? 'ml-auto' : ''}`}
      style={{
        backgroundImage: 'url(/art/papergrain.jpg)',
        backgroundSize: 'cover',
        transform: `rotate(${(i % 2 ? 1 : -1) * 0.7}deg)`,
        borderLeft: mine ? undefined : '3px solid var(--stamp)',
        borderRight: mine ? '3px solid var(--ink)' : undefined,
      }}
    >
      <p style={{ fontFamily: "'Gochi Hand', cursive", fontSize: '1.05rem', lineHeight: 1.35 }}>{note.body}</p>
      <p className={`fig-caption mt-2 ${mine ? 'text-right' : ''}`}>
        — {mine ? 'you' : authorName} · {fmtDate(note.createdAt)}
      </p>
    </div>
  );
}

export default function FaceOff() {
  const [conn, setConn] = useState(null);       // { status, partner?, since? }
  const [bout, setBout] = useState(null);       // { you, partner, notes, since }
  const [me, setMe] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [noteDraft, setNoteDraft] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => {
    setError('');
    return api
      .getPartner()
      .then((c) => {
        setConn(c);
        if (c.status === 'CONNECTED') return api.getFaceoff().then(setBout);
        return api.getMe().then(setMe);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const act = (fn) => {
    setBusy(true);
    setError('');
    fn()
      .then(load)
      .catch((e) => setError(e.message))
      .finally(() => setBusy(false));
  };

  if (loading) return (
    <div className="flex flex-col items-center justify-center py-32">
      <div className="loader mb-6"><div className="loader-bar" /><div className="loader-bar" /><div className="loader-bar" /><div className="loader-bar" /></div>
      <p className="t-label">Weighing in...</p>
    </div>
  );

  /* ---------- not yet connected ---------- */
  if (conn?.status !== 'CONNECTED' || !bout) {
    return (
      <div className="max-w-[820px] stagger">
        <div className="pt-10 mb-14">
          <p className="t-label mb-4">Bout № 001 · sanctioned by the bureau</p>
          <h1 className="t-display">The Face-Off</h1>
        </div>

        <div className="flex items-start justify-center gap-14 mb-14">
          <div className="w-[200px]">
            <div className="border border-[var(--ink)] p-1"><img src={me ? miiFor(me) : '/art/khush-mii.gif'} alt="" className="block w-full" /></div>
            <p className="fig-caption mt-2">fig. you — undefeated, unopposed</p>
          </div>
          <p className="t-display self-center" style={{ fontSize: '3rem', color: 'var(--stamp)' }}>vs</p>
          <div className="w-[200px]">
            <div className="border border-[var(--ink)] p-1 relative">
              <img
                src={me ? (miiFor(me) === '/art/khush-mii.gif' ? '/art/taia-mii.gif' : '/art/khush-mii.gif') : '/art/taia-mii.gif'}
                alt=""
                className="block w-full"
                style={{ filter: 'grayscale(1) contrast(0.6) brightness(1.15)', transform: 'scaleX(-1)' }}
              />
              <span className="absolute inset-0 flex items-center justify-center t-display" style={{ fontSize: '4rem' }}>?</span>
            </div>
            <p className="fig-caption mt-2 text-right">fig. the challenger — unnamed</p>
          </div>
        </div>

        {conn?.status === 'PENDING_SENT' && (
          <div className="text-center">
            <p className="t-body mb-6">
              Challenge issued to <span className="stamp-red">{conn.partner.email}</span> — awaiting their signature.
            </p>
            <button className="btn-ghost mx-auto" disabled={busy} onClick={() => act(api.unlinkPartner)}>withdraw the challenge</button>
          </div>
        )}

        {conn?.status === 'PENDING_RECEIVED' && (
          <div className="text-center">
            <p className="t-body mb-6">
              <span className="stamp-red">{conn.partner.name}</span> has challenged you to a face-off.
            </p>
            <div className="flex items-center justify-center gap-6">
              <button className="btn-black" disabled={busy} onClick={() => act(api.acceptPartner)}>accept the bout</button>
              <button className="btn-ghost" disabled={busy} onClick={() => act(api.unlinkPartner)}>decline</button>
            </div>
          </div>
        )}

        {(!conn || conn.status === 'NONE') && (
          <form
            className="max-w-[380px] mx-auto text-center"
            onSubmit={(e) => { e.preventDefault(); if (inviteEmail.trim()) act(() => api.invitePartner(inviteEmail)); }}
          >
            <p className="t-body mb-6">Every archivist needs a rival. Summon yours by email.</p>
            <input
              type="email"
              className="input-field w-full mb-4"
              placeholder="rival@example.com"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
            />
            <button type="submit" className="btn-black mx-auto" disabled={busy}>issue the challenge</button>
          </form>
        )}

        {error && <p className="t-small text-center mt-6" style={{ color: 'var(--stamp)' }}>{error}</p>}

        <div className="mt-24">
          <FloorFire />
        </div>
      </div>
    );
  }

  /* ---------- the bout ---------- */
  const { you, partner, notes } = bout;
  const weekLeader = you.doneThisWeek === partner.doneThisWeek ? null : you.doneThisWeek > partner.doneThisWeek ? you : partner;

  return (
    <div className="max-w-[820px] stagger">
      {/* Header */}
      <div className="flex items-end justify-between pt-10 mb-12">
        <div>
          <p className="t-label mb-4">Bout № 001 · sanctioned by the bureau</p>
          <h1 className="t-display">The Face-Off</h1>
        </div>
        <p className="t-label text-right">
          connected since<br />{bout.since ? fmtDate(bout.since) : '—'}
        </p>
      </div>

      {/* Fighters */}
      <div className="flex items-center justify-between mb-10">
        <FighterPortrait user={you} corner="black" />
        <div className="text-center self-center px-4">
          <p className="t-display" style={{ fontSize: '4rem', color: 'var(--stamp)', lineHeight: 1 }}>vs</p>
          <p className="t-label mt-3">no purse ·<br />pride only</p>
        </div>
        <FighterPortrait user={partner} corner="red" flipped />
      </div>

      {/* Weekly verdict */}
      <div
        className="text-center py-3 mb-14"
        style={{ borderTop: '3px double var(--ink)', borderBottom: '3px double var(--ink)' }}
      >
        <p className="t-label" style={{ color: 'var(--stamp)', letterSpacing: '0.22em' }}>
          {weekLeader
            ? `★ leading this week: ${weekLeader.name} — ${weekLeader.doneThisWeek} filings to ${(weekLeader === you ? partner : you).doneThisWeek} ★`
            : '★ dead heat this week — the bureau declines to rule ★'}
        </p>
      </div>

      {/* Tale of the tape */}
      <div className="mb-16">
        <p className="t-label mb-5">Tale of the tape</p>
        <div style={{ borderTop: '1px solid var(--ink)' }}>
          <TapeRow label="Filed this week" you={you.doneThisWeek} partner={partner.doneThisWeek} />
          <TapeRow label="Filed all-time" you={you.done} partner={partner.done} />
          <TapeRow label="Opened this week" you={you.openedThisWeek} partner={partner.openedThisWeek} />
          <TapeRow label="In motion" you={you.inMotion} partner={partner.inMotion} />
          <TapeRow label="Completion" you={you.completionRate} partner={partner.completionRate} suffix="%" />
          <TapeRow label="Streak" you={you.streak} partner={partner.streak} suffix="d" />
          <TapeRow label="Overdue" you={you.overdue} partner={partner.overdue} lowerWins />
        </div>
        <p className="fig-caption mt-2">fig. the tape — ↓ marks a stat where fewer is finer</p>
      </div>

      {/* The week, day by day */}
      <div className="mb-16">
        <p className="t-label mb-6 text-center">The week in filings</p>
        <WeekChart you={you.week} partner={partner.week} />
        <div className="flex items-center justify-center gap-8 mt-4">
          <span className="fig-caption flex items-center gap-2"><span className="inline-block w-[10px] h-[10px]" style={{ background: 'var(--ink)' }} /> {you.name}</span>
          <span className="fig-caption flex items-center gap-2"><span className="inline-block w-[10px] h-[10px]" style={{ background: 'var(--stamp)' }} /> {partner.name}</span>
        </div>
      </div>

      {/* Correspondence */}
      <div className="mb-20">
        <p className="t-label mb-6">Correspondence</p>
        <form
          className="mb-10"
          onSubmit={(e) => {
            e.preventDefault();
            if (!noteDraft.trim()) return;
            act(() => api.leavePartnerNote(noteDraft).then(() => setNoteDraft('')));
          }}
        >
          <textarea
            className="textarea-field w-full max-w-[560px]"
            rows={2}
            maxLength={500}
            placeholder={`a note for ${partner.name}...`}
            value={noteDraft}
            onChange={(e) => setNoteDraft(e.target.value)}
          />
          <div className="mt-3">
            <button type="submit" className="btn-black" disabled={busy || !noteDraft.trim()}>pass the note</button>
          </div>
        </form>
        {notes.length ? (
          <div className="space-y-5">
            {notes.map((n, i) => (
              <NoteSlip key={n.id} note={n} mine={n.authorId === you.id} authorName={partner.name} i={i} />
            ))}
          </div>
        ) : (
          <p className="t-body">No notes passed yet. Break the silence.</p>
        )}
      </div>

      {error && <p className="t-small mb-6" style={{ color: 'var(--stamp)' }}>{error}</p>}

      {/* Dissolution */}
      <div className="pb-10">
        <button
          className="btn-ghost"
          disabled={busy}
          onClick={() => { if (window.confirm('Dissolve the bout? The correspondence stays filed, but the connection ends.')) act(api.unlinkPartner); }}
        >
          dissolve the bout
        </button>
      </div>

      <FloorFire />
    </div>
  );
}
