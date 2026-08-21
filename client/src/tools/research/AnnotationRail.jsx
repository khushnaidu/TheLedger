import { useState } from 'react';

const COLORS = ['marigold', 'rose', 'sage', 'ink'];

function MarkCard({ ann, onJump, onUpdate, onDelete, onAsk }) {
  const [note, setNote] = useState(ann.note || '');
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const saveNote = async () => {
    setEditing(false);
    if (note !== ann.note) await onUpdate(ann.id, { note });
  };

  const burn = async () => {
    if (!confirming) {
      setConfirming(true);
      setTimeout(() => setConfirming(false), 2500);
      return;
    }
    await onDelete(ann.id);
  };

  return (
    <div className={`rr-markcard rr-markcard-${ann.color}`} id={`rr-markcard-${ann.id}`}>
      <button className="rr-markcard-quote" onClick={() => onJump(ann)}>
        “{ann.quote.length > 160 ? `${ann.quote.slice(0, 160)}…` : ann.quote}”
      </button>
      <p className="rr-markcard-page">p. {ann.page}</p>
      {editing ? (
        <textarea
          className="rr-markcard-note-edit"
          value={note}
          autoFocus
          maxLength={2000}
          placeholder="a note in the margin…"
          onChange={(e) => setNote(e.target.value)}
          onBlur={saveNote}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveNote(); } }}
        />
      ) : (
        <p className="rr-markcard-note" onClick={() => setEditing(true)}>
          {ann.note || <span className="rr-markcard-note-empty">add a note…</span>}
        </p>
      )}
      <div className="rr-markcard-tools">
        {COLORS.map((c) => (
          <button key={c} className={`rr-dot rr-dot-${c} ${ann.color === c ? 'rr-dot-on' : ''}`}
            onClick={() => onUpdate(ann.id, { color: c })} title={c} />
        ))}
        <span className="flex-1" />
        <button className="rr-markcard-ask" onClick={() => onAsk(ann)}>ASK JANE</button>
        <button className={`rr-card-btn ${confirming ? 'rr-card-btn-hot' : ''}`} onClick={burn}>
          {confirming ? 'SURE?' : '×'}
        </button>
      </div>
    </div>
  );
}

export default function AnnotationRail({ annotations, onJump, onUpdate, onDelete, onAsk }) {
  if (!annotations.length) {
    return <p className="fig-caption p-4">no marks yet. select any passage in the paper.</p>;
  }
  return (
    <div className="rr-rail-scroll">
      {annotations.map((a) => (
        <MarkCard key={a.id} ann={a} onJump={onJump} onUpdate={onUpdate} onDelete={onDelete} onAsk={onAsk} />
      ))}
    </div>
  );
}
