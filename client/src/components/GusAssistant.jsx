import { useState, useRef, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Send, Check, ChevronDown, FileText, Loader2 } from 'lucide-react';
import { api } from '../api';
import { getDailyQuest, updateQuestProgress } from '../lib/quests';
import { GUS_FACE, GUS_PERSONA, GUS_QUOTES } from '../lib/theme';

function getRandomQuote(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function getPageQuote(pathname, quotes) {
  const pool = quotes.pageQuotes[pathname]
    || (pathname.startsWith('/tickets/') ? quotes.pageQuotes['/tickets/new'] : null)
    || quotes.defaultQuotes;
  return pool[Math.floor(Math.random() * pool.length)];
}

// what the clerk mutters while the request is out — cycles so it's clear he's working
const WORKING_LINES = [
  'consulting the index...',
  'rifling the filing cabinet...',
  'sharpening the pencil...',
  'stamping in triplicate...',
  'cross-referencing the archives...',
  'blowing dust off a folder...',
];

// Older api messages get trimmed for the request/storage cap; a trailing orphaned
// tool_result at the front would be rejected by the API, so drop it.
function capApiMessages(list, n = 40) {
  const out = list.slice(-n);
  while (out.length && Array.isArray(out[0]?.content) && out[0].content[0]?.type === 'tool_result') out.shift();
  return out;
}

export default function GusAssistant({ onTicketsCreated, user }) {
  const location = useLocation();
  const HIST_KEY = `ledger_gus_chat_${user?.id || 'anon'}`;
  const SIZE_KEY = 'ledger_gus_size';
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState(() => {
    try { return JSON.parse(localStorage.getItem(HIST_KEY))?.messages || []; } catch { return []; }
  });
  const [apiMessages, setApiMessages] = useState(() => {
    try { return capApiMessages(JSON.parse(localStorage.getItem(HIST_KEY))?.apiMessages || []); } catch { return []; }
  });
  const [size, setSize] = useState(() => {
    try { return JSON.parse(localStorage.getItem(SIZE_KEY)) || null; } catch { return null; }
  });
  const [workingLine, setWorkingLine] = useState(0);
  const panelRef = useRef(null);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [categories, setCategories] = useState([]);
  const [labels, setLabels] = useState([]);
  const [idleQuote, setIdleQuote] = useState(() => getPageQuote('/', GUS_QUOTES));
  const [greeting] = useState(() => getRandomQuote(GUS_QUOTES.greetings));
  const [voiceLine, setVoiceLine] = useState(null);
  const voiceTimerRef = useRef(null);
  const chatRef = useRef(null);
  const inputRef = useRef(null);

  const [boardMood, setBoardMood] = useState('idle');
  const [weeklyCount, setWeeklyCount] = useState(0);
  const [quest, setQuest] = useState(() => getDailyQuest());

  useEffect(() => {
    Promise.all([api.getCategories(), api.getLabels()])
      .then(([c, l]) => { setCategories(c); setLabels(l); })
      .catch(() => {});
    checkBoardHealth();
    checkWeeklyStreak();
  }, []);

  useEffect(() => { checkBoardHealth(); }, [location.pathname]);
  useEffect(() => {
    const handler = () => checkBoardHealth();
    window.addEventListener('gus-tickets-created', handler);
    return () => window.removeEventListener('gus-tickets-created', handler);
  }, []);

  function checkWeeklyStreak() {
    api.getTickets({}).then(tickets => {
      const now = new Date();
      const weekAgo = new Date(now);
      weekAgo.setDate(weekAgo.getDate() - 7);
      const completedThisWeek = tickets.filter(t =>
        t.status === 'DONE' && new Date(t.updatedAt) >= weekAgo
      ).length;
      setWeeklyCount(completedThisWeek);
    }).catch(() => {});
  }

  function checkBoardHealth() {
    api.getTickets({}).then(tickets => {
      const now = new Date();
      const overdue = tickets.filter(t =>
        t.dueDate && new Date(t.dueDate) < now && t.status !== 'DONE'
      );
      const active = tickets.filter(t => t.status !== 'DONE');
      const done = tickets.filter(t => t.status === 'DONE');

      if (overdue.length >= 3) setBoardMood('worried');
      else if (active.length === 0 && done.length > 0) setBoardMood('smiling');
      else if (overdue.length > 0) setBoardMood('curious');
      else setBoardMood('idle');
    }).catch(() => {});
  }

  // Update idle quote when page changes or mood changes
  useEffect(() => {
    if (boardMood === 'worried') {
      setIdleQuote(getRandomQuote(GUS_QUOTES.worriedQuotes));
    } else if (boardMood === 'smiling') {
      setIdleQuote(getRandomQuote(GUS_QUOTES.happyQuotes));
    } else {
      setIdleQuote(getPageQuote(location.pathname, GUS_QUOTES));
    }
  }, [location.pathname, boardMood, GUS_QUOTES]);

  // Listen for quest completion
  useEffect(() => {
    const handler = () => {
      setQuest(getDailyQuest());
      setTimeout(() => {
        if (voiceTimerRef.current) clearTimeout(voiceTimerRef.current);
        setVoiceLine("QUEST COMPLETE! Well done, boss!");
        voiceTimerRef.current = setTimeout(() => setVoiceLine(null), 4000);
      }, 3500);
    };
    window.addEventListener('gus-quest-complete', handler);
    return () => window.removeEventListener('gus-quest-complete', handler);
  }, []);

  useEffect(() => {
    const handler = () => setQuest(getDailyQuest());
    window.addEventListener('gus-ticket-moved', handler);
    return () => window.removeEventListener('gus-ticket-moved', handler);
  }, []);

  // Listen for XP gains
  useEffect(() => {
    const handler = (e) => {
      const { earned, leveledUp, level } = e.detail;
      if (leveledUp) {
        if (voiceTimerRef.current) clearTimeout(voiceTimerRef.current);
        setVoiceLine(`LEVEL UP! ${level.title}!`);
        voiceTimerRef.current = setTimeout(() => setVoiceLine(null), 4000);
      } else if (!voiceLine) {
        setTimeout(() => {
          if (voiceTimerRef.current) clearTimeout(voiceTimerRef.current);
          setVoiceLine(`+${earned} XP`);
          voiceTimerRef.current = setTimeout(() => setVoiceLine(null), 2000);
        }, 3200);
      }
    };
    window.addEventListener('gus-xp-gained', handler);
    return () => window.removeEventListener('gus-xp-gained', handler);
  }, [voiceLine]);

  // Listen for ticket moves
  useEffect(() => {
    const handler = (e) => {
      const { to } = e.detail;
      const quotes = GUS_QUOTES.moveQuotes[to];
      if (!quotes) return;

      if (voiceTimerRef.current) clearTimeout(voiceTimerRef.current);
      setVoiceLine(getRandomQuote(quotes));
      voiceTimerRef.current = setTimeout(() => setVoiceLine(null), 3000);

      checkBoardHealth();
      checkWeeklyStreak();
    };
    window.addEventListener('gus-ticket-moved', handler);
    return () => window.removeEventListener('gus-ticket-moved', handler);
  }, [GUS_QUOTES]);

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [messages, loading]);

  // the conversation survives refreshes — capped so storage stays small
  useEffect(() => {
    try {
      localStorage.setItem(HIST_KEY, JSON.stringify({
        messages: messages.slice(-40),
        apiMessages: capApiMessages(apiMessages),
      }));
    } catch { /* storage full/blocked — history just won't persist */ }
  }, [messages, apiMessages, HIST_KEY]);

  // cycle the working lines while a request is out
  useEffect(() => {
    if (!loading) return;
    setWorkingLine(Math.floor(Math.random() * WORKING_LINES.length));
    const t = setInterval(() => setWorkingLine((i) => i + 1), 1500);
    return () => clearInterval(t);
  }, [loading]);

  // drag the bottom-left corner to resize; the panel is anchored top-right
  const startResize = (e) => {
    e.preventDefault();
    const rect = panelRef.current.getBoundingClientRect();
    const startX = e.clientX, startY = e.clientY;
    const onMove = (ev) => {
      setSize({
        w: Math.min(Math.max(rect.width + (startX - ev.clientX), 320), window.innerWidth - 48),
        h: Math.min(Math.max(rect.height + (ev.clientY - startY), 400), window.innerHeight - 40),
      });
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      setSize((s) => { try { localStorage.setItem(SIZE_KEY, JSON.stringify(s)); } catch { /* ok */ } return s; });
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus();
  }, [open]);

  const handleOpen = () => {
    setOpen(true);
    if (messages.length === 0) {
      setMessages([{ role: 'gus', text: greeting }]);
    }
  };

  const handleSend = async () => {
    if (!input.trim() || loading) return;
    const userText = input.trim();
    setInput('');

    setMessages(prev => [...prev, { role: 'user', text: userText }]);
    const newApiMessages = [...apiMessages, { role: 'user', content: userText }];
    setApiMessages(newApiMessages);

    setLoading(true);

    try {
      const data = await api.generateTicket({
        messages: capApiMessages(newApiMessages),
        categories,
        labels,
      });

      if (data.type === 'question') {
        setMessages(prev => [...prev, {
          role: 'gus', text: data.message, proposedTickets: data.proposedTickets,
        }]);
        setApiMessages(prev => [
          ...prev,
          { role: 'assistant', content: [{ type: 'tool_use', id: 'q', name: 'ask_question', input: { message: data.message, proposed_tickets: data.proposedTickets } }] },
          { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'q', content: 'User is viewing the question.' }] },
        ]);
      } else if (data.type === 'tickets' && !data.tickets?.length) {
        // never show "ready to file" with nothing to file
        setMessages(prev => [...prev, {
          role: 'gus', text: "Hm — the draft came out blank. Give me the details once more and I'll redo it properly.",
        }]);
      } else if (data.type === 'tickets') {
        setMessages(prev => [...prev, {
          role: 'gus', text: data.message, tickets: data.tickets,
        }]);
        setApiMessages(prev => [
          ...prev,
          { role: 'assistant', content: [{ type: 'tool_use', id: 't', name: 'create_tickets', input: { message: data.message, tickets: data.tickets } }] },
          { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't', content: 'Drafts displayed with a File button. NOT saved yet — only the user pressing File commits them.' }] },
        ]);
      }
    } catch (err) {
      setMessages(prev => [...prev, { role: 'gus', text: `Blast — hit a snag: ${err.message}` }]);
    } finally {
      setLoading(false);
    }
  };

  const handleFileTickets = async (tickets) => {
    setCreating(true);
    try {
      await api.createTicketsFromGus({ tickets });
      const count = tickets.length;
      const doneMsg = `Consider it done! ${count} ${count === 1 ? 'entry' : 'entries'} filed and stamped. The archives grow ever richer.`;
      setMessages(prev => [...prev, { role: 'gus', text: doneMsg }]);
      // let the model know the drafts were actually committed, so follow-up turns are truthful
      setApiMessages(prev => [...prev, { role: 'user', content: `[system note: the user pressed File — ${count} ${count === 1 ? 'ticket is' : 'tickets are'} now saved in the ledger.]` }]);
      for (let i = 0; i < count; i++) {
        const qs = updateQuestProgress('create');
        if (qs.completed) {
          window.dispatchEvent(new CustomEvent('gus-quest-complete', { detail: qs }));
        }
      }
      setQuest(getDailyQuest());
      Promise.all([api.getCategories(), api.getLabels()])
        .then(([c, l]) => { setCategories(c); setLabels(l); })
        .catch(() => {});
      onTicketsCreated?.();
    } catch (err) {
      setMessages(prev => [...prev, { role: 'gus', text: `Filing error: ${err.message}` }]);
    } finally {
      setCreating(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const handleNewConversation = () => {
    setMessages([{ role: 'gus', text: greeting }]);
    setApiMessages([]);
    setInput('');
  };

  // Collapsed — Gus peeps in from the right edge of the screen
  if (!open) {
    return (
      <div className="gus-peek" onClick={handleOpen}>
        <img src={GUS_FACE} alt="Gus" className="gus-peek-face" />
        {voiceLine ? (
          <div className="gus-peek-voice"><span>{voiceLine}</span></div>
        ) : (
          <div className="gus-peek-bubble"><span>{idleQuote}</span></div>
        )}
        <span className="gus-peek-tab">{GUS_PERSONA.nameplate}</span>
      </div>
    );
  }

  // Expanded chat panel
  return (
    <div
      ref={panelRef}
      className="gus-chat-panel"
      style={size ? { width: size.w, height: size.h, maxHeight: 'none' } : undefined}
    >
      <div className="gus-resize" onMouseDown={startResize} title="Drag to resize" />
      <div className="gus-chat-header">
        <div className="gus-chat-face-wrap">
          <img src={GUS_FACE} alt="Gus" className="gus-chat-face" />
        </div>
        <div className="gus-chat-header-info">
          <div className="flex-1">
            <span className="block text-[0.6875rem] tracking-[0.14em]">
              {GUS_PERSONA.name}
            </span>
            <span className="block text-[0.5rem] tracking-[0.18em] text-[var(--ink-30)]">
              {GUS_PERSONA.role} &middot; {GUS_PERSONA.status}
            </span>
          </div>
          <button type="button" onClick={handleNewConversation} className="btn-ghost text-[0.5rem] mr-2" title="New conversation">
            New
          </button>
          <button type="button" onClick={() => setOpen(false)} className="gus-collapse-btn">
            <ChevronDown className="w-3 h-3" strokeWidth={3} /> Close
          </button>
        </div>
      </div>

      {/* Daily quest + weekly streak, tucked under the header */}
      {quest.quest && (
        <div className={`gus-quest-strip ${quest.completed ? 'gus-quest-done' : ''}`}>
          <span className="gus-quest-strip-text">
            {quest.completed ? 'Quest complete!' : quest.quest.text}
          </span>
          {!quest.completed && (
            <span className="gus-quest-strip-progress">{quest.progress}/{quest.quest.target}</span>
          )}
          {weeklyCount > 0 && (
            <span className="gus-quest-strip-streak">{weeklyCount} filed this week</span>
          )}
        </div>
      )}

      <div ref={chatRef} className="gus-chat-body">
        {messages.map((msg, i) => (
          <div key={i} className={`gus-msg ${msg.role === 'user' ? 'gus-msg-user' : 'gus-msg-gus'}`}>
            {msg.role === 'gus' && (
              <img src={GUS_FACE} alt="" className="gus-msg-avatar" />
            )}
            <div className={`gus-msg-content ${msg.role === 'user' ? 'gus-msg-content-user' : 'gus-msg-content-gus'}`}>
              <p style={{ textTransform: 'none' }}>{msg.text}</p>

              {msg.proposedTickets?.length > 0 && (
                <div className="mt-3 space-y-1.5">
                  <p className="text-[0.5rem] tracking-[0.18em] text-[var(--ink-30)] uppercase">
                    Proposed Entries ({msg.proposedTickets.length})
                  </p>
                  {msg.proposedTickets.map((t, j) => (
                    <div key={j} className="gus-proposed-ticket">
                      <FileText className="w-2.5 h-2.5 flex-shrink-0 mt-0.5" />
                      <span style={{ textTransform: 'none' }}>{t.title}</span>
                      {t.priority && <span className="gus-tag ml-auto">{t.priority}</span>}
                    </div>
                  ))}
                </div>
              )}

              {msg.tickets?.length > 0 && (
                <div className="mt-3">
                  <p className="text-[0.5rem] tracking-[0.18em] text-[var(--ink-30)] uppercase mb-2">
                    Ready to File ({msg.tickets.length})
                  </p>
                  <div className="space-y-2">
                    {msg.tickets.map((t, j) => (
                      <div key={j} className="gus-ticket-card">
                        <p className="text-[0.75rem] tracking-[0.02em] mb-1">{t.title}</p>
                        {t.description && (
                          <p className="text-[0.625rem] text-[var(--ink-30)] leading-relaxed mb-1.5" style={{ textTransform: 'none' }}>
                            {t.description.length > 100 ? t.description.slice(0, 100) + '...' : t.description}
                          </p>
                        )}
                        <div className="flex gap-2 flex-wrap">
                          <span className="gus-tag">{t.priority}</span>
                          {t.categoryName && <span className="gus-tag">{t.categoryName}</span>}
                          {t.dueDate && <span className="gus-tag">Due {t.dueDate}</span>}
                          {t.labels?.map((l, k) => (
                            <span key={k} className="gus-tag gus-tag-label">{l}</span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleFileTickets(msg.tickets)}
                    disabled={creating}
                    className="btn-black w-full mt-3 text-[0.5625rem] py-2.5 justify-center disabled:opacity-40"
                  >
                    {creating ? (
                      <><Loader2 className="w-3 h-3 animate-spin" /> Filing...</>
                    ) : (
                      <><Check className="w-2.5 h-2.5" strokeWidth={3} /> File {msg.tickets.length} {msg.tickets.length === 1 ? 'Entry' : 'Entries'}</>
                    )}
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="gus-msg gus-msg-gus">
            <img src={GUS_FACE} alt="" className="gus-msg-avatar" />
            <div className="gus-msg-content gus-msg-content-gus">
              <span className="gus-typing"><span /><span /><span /></span>
              <p className="mt-1.5 text-[0.5rem] tracking-[0.18em] uppercase text-[var(--ink-30)]">
                {WORKING_LINES[workingLine % WORKING_LINES.length]}
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="gus-chat-input">
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
          placeholder="Describe a task or project..."
          className="gus-input flex-1"
          disabled={loading || creating}
          style={{ textTransform: 'none' }}
        />
        <button
          type="button"
          onClick={handleSend}
          disabled={!input.trim() || loading || creating}
          className="gus-send disabled:opacity-20"
        >
          <Send className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}
