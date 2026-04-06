import { useState, useRef, useEffect } from 'react';
import { Sparkles, Send, Check, X, RotateCcw } from 'lucide-react';
import { api } from '../api';

const GUS_IDLE_QUOTES = [
  "Gus here. What needs filing?",
  "Ready to process your request, boss.",
  "Tell me what needs doing — I'll draft the paperwork.",
  "Another day, another entry. What've we got?",
  "Gus reporting for duty. Describe the task.",
];

export default function GusAssistant({ categories, onApply }) {
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [gusQuote] = useState(() => GUS_IDLE_QUOTES[Math.floor(Math.random() * GUS_IDLE_QUOTES.length)]);
  const inputRef = useRef(null);

  useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus();
  }, [open]);

  const handleGenerate = async () => {
    if (!prompt.trim() || loading) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const data = await api.generateTicket({ prompt: prompt.trim(), categories });
      setResult(data);
    } catch (err) {
      setError(err.message || 'Gus encountered an error filing that one.');
    } finally {
      setLoading(false);
    }
  };

  const handleApply = () => {
    if (!result?.ticket) return;
    const ticket = result.ticket;

    // Match category by name if provided
    if (ticket.categoryName && categories?.length) {
      const match = categories.find(c =>
        c.name.toLowerCase() === ticket.categoryName.toLowerCase()
      );
      if (match) ticket.categoryId = match.id;
    }

    onApply(ticket);
    setResult(null);
    setPrompt('');
    setOpen(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleGenerate();
    }
  };

  const handleReset = () => {
    setResult(null);
    setError(null);
    setPrompt('');
    if (inputRef.current) inputRef.current.focus();
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="gus-toggle group"
      >
        <img src="/gus.jpg" alt="Gus" className="gus-avatar" />
        <div className="flex-1 text-left">
          <span className="block text-[0.5625rem] tracking-[0.18em] text-[var(--ink-30)]">
            Ask Gus
          </span>
          <span className="block text-[0.6875rem] tracking-[0.06em] text-[var(--ink-50)] group-hover:text-[var(--ink)]">
            AI-assisted filing
          </span>
        </div>
        <Sparkles className="w-3.5 h-3.5 text-[var(--ink-15)] group-hover:text-[var(--stamp)]" />
      </button>
    );
  }

  return (
    <div className="gus-panel">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <img src="/gus.jpg" alt="Gus" className="gus-avatar" />
        <div className="flex-1">
          <span className="block text-[0.6875rem] tracking-[0.14em]">
            Augustus &ldquo;Gus&rdquo;
          </span>
          <span className="block text-[0.5rem] tracking-[0.18em] text-[var(--ink-30)]">
            Filing Clerk
          </span>
        </div>
        <button type="button" onClick={() => setOpen(false)} className="btn-ghost p-1">
          <X className="w-3 h-3" />
        </button>
      </div>

      {/* Gus speech */}
      <div className="gus-speech mb-6">
        {loading ? (
          <span className="gus-typing">
            <span /><span /><span />
          </span>
        ) : result?.message ? (
          <p className="text-[0.75rem] tracking-[0.04em] text-[var(--ink-50)]" style={{ textTransform: 'none' }}>
            &ldquo;{result.message}&rdquo;
          </p>
        ) : error ? (
          <p className="text-[0.75rem] tracking-[0.04em] text-[var(--stamp)]" style={{ textTransform: 'none' }}>
            {error}
          </p>
        ) : (
          <p className="text-[0.75rem] tracking-[0.04em] text-[var(--ink-30)]" style={{ textTransform: 'none' }}>
            &ldquo;{gusQuote}&rdquo;
          </p>
        )}
      </div>

      {/* Generated ticket preview */}
      {result?.ticket && (
        <div className="gus-ticket-preview mb-6">
          <p className="text-[0.5rem] tracking-[0.18em] text-[var(--ink-30)] mb-3">
            Drafted Entry
          </p>
          <div className="space-y-2">
            <p className="text-[0.8125rem] tracking-[0.02em]">{result.ticket.title}</p>
            {result.ticket.description && (
              <p className="text-[0.6875rem] text-[var(--ink-50)] leading-relaxed" style={{ textTransform: 'none' }}>
                {result.ticket.description.length > 140
                  ? result.ticket.description.slice(0, 140) + '...'
                  : result.ticket.description}
              </p>
            )}
            <div className="flex gap-3 flex-wrap pt-1">
              {result.ticket.priority && (
                <span className="gus-tag">{result.ticket.priority}</span>
              )}
              {result.ticket.status && (
                <span className="gus-tag">{result.ticket.status}</span>
              )}
              {result.ticket.categoryName && (
                <span className="gus-tag">{result.ticket.categoryName}</span>
              )}
              {result.ticket.dueDate && (
                <span className="gus-tag">Due {result.ticket.dueDate}</span>
              )}
            </div>
          </div>

          <div className="flex gap-2 mt-4">
            <button type="button" onClick={handleApply} className="btn-black text-[0.5625rem] py-2 px-4">
              <Check className="w-2.5 h-2.5" strokeWidth={3} /> Apply
            </button>
            <button type="button" onClick={handleReset} className="btn-ghost text-[0.5625rem]">
              <RotateCcw className="w-2.5 h-2.5" /> Redo
            </button>
          </div>
        </div>
      )}

      {/* Input */}
      {!result && (
        <div className="flex gap-2 items-end">
          <textarea
            ref={inputRef}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={2}
            placeholder="e.g. I need to finish the API docs by Friday..."
            className="gus-input flex-1"
            disabled={loading}
            style={{ textTransform: 'none' }}
          />
          <button
            type="button"
            onClick={handleGenerate}
            disabled={!prompt.trim() || loading}
            className="gus-send disabled:opacity-20"
          >
            <Send className="w-3 h-3" />
          </button>
        </div>
      )}
    </div>
  );
}
