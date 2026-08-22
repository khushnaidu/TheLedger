import { useEffect, useRef, useState } from 'react';
import { api } from '../../api';
import { CLERKS, CLERK_IDS, clerkOf } from './clerks';
import { fmt, shortDate } from './money';

// A clerk drafts, the user posts. Nothing either of them writes touches the
// book until the slip is stamped — the same draft-then-commit posture as Gus,
// and the reason both prompts are forbidden from claiming a line is entered.
//
// The two of them keep separate memories. They are different people and a
// shared transcript would have each answering for the other.

const store = (who) => `fin_clerk_${who}`;

function Face({ who, size }) {
  const c = clerkOf(who);
  const [ok, setOk] = useState(true);
  if (!ok) {
    return <div className="fin-face fin-face-fallback" style={size ? { width: size, height: size } : undefined}>{c.initial}</div>;
  }
  return (
    <img
      className="fin-face" src={c.face} alt={c.name} title={c.name}
      style={size ? { width: size, height: size } : undefined}
      onError={() => setOk(false)}
    />
  );
}

function Slip({ entries, posted, onPost, busy }) {
  const out = entries.filter((e) => e.kind === 'expense').reduce((a, e) => a + Number(e.amount), 0);
  const inn = entries.filter((e) => e.kind === 'income').reduce((a, e) => a + Number(e.amount), 0);
  return (
    <div className={`fin-slip ${posted ? 'fin-slip-posted' : ''}`}>
      <p className="t-label fin-slip-head">Draft slip · {entries.length} {entries.length === 1 ? 'line' : 'lines'}</p>
      {entries.map((e, i) => (
        <div key={i} className="fin-slip-line">
          <span className="fin-date">{shortDate(`${e.date}T00:00:00Z`)}</span>
          <span className="fin-part">{e.description || '—'}</span>
          <span className="fin-cat">{e.category}</span>
          <span className={`fin-num ${e.kind === 'income' ? 'fin-credit' : ''}`}>
            {e.kind === 'income' ? '+' : '−'}{fmt(e.amount)}
          </span>
        </div>
      ))}
      <div className="fin-slip-foot">
        <span className="t-label">
          {out > 0 && `out ${fmt(out)}`}{out > 0 && inn > 0 && ' · '}{inn > 0 && `in ${fmt(inn)}`}
        </span>
        {posted
          ? <span className="stamp stamp-red">Posted</span>
          : <button className="btn-black fin-slip-post" onClick={onPost} disabled={busy}>
              {busy ? 'Posting…' : 'Post to book'}
            </button>}
      </div>
    </div>
  );
}

export default function ClerkPanel({ who, onSwitch, onPosted }) {
  const clerk = clerkOf(who);
  const other = CLERK_IDS.find((id) => id !== clerk.id);

  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [posting, setPosting] = useState(null);
  const [think, setThink] = useState(clerk.thinking[0]);
  const bodyRef = useRef(null);

  // swapping desks swaps the transcript with it
  useEffect(() => {
    try { setMessages(JSON.parse(localStorage.getItem(store(clerk.id)))?.messages || []); }
    catch { setMessages([]); }
  }, [clerk.id]);

  useEffect(() => {
    try { localStorage.setItem(store(clerk.id), JSON.stringify({ messages: messages.slice(-30) })); }
    catch { /* full */ }
  }, [messages, clerk.id]);

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight });
  }, [messages, loading]);

  useEffect(() => {
    if (!loading) return;
    const pick = () => setThink(clerk.thinking[Math.floor(Math.random() * clerk.thinking.length)]);
    pick();
    const iv = setInterval(pick, 1600);
    return () => clearInterval(iv);
  }, [loading, clerk]);

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;
    const next = [...messages, { role: 'user', content: text }];
    setMessages(next);
    setInput('');
    setLoading(true);
    try {
      // only the plain turns travel; slips are a client-side artifact
      const data = await api.askClerk(clerk.id, next.map(({ role, content }) => ({ role, content })));
      setMessages((ms) => [...ms, {
        role: 'assistant',
        content: data.message,
        draft: data.type === 'draft' ? data.entries : undefined,
      }]);
    } catch (err) {
      setMessages((ms) => [...ms, { role: 'assistant', content: `The desk is closed. ${err.message}` }]);
    } finally {
      setLoading(false);
    }
  };

  const post = async (index) => {
    const slip = messages[index]?.draft;
    if (!slip || posting !== null) return;
    setPosting(index);
    try {
      await onPosted(slip);
      setMessages((ms) => ms.map((m, i) => (i === index ? { ...m, posted: true } : m)));
    } catch (err) {
      setMessages((ms) => [...ms, { role: 'assistant', content: `That did not take. ${err.message}` }]);
    } finally {
      setPosting(null);
    }
  };

  return (
    <div className="fin-clerk">
      <div className="fin-clerk-head">
        <Face who={clerk.id} />
        <div className="fin-clerk-who">
          <p className="fin-clerk-name">{clerk.name}</p>
          <p className="fin-clerk-role">{clerk.role}</p>
        </div>
        {loading && <span className="fin-clerk-stamp">At work</span>}
        <button
          className="fin-clerk-swap"
          onClick={() => onSwitch(other)}
          title={`Ask ${CLERKS[other].name} instead`}
        >
          <Face who={other} size={26} />
          <span>Ask {CLERKS[other].short}</span>
        </button>
      </div>

      <div className="fin-clerk-body" ref={bodyRef}>
        {!messages.length && <div className="fin-msg fin-msg-clerk"><p>{clerk.greeting}</p></div>}
        {messages.map((m, i) => (
          <div key={i} className={`fin-msg ${m.role === 'user' ? 'fin-msg-user' : 'fin-msg-clerk'}`}>
            <p>{m.content}</p>
            {m.draft && (
              <Slip
                entries={m.draft} posted={m.posted} busy={posting === i}
                onPost={() => post(i)}
              />
            )}
          </div>
        ))}
        {loading && <div className="fin-msg fin-msg-clerk fin-msg-think"><p>{think}</p></div>}
      </div>

      <div className="fin-clerk-input">
        <textarea
          rows={2}
          placeholder={clerk.placeholder}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
        />
        <button className="fin-clerk-send" onClick={send} disabled={loading || !input.trim()}>Tell</button>
      </div>
    </div>
  );
}
