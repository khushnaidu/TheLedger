import { useEffect, useRef, useState, lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api';

const JaneHead = lazy(() => import('./JaneHead'));

const THINKING_LINES = [
  'Reading between the lines…',
  'Something in the margins…',
  'The abstract never tells the whole story…',
  'Checking a hunch…',
  'The footnotes rarely lie…',
];

const GREETING = {
  paper: "I've read it. Ask me anything.",
  library: 'The whole shelf, at your service. What are we looking for?',
};

// [p:4] and [Some Title, p:3] become jump chips
const CITE_RE = /\[(?:([^\]]+?),\s*)?p:(\d+)\]/g;

function renderWithCites(text, onCite) {
  const parts = [];
  let last = 0;
  let m;
  let k = 0;
  CITE_RE.lastIndex = 0;
  while ((m = CITE_RE.exec(text))) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const [, title, page] = m;
    parts.push(
      <button key={k++} className="jn-cite" onClick={() => onCite(title || null, parseInt(page, 10))}>
        {title ? `${title} · p.${page}` : `p.${page}`}
      </button>
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

export default function JanePanel({ mode, paperId, currentPage, askSeed, onJumpToPage, papers, onClose, docked }) {
  const navigate = useNavigate();
  const storeKey = mode === 'paper' ? `rr_jane_${paperId}` : 'rr_jane_library';
  const [messages, setMessages] = useState(() => {
    try { return JSON.parse(localStorage.getItem(storeKey))?.messages || []; } catch { return []; }
  });
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [thinkLine, setThinkLine] = useState(THINKING_LINES[0]);
  const bodyRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    try { localStorage.setItem(storeKey, JSON.stringify({ messages: messages.slice(-40) })); } catch { /* full */ }
  }, [messages, storeKey]);

  // tell the edge peek to step aside while a chat is open
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('jane-panel', { detail: { open: true } }));
    return () => window.dispatchEvent(new CustomEvent('jane-panel', { detail: { open: false } }));
  }, []);

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight });
  }, [messages, loading]);

  // a highlight walked in asking questions
  useEffect(() => {
    if (!askSeed) return;
    setInput(`Highlighted on page ${askSeed.page}: "${askSeed.quote}"\n\n`);
    inputRef.current?.focus();
  }, [askSeed]);

  useEffect(() => {
    if (!loading) return;
    const iv = setInterval(() => {
      setThinkLine(THINKING_LINES[Math.floor(Math.random() * THINKING_LINES.length)]);
    }, 1800);
    return () => clearInterval(iv);
  }, [loading]);

  const onCite = (title, page) => {
    if (mode === 'paper') {
      onJumpToPage?.(page);
    } else if (title && papers) {
      const hit = papers.find((p) => p.title.toLowerCase() === title.toLowerCase())
        || papers.find((p) => p.title.toLowerCase().includes(title.toLowerCase()));
      if (hit) navigate(`/research/${hit.id}`);
    }
  };

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;
    const next = [...messages, { role: 'user', content: text }];
    setMessages(next);
    setInput('');
    setLoading(true);
    try {
      const data = await api.askJane({
        mode,
        paperId: mode === 'paper' ? paperId : undefined,
        currentPage: mode === 'paper' ? currentPage : undefined,
        messages: next.slice(-30),
      });
      setMessages((ms) => [...ms, { role: 'assistant', content: data.message, truncated: data.truncated }]);
    } catch (err) {
      setMessages((ms) => [...ms, { role: 'assistant', content: `Hm. ${err.message}` }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`jn-panel ${docked ? 'jn-panel-docked' : 'jn-panel-drawer'}`}>
      <div className="jn-header">
        <Suspense fallback={<div className="jn-avatar jn-avatar-fallback" style={{ width: 72, height: 72 }}>J</div>}>
          <JaneHead size={72} crop />
        </Suspense>
        <div>
          <p className="jn-name">Jane</p>
          <p className="jn-role">{mode === 'paper' ? 'the consultant · on this paper' : 'the consultant · the whole shelf'}</p>
        </div>
        {loading && <span className="jn-stamp">AT WORK</span>}
        {onClose && <button className="jn-close" onClick={onClose}>✕</button>}
      </div>

      <div className="jn-body" ref={bodyRef}>
        {!messages.length && (
          <div className="jn-msg jn-msg-jane"><p>{GREETING[mode]}</p></div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`jn-msg ${m.role === 'user' ? 'jn-msg-user' : 'jn-msg-jane'}`}>
            <p>{m.role === 'assistant' ? renderWithCites(m.content, onCite) : m.content}</p>
            {m.truncated && (
              <p className="jn-cut">He ran out of room mid-thought. Ask him to carry on.</p>
            )}
          </div>
        ))}
        {loading && (
          <div className="jn-msg jn-msg-jane jn-msg-thinking">
            <p>{thinkLine}</p>
          </div>
        )}
      </div>

      <div className="jn-inputrow">
        <textarea
          ref={inputRef}
          className="jn-input"
          rows={2}
          placeholder={mode === 'paper' ? 'ask about this paper…' : 'ask across your papers…'}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
          }}
        />
        <button className="jn-send" onClick={send} disabled={loading || !input.trim()}>ASK</button>
      </div>
    </div>
  );
}
