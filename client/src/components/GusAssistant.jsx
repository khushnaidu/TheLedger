import { useState, useRef, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { Send, Check, ChevronDown, FileText, Loader2 } from 'lucide-react';
import { api } from '../api';

const GUS_FACES = {
  idle: '/gus/idle.png',
  blinking: '/gus/blinking.png',
  thinking: '/gus/thinking.png',
  smiling: '/gus/smiling.png',
  curious: '/gus/curious.png',
};

// Preload all images
Object.values(GUS_FACES).forEach(src => {
  const img = new Image();
  img.src = src;
});

const PAGE_QUOTES = {
  '/': [
    "Reviewing the daily ledger...",
    "The numbers look good today.",
    "Your dashboard awaits, boss.",
    "Gus keeps the books balanced.",
  ],
  '/board': [
    "The filing cabinet awaits...",
    "Need something organized?",
    "Drag, drop, conquer.",
    "Paperwork never sleeps.",
  ],
  '/list': [
    "The full archives, at your service.",
    "Every entry, accounted for.",
    "Need to find something specific?",
    "The records don't lie.",
  ],
  '/canvas': [
    "Ah, the academic wing...",
    "School assignments incoming?",
    "Canvas sync standing by.",
    "I'll file those assignments for you.",
  ],
  '/tickets/new': [
    "Filing a new one by hand? Respect.",
    "I could do that for you, y'know.",
    "Manual entry — old school. I like it.",
    "The pen is mightier than the keyboard.",
  ],
};

const DEFAULT_QUOTES = [
  "Gus is on standby.",
  "Click to summon the clerk.",
  "Need something filed?",
];

const GUS_GREETING = [
  "Right-o! Gus at your service. What needs filing today?",
  "The clerk is IN. Describe what you're working on and I'll sort the paperwork.",
  "Augustus reporting. Tell me about your task — or dump a whole project on me, I can handle it.",
  "Ah, a customer! What've we got today? Single task or a full operation?",
];

function getPageQuote(pathname) {
  // Match exact or prefix
  const quotes = PAGE_QUOTES[pathname]
    || (pathname.startsWith('/tickets/') ? PAGE_QUOTES['/tickets/new'] : null)
    || DEFAULT_QUOTES;
  return quotes[Math.floor(Math.random() * quotes.length)];
}

const MOVE_QUOTES = {
  DONE: [
    "Another one bites the dust!",
    "STAMPED. Filed. Beautiful.",
    "And THAT'S how it's done.",
    "Consider that entry closed, boss.",
    "The archives welcome another victory.",
  ],
  IN_PROGRESS: [
    "Now we're cooking with gas!",
    "Promoted to active duty. Excellent.",
    "In the trenches now. Good luck.",
    "Rolling up the sleeves on this one.",
  ],
  TODO: [
    "Queued up and ready to go.",
    "Added to the docket.",
    "On the list. It'll get its turn.",
  ],
  REVIEW: [
    "Under inspection. Very thorough.",
    "Sent for review — dotting the i's.",
    "Quality control in progress.",
  ],
  BACKLOG: [
    "Back to the pile it goes.",
    "Filed under 'later'. Classic.",
    "The backlog grows ever patient.",
  ],
  TRASH: [
    "Into the shredder! Goodbye.",
    "Incinerated. The paperwork gods demand sacrifice.",
    "Gone. Reduced to confetti.",
    "You won't be needing THAT anymore.",
  ],
};

function getRandomQuote(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

export default function GusAssistant({ onTicketsCreated }) {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [apiMessages, setApiMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [face, setFace] = useState('idle');
  const [categories, setCategories] = useState([]);
  const [labels, setLabels] = useState([]);
  const [idleQuote, setIdleQuote] = useState(() => getPageQuote('/'));
  const [greeting] = useState(() => GUS_GREETING[Math.floor(Math.random() * GUS_GREETING.length)]);
  const [voiceLine, setVoiceLine] = useState(null);
  const voiceTimerRef = useRef(null);
  const chatRef = useRef(null);
  const inputRef = useRef(null);
  const blinkTimerRef = useRef(null);

  // Fetch categories, labels, and board health for Gus
  const [boardMood, setBoardMood] = useState('idle');
  const [weeklyCount, setWeeklyCount] = useState(0);

  useEffect(() => {
    Promise.all([api.getCategories(), api.getLabels()])
      .then(([c, l]) => { setCategories(c); setLabels(l); })
      .catch(() => {});
    checkBoardHealth();
    checkWeeklyStreak();
  }, []);

  // Re-check board health when page changes or tickets are created
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
      const worriedQuotes = [
        "You've got overdue entries...",
        "The deadlines aren't looking great.",
        "Boss, we need to talk about those overdue items.",
        "Some entries are past due. Just saying.",
      ];
      setIdleQuote(worriedQuotes[Math.floor(Math.random() * worriedQuotes.length)]);
    } else if (boardMood === 'smiling') {
      const happyQuotes = [
        "All clear! Inbox zero!",
        "The ledger is spotless. Beautiful.",
        "Not a single active entry. Magnificent.",
        "Everything's filed and done. I could cry.",
      ];
      setIdleQuote(happyQuotes[Math.floor(Math.random() * happyQuotes.length)]);
    } else {
      setIdleQuote(getPageQuote(location.pathname));
    }
  }, [location.pathname, boardMood]);

  // Listen for ticket moves (drag-drop voice lines)
  useEffect(() => {
    const handler = (e) => {
      const { to } = e.detail;
      const quotes = MOVE_QUOTES[to];
      if (!quotes) return;

      // Flash appropriate face
      if (to === 'DONE') flashFace('smiling', 2500);
      else if (to === 'TRASH') flashFace('curious', 2000);
      else flashFace('curious', 1500);

      // Show voice line
      if (voiceTimerRef.current) clearTimeout(voiceTimerRef.current);
      setVoiceLine(getRandomQuote(quotes));
      voiceTimerRef.current = setTimeout(() => setVoiceLine(null), 3000);

      // Re-check board health and streak
      checkBoardHealth();
      checkWeeklyStreak();
    };
    window.addEventListener('gus-ticket-moved', handler);
    return () => window.removeEventListener('gus-ticket-moved', handler);
  }, []);

  // Idle blink loop
  const startBlinkLoop = useCallback(() => {
    if (blinkTimerRef.current) clearTimeout(blinkTimerRef.current);

    const scheduleBlink = () => {
      const delay = 2500 + Math.random() * 4000;
      blinkTimerRef.current = setTimeout(() => {
        setFace('blinking');
        setTimeout(() => {
          setFace(boardMood === 'idle' ? 'idle' : boardMood);
          scheduleBlink();
        }, 250);
      }, delay);
    };
    setFace(boardMood === 'idle' ? 'idle' : boardMood);
    scheduleBlink();
  }, []);

  const stopBlinkLoop = () => {
    if (blinkTimerRef.current) {
      clearTimeout(blinkTimerRef.current);
      blinkTimerRef.current = null;
    }
  };

  useEffect(() => {
    if (!loading && !creating) {
      startBlinkLoop();
    } else {
      stopBlinkLoop();
    }
    return () => stopBlinkLoop();
  }, [loading, creating, startBlinkLoop, boardMood]);

  useEffect(() => {
    if (loading) setFace('thinking');
    else if (creating) setFace('thinking');
  }, [loading, creating]);

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [messages, loading]);

  useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus();
  }, [open]);

  const flashFace = (expression, duration = 2000) => {
    stopBlinkLoop();
    setFace(expression);
    setTimeout(() => {
      setFace(boardMood === 'idle' ? 'idle' : boardMood);
      startBlinkLoop();
    }, duration);
  };

  const handleOpen = () => {
    setOpen(true);
    flashFace('curious', 1500);
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
    setFace('thinking');

    try {
      const data = await api.generateTicket({
        messages: newApiMessages,
        categories,
        labels,
      });

      if (data.type === 'question') {
        setMessages(prev => [...prev, {
          role: 'gus',
          text: data.message,
          proposedTickets: data.proposedTickets,
        }]);
        setApiMessages(prev => [
          ...prev,
          { role: 'assistant', content: [{ type: 'tool_use', id: 'q', name: 'ask_question', input: { message: data.message, proposed_tickets: data.proposedTickets } }] },
          { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'q', content: 'User is viewing the question.' }] },
        ]);
        flashFace('curious', 2000);
      } else if (data.type === 'tickets') {
        setMessages(prev => [...prev, {
          role: 'gus',
          text: data.message,
          tickets: data.tickets,
        }]);
        setApiMessages(prev => [
          ...prev,
          { role: 'assistant', content: [{ type: 'tool_use', id: 't', name: 'create_tickets', input: { message: data.message, tickets: data.tickets } }] },
          { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't', content: 'Tickets shown to user for approval.' }] },
        ]);
        flashFace('smiling', 2500);
      }
    } catch (err) {
      setMessages(prev => [...prev, { role: 'gus', text: `Blast — hit a snag: ${err.message}` }]);
      flashFace('curious', 1500);
    } finally {
      setLoading(false);
    }
  };

  const handleFileTickets = async (tickets) => {
    setCreating(true);
    setFace('thinking');
    try {
      await api.createTicketsFromGus({ tickets });
      const count = tickets.length;
      setMessages(prev => [
        ...prev,
        { role: 'gus', text: `Consider it done! ${count} ${count === 1 ? 'entry' : 'entries'} filed and stamped. The archives grow ever richer.` },
      ]);
      flashFace('smiling', 3000);
      // Refresh categories/labels in case new ones were created
      Promise.all([api.getCategories(), api.getLabels()])
        .then(([c, l]) => { setCategories(c); setLabels(l); })
        .catch(() => {});
      onTicketsCreated?.();
    } catch (err) {
      setMessages(prev => [...prev, { role: 'gus', text: `Filing error: ${err.message}. The bureaucracy strikes back.` }]);
      flashFace('curious', 1500);
    } finally {
      setCreating(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleNewConversation = () => {
    setMessages([{ role: 'gus', text: greeting }]);
    setApiMessages([]);
    setInput('');
    flashFace('curious', 1200);
  };

  // Collapsed — clerk window top-right
  if (!open) {
    return (
      <div className="gus-board-character" onClick={handleOpen}>
        <div className="gus-window">
          <div className="gus-face-container">
            <img src={GUS_FACES[face]} alt="Gus" className="gus-face" />
          </div>
          {/* Hover bubble */}
          {!voiceLine && (
            <div className="gus-window-bubble">
              <span>{idleQuote}</span>
            </div>
          )}
          {/* Voice line (always visible, auto-fades) */}
          {voiceLine && (
            <div className="gus-voice-line">
              <span>{voiceLine}</span>
            </div>
          )}
        </div>
        <div className="gus-nameplate">
          <span className="gus-status-dot" />
          Augustus
          {weeklyCount > 0 && (
            <span className="gus-streak">{weeklyCount} this week</span>
          )}
        </div>
      </div>
    );
  }

  // Expanded chat panel
  return (
    <div className="gus-chat-panel">
      {/* Header — large animated face */}
      <div className="gus-chat-header">
        <div className="gus-chat-face-wrap">
          <img src={GUS_FACES[face]} alt="Gus" className="gus-chat-face" />
        </div>
        <div className="gus-chat-header-info">
          <div className="flex-1">
            <span className="block text-[0.6875rem] tracking-[0.14em]">
              Augustus &ldquo;Gus&rdquo;
            </span>
            <span className="block text-[0.5rem] tracking-[0.18em] text-[var(--ink-30)]">
              Filing Clerk &middot; On Duty
            </span>
          </div>
          <button type="button" onClick={handleNewConversation} className="btn-ghost text-[0.5rem] mr-2" title="New conversation">
            New
          </button>
          <button type="button" onClick={() => setOpen(false)} className="btn-ghost p-1">
            <ChevronDown className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Chat messages */}
      <div ref={chatRef} className="gus-chat-body">
        {messages.map((msg, i) => (
          <div key={i} className={`gus-msg ${msg.role === 'user' ? 'gus-msg-user' : 'gus-msg-gus'}`}>
            {msg.role === 'gus' && (
              <img src={GUS_FACES.idle} alt="" className="gus-msg-avatar" />
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
            <img src={GUS_FACES.thinking} alt="" className="gus-msg-avatar" />
            <div className="gus-msg-content gus-msg-content-gus">
              <span className="gus-typing"><span /><span /><span /></span>
            </div>
          </div>
        )}
      </div>

      {/* Input */}
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
