import { useState, useRef, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { Send, Check, ChevronDown, FileText, Loader2 } from 'lucide-react';
import { api } from '../api';
import { getDailyQuest, updateQuestProgress } from '../lib/quests';
import { useTheme } from '../lib/ThemeContext';

function getRandomQuote(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function getPageQuote(pathname, quotes) {
  const pool = quotes.pageQuotes[pathname]
    || (pathname.startsWith('/tickets/') ? quotes.pageQuotes['/tickets/new'] : null)
    || quotes.defaultQuotes;
  return pool[Math.floor(Math.random() * pool.length)];
}

export default function GusAssistant({ onTicketsCreated }) {
  const location = useLocation();
  const { theme, gusFaces, gusPersona, gusQuotes } = useTheme();

  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [apiMessages, setApiMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [face, setFace] = useState('idle');
  const [categories, setCategories] = useState([]);
  const [labels, setLabels] = useState([]);
  const [idleQuote, setIdleQuote] = useState(() => getPageQuote('/', gusQuotes));
  const [greeting] = useState(() => getRandomQuote(gusQuotes.greetings));
  const [voiceLine, setVoiceLine] = useState(null);
  const voiceTimerRef = useRef(null);
  const chatRef = useRef(null);
  const inputRef = useRef(null);
  const blinkTimerRef = useRef(null);

  const [boardMood, setBoardMood] = useState('idle');
  const [weeklyCount, setWeeklyCount] = useState(0);
  const [quest, setQuest] = useState(() => getDailyQuest());

  // Preload face images
  useEffect(() => {
    Object.values(gusFaces).forEach(src => {
      const img = new Image();
      img.src = src;
    });
  }, [gusFaces]);

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
      setIdleQuote(getRandomQuote(gusQuotes.worriedQuotes));
    } else if (boardMood === 'smiling') {
      setIdleQuote(getRandomQuote(gusQuotes.happyQuotes));
    } else {
      setIdleQuote(getPageQuote(location.pathname, gusQuotes));
    }
  }, [location.pathname, boardMood, gusQuotes]);

  // Listen for quest completion
  useEffect(() => {
    const handler = () => {
      setQuest(getDailyQuest());
      setTimeout(() => {
        if (voiceTimerRef.current) clearTimeout(voiceTimerRef.current);
        setVoiceLine(theme === 'tome' ? "QUEST ACHIEVED! Glory!" : "QUEST COMPLETE! Well done, boss!");
        flashFace('smiling', 4000);
        voiceTimerRef.current = setTimeout(() => setVoiceLine(null), 4000);
      }, 3500);
    };
    window.addEventListener('gus-quest-complete', handler);
    return () => window.removeEventListener('gus-quest-complete', handler);
  }, [theme]);

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
        flashFace('smiling', 4000);
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
      const quotes = gusQuotes.moveQuotes[to];
      if (!quotes) return;

      if (to === 'DONE') flashFace('smiling', 2500);
      else if (to === 'TRASH') flashFace('curious', 2000);
      else flashFace('curious', 1500);

      if (voiceTimerRef.current) clearTimeout(voiceTimerRef.current);
      setVoiceLine(getRandomQuote(quotes));
      voiceTimerRef.current = setTimeout(() => setVoiceLine(null), 3000);

      checkBoardHealth();
      checkWeeklyStreak();
    };
    window.addEventListener('gus-ticket-moved', handler);
    return () => window.removeEventListener('gus-ticket-moved', handler);
  }, [gusQuotes]);

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
  }, [boardMood]);

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
          role: 'gus', text: data.message, proposedTickets: data.proposedTickets,
        }]);
        setApiMessages(prev => [
          ...prev,
          { role: 'assistant', content: [{ type: 'tool_use', id: 'q', name: 'ask_question', input: { message: data.message, proposed_tickets: data.proposedTickets } }] },
          { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'q', content: 'User is viewing the question.' }] },
        ]);
        flashFace('curious', 2000);
      } else if (data.type === 'tickets') {
        setMessages(prev => [...prev, {
          role: 'gus', text: data.message, tickets: data.tickets,
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
      const doneMsg = theme === 'tome'
        ? `It is done! ${count} ${count === 1 ? 'quest' : 'quests'} inscribed upon the scrolls. The chronicles grow!`
        : `Consider it done! ${count} ${count === 1 ? 'entry' : 'entries'} filed and stamped. The archives grow ever richer.`;
      setMessages(prev => [...prev, { role: 'gus', text: doneMsg }]);
      flashFace('smiling', 3000);
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
      flashFace('curious', 1500);
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
    flashFace('curious', 1200);
  };

  // Collapsed — clerk window top-right
  if (!open) {
    return (
      <div className="gus-board-character" onClick={handleOpen}>
        <div className="gus-window">
          <div className="gus-face-container">
            <img src={gusFaces[face]} alt="Gus" className="gus-face" />
          </div>
          {!voiceLine && (
            <div className="gus-window-bubble"><span>{idleQuote}</span></div>
          )}
          {voiceLine && (
            <div className="gus-voice-line"><span>{voiceLine}</span></div>
          )}
        </div>
        <div className="gus-nameplate">
          <span className="gus-status-dot" />
          {gusPersona.nameplate}
          {weeklyCount > 0 && (
            <span className="gus-streak">{weeklyCount} this week</span>
          )}
        </div>
        {quest.quest && (
          <div className={`gus-quest-bar ${quest.completed ? 'gus-quest-done' : ''}`}>
            <span className="gus-quest-text">
              {quest.completed ? (theme === 'tome' ? 'Quest Achieved!' : 'Quest Complete!') : quest.quest.text}
            </span>
            {!quest.completed && (
              <span className="gus-quest-progress">{quest.progress}/{quest.quest.target}</span>
            )}
          </div>
        )}
      </div>
    );
  }

  // Expanded chat panel
  return (
    <div className="gus-chat-panel">
      <div className="gus-chat-header">
        <div className="gus-chat-face-wrap">
          <img src={gusFaces[face]} alt="Gus" className="gus-chat-face" />
        </div>
        <div className="gus-chat-header-info">
          <div className="flex-1">
            <span className="block text-[0.6875rem] tracking-[0.14em]">
              {gusPersona.name}
            </span>
            <span className="block text-[0.5rem] tracking-[0.18em] text-[var(--ink-30)]">
              {gusPersona.role} &middot; {gusPersona.status}
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

      <div ref={chatRef} className="gus-chat-body">
        {messages.map((msg, i) => (
          <div key={i} className={`gus-msg ${msg.role === 'user' ? 'gus-msg-user' : 'gus-msg-gus'}`}>
            {msg.role === 'gus' && (
              <img src={gusFaces.idle} alt="" className="gus-msg-avatar" />
            )}
            <div className={`gus-msg-content ${msg.role === 'user' ? 'gus-msg-content-user' : 'gus-msg-content-gus'}`}>
              <p style={{ textTransform: 'none' }}>{msg.text}</p>

              {msg.proposedTickets?.length > 0 && (
                <div className="mt-3 space-y-1.5">
                  <p className="text-[0.5rem] tracking-[0.18em] text-[var(--ink-30)] uppercase">
                    {theme === 'tome' ? 'Proposed Quests' : 'Proposed Entries'} ({msg.proposedTickets.length})
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
                    {theme === 'tome' ? 'Ready to Inscribe' : 'Ready to File'} ({msg.tickets.length})
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
                      <><Loader2 className="w-3 h-3 animate-spin" /> {theme === 'tome' ? 'Inscribing...' : 'Filing...'}</>
                    ) : (
                      <><Check className="w-2.5 h-2.5" strokeWidth={3} /> {theme === 'tome' ? 'Inscribe' : 'File'} {msg.tickets.length} {msg.tickets.length === 1 ? (theme === 'tome' ? 'Quest' : 'Entry') : (theme === 'tome' ? 'Quests' : 'Entries')}</>
                    )}
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="gus-msg gus-msg-gus">
            <img src={gusFaces.thinking} alt="" className="gus-msg-avatar" />
            <div className="gus-msg-content gus-msg-content-gus">
              <span className="gus-typing"><span /><span /><span /></span>
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
          placeholder={theme === 'tome' ? 'Describe your quest...' : 'Describe a task or project...'}
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
