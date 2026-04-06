import { useState, useRef, useEffect, useCallback } from 'react';
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

const GUS_IDLE_QUOTES = [
  "The filing cabinet awaits...",
  "Need something organized?",
  "Gus is on standby.",
  "Paperwork never sleeps.",
  "Click to summon the clerk.",
];

const GUS_GREETING = [
  "Right-o! Gus at your service. What needs filing today?",
  "The clerk is IN. Describe what you're working on and I'll sort the paperwork.",
  "Augustus reporting. Tell me about your task — or dump a whole project on me, I can handle it.",
  "Ah, a customer! What've we got today? Single task or a full operation?",
];

export default function GusAssistant({ categories, labels, onTicketsCreated }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [apiMessages, setApiMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [face, setFace] = useState('idle');
  const [idleQuote] = useState(() => GUS_IDLE_QUOTES[Math.floor(Math.random() * GUS_IDLE_QUOTES.length)]);
  const [greeting] = useState(() => GUS_GREETING[Math.floor(Math.random() * GUS_GREETING.length)]);
  const chatRef = useRef(null);
  const inputRef = useRef(null);
  const blinkTimerRef = useRef(null);

  // Idle blink loop — plays when not loading/creating
  const startBlinkLoop = useCallback(() => {
    if (blinkTimerRef.current) clearTimeout(blinkTimerRef.current);

    const scheduleBlink = () => {
      const delay = 2500 + Math.random() * 4000; // blink every 2.5–6.5s
      blinkTimerRef.current = setTimeout(() => {
        setFace('blinking');
        setTimeout(() => {
          setFace('idle');
          scheduleBlink();
        }, 250); // blink duration
      }, delay);
    };
    scheduleBlink();
  }, []);

  const stopBlinkLoop = () => {
    if (blinkTimerRef.current) {
      clearTimeout(blinkTimerRef.current);
      blinkTimerRef.current = null;
    }
  };

  // Start blink when idle
  useEffect(() => {
    if (!loading && !creating) {
      startBlinkLoop();
    } else {
      stopBlinkLoop();
    }
    return () => stopBlinkLoop();
  }, [loading, creating, startBlinkLoop]);

  // Set face based on state
  useEffect(() => {
    if (loading) setFace('thinking');
    else if (creating) setFace('thinking');
  }, [loading, creating]);

  // Scroll to bottom on new messages
  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [messages, loading]);

  // Focus input when opened
  useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus();
  }, [open]);

  const flashFace = (expression, duration = 2000) => {
    stopBlinkLoop();
    setFace(expression);
    setTimeout(() => {
      setFace('idle');
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

    const newUserMsg = { role: 'user', text: userText };
    setMessages(prev => [...prev, newUserMsg]);

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
        const gusMsg = {
          role: 'gus',
          text: data.message,
          proposedTickets: data.proposedTickets,
        };
        setMessages(prev => [...prev, gusMsg]);
        setApiMessages(prev => [
          ...prev,
          { role: 'assistant', content: [{ type: 'tool_use', id: 'q', name: 'ask_question', input: { message: data.message, proposed_tickets: data.proposedTickets } }] },
          { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'q', content: 'User is viewing the question.' }] },
        ]);
        flashFace('curious', 2000);
      } else if (data.type === 'tickets') {
        const gusMsg = {
          role: 'gus',
          text: data.message,
          tickets: data.tickets,
        };
        setMessages(prev => [...prev, gusMsg]);
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
      onTicketsCreated();
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
          <div className="gus-window-bubble">
            <span>{idleQuote}</span>
          </div>
        </div>
        <div className="gus-nameplate">
          <span className="gus-status-dot" />
          Augustus
        </div>
      </div>
    );
  }

  // Expanded chat panel — anchored top-right
  return (
    <div className="gus-chat-panel">
      {/* Header */}
      <div className="gus-chat-header">
        <div className="gus-face-container-sm">
          <img src={GUS_FACES[face]} alt="Gus" className="gus-face-sm" />
        </div>
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

      {/* Chat messages */}
      <div ref={chatRef} className="gus-chat-body">
        {messages.map((msg, i) => (
          <div key={i} className={`gus-msg ${msg.role === 'user' ? 'gus-msg-user' : 'gus-msg-gus'}`}>
            {msg.role === 'gus' && (
              <img src={GUS_FACES.idle} alt="" className="gus-msg-avatar" />
            )}
            <div className={`gus-msg-content ${msg.role === 'user' ? 'gus-msg-content-user' : 'gus-msg-content-gus'}`}>
              <p style={{ textTransform: 'none' }}>{msg.text}</p>

              {/* Proposed ticket previews */}
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

              {/* Ready-to-file tickets */}
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

        {/* Typing indicator */}
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
