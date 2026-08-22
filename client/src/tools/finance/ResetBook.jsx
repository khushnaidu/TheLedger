import { useState } from 'react';
import { api } from '../../api';

// Emptying the book. There is no undo behind this and no soft delete, so the
// gate is a phrase typed out in full rather than a button that can be hit by
// accident. The server checks the same phrase again, because a confirmation
// that only exists in the client is not a confirmation.

export const PHRASE = 'BURN THE BOOK';

export default function ResetBook({ lines, onClose, onDone }) {
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const armed = typed.trim().toUpperCase() === PHRASE;

  const burn = async () => {
    if (!armed || busy) return;
    setBusy(true);
    setError('');
    try {
      const { deleted } = await api.resetBook(PHRASE);
      onDone(deleted);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <div className="fin-modal" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="fin-modal-sheet fin-reset-sheet">
        <div className="fin-modal-head">
          <span>Empty the book</span>
          <button className="fin-close" onClick={onClose} title="Close">✕</button>
        </div>

        <div className="fin-reset">
          <p className="fin-reset-warn">
            This strikes every line in the book. All {lines} of them, every month,
            every import, hand-written lines included. It cannot be undone.
          </p>
          <p className="fin-reset-ask">
            Type <b>{PHRASE}</b> to confirm.
          </p>
          <input
            className="input-field fin-reset-input"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={PHRASE}
            autoComplete="off"
            spellCheck={false}
          />
          {error && <p className="fin-error mt-3">{error}</p>}
          <div className="fin-reset-foot">
            <button className="btn-ghost" onClick={onClose}>Keep the book</button>
            <button className="btn-black fin-reset-go" onClick={burn} disabled={!armed || busy}>
              {busy ? 'Striking…' : `Strike all ${lines}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
