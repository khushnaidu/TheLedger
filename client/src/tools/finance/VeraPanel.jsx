import { useEffect, useRef, useState } from 'react';
import { api } from '../../api';
import { fmt, shortDate } from './money';

// Vera drafts, the user posts. Nothing she writes touches the book until
// the slip is stamped — the same draft-then-commit posture as Gus, and
// the reason her prompt is forbidden from claiming a line is entered.

const VERA_FACE = '/art/vera.png';
const STORE = 'fin_vera';

const THINKING = [
  'Totalling…',
  'Checking the column…',
  'Reading it back…',
  'Footing the page…',
];

const GREETING = "Vera. I keep the book. Tell me what moved and I will draft the lines, or ask me what the figures say.";

function Face() {
  const [ok, setOk] = useState(true);
  if (!ok) return <div className="fin-face fin-face-fallback">V</div>;
  return <img className="fin-face" src={VERA_FACE} alt="Vera" onError={() => setOk(false)} />;
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

export default function VeraPanel({ onPosted }) {
  const [messages, setMessages] = useState(() => {
    try { return JSON.parse(localStorage.getItem(STORE))?.messages || []; } catch { return []; }
  });
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [posting, setPosting] = useState(null);
  const [think, setThink] = useState(THINKING[0]);
  const bodyRef = useRef(null);

  useEffect(() => {
    try { localStorage.setItem(STORE, JSON.stringify({ messages: messages.slice(-30) })); } catch { /* full */ }
  }, [messages]);

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight });
  }, [messages, loading]);

  useEffect(() => {
    if (!loading) return;
    const iv = setInterval(() => setThink(THINKING[Math.floor(Math.random() * THINKING.length)]), 1600);
    return () => clearInterval(iv);
  }, [loading]);

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;
    const next = [...messages, { role: 'user', content: text }];
    setMessages(next);
    setInput('');
    setLoading(true);
    try {
      // only the plain turns travel; slips are a client-side artifact
      const data = await api.askVera(next.map(({ role, content }) => ({ role, content })));
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
    <div className="fin-vera">
      <div className="fin-vera-head">
        <Face />
        <div>
          <p className="fin-vera-name">Vera</p>
          <p className="fin-vera-role">the bookkeeper</p>
        </div>
        {loading && <span className="fin-vera-stamp">At work</span>}
      </div>

      <div className="fin-vera-body" ref={bodyRef}>
        {!messages.length && <div className="fin-msg fin-msg-vera"><p>{GREETING}</p></div>}
        {messages.map((m, i) => (
          <div key={i} className={`fin-msg ${m.role === 'user' ? 'fin-msg-user' : 'fin-msg-vera'}`}>
            <p>{m.content}</p>
            {m.draft && (
              <Slip
                entries={m.draft} posted={m.posted} busy={posting === i}
                onPost={() => post(i)}
              />
            )}
          </div>
        ))}
        {loading && <div className="fin-msg fin-msg-vera fin-msg-think"><p>{think}</p></div>}
      </div>

      <div className="fin-vera-input">
        <textarea
          rows={2}
          placeholder="spent 62.41 at trader joes…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
        />
        <button className="fin-vera-send" onClick={send} disabled={loading || !input.trim()}>Tell</button>
      </div>
    </div>
  );
}
