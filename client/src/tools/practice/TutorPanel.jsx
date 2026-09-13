import { useEffect, useRef, useState } from 'react';
import { api } from '../../api';

// ADA — the Gymnasium's resident tutor. She reads the brief, the code
// as it stands in the editor, and the last run's output with every
// question (getContext hands them over at send time), and she never
// writes the answer. Transcript is hers and local, per drill.

const THINKING_LINES = [
  'Reading your working…',
  'The machine only does what it is told…',
  'There is a pattern here…',
  'Weighing the structures…',
  'Poetical science takes a moment…',
];

const GREETING = "Show me where you are. Paste your thinking, run what you have, or just ask where to begin. I won't write it for you, but I'll get you writing it.";

// backtick fragments arrive from Ada as `code` — set them in type
const renderInline = (text) => {
  const parts = text.split(/(`[^`]+`)/g);
  return parts.map((p, i) =>
    p.startsWith('`') && p.endsWith('`') && p.length > 2
      ? <code key={i} className="gym-code-inline">{p.slice(1, -1)}</code>
      : p
  );
};

export default function TutorPanel({ drillId, getContext }) {
  const storeKey = `gym_ada_${drillId}`;
  const [messages, setMessages] = useState(() => {
    try { return JSON.parse(localStorage.getItem(storeKey))?.messages || []; } catch { return []; }
  });
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [thinkLine, setThinkLine] = useState(THINKING_LINES[0]);
  const bodyRef = useRef(null);

  useEffect(() => {
    try { localStorage.setItem(storeKey, JSON.stringify({ messages: messages.slice(-40) })); } catch { /* full */ }
  }, [messages, storeKey]);

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight });
  }, [messages, loading]);

  useEffect(() => {
    if (!loading) return;
    const iv = setInterval(() => {
      setThinkLine(THINKING_LINES[Math.floor(Math.random() * THINKING_LINES.length)]);
    }, 1800);
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
      const ctx = getContext();
      const data = await api.askAda({
        messages: next.slice(-16),
        brief: ctx.brief,
        code: ctx.code,
        output: ctx.output,
      });
      setMessages((ms) => [...ms, { role: 'assistant', content: data.message, truncated: data.truncated }]);
    } catch (err) {
      setMessages((ms) => [...ms, { role: 'assistant', content: `Hm. ${err.message}` }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="gym-tutor">
      <div className="gym-tutor-head">
        <div className="gym-ada-mark">A.</div>
        <div>
          <p className="gym-tutor-name">Ada</p>
          <p className="gym-tutor-role">the tutor · guides, never solves</p>
        </div>
        {loading && <span className="gym-atwork">AT THE BOARD</span>}
      </div>

      <div className="gym-tutor-body" ref={bodyRef}>
        {!messages.length && (
          <div className="gym-msg gym-msg-ada"><p>{GREETING}</p></div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`gym-msg ${m.role === 'user' ? 'gym-msg-user' : 'gym-msg-ada'}`}>
            <p>{m.role === 'assistant' ? renderInline(m.content) : m.content}</p>
            {m.truncated && <p className="gym-cut">She ran out of chalk mid-thought. Ask her to carry on.</p>}
          </div>
        ))}
        {loading && (
          <div className="gym-msg gym-msg-ada gym-msg-thinking"><p>{thinkLine}</p></div>
        )}
      </div>

      <div className="gym-tutor-inputrow">
        <textarea
          className="gym-tutor-input"
          rows={2}
          placeholder="ask her anything — she sees your brief, code, and last run"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
          }}
        />
        <button data-clicky className="gym-tutor-send" onClick={send} disabled={loading || !input.trim()}>ASK</button>
      </div>
    </div>
  );
}
