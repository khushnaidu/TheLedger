import { useEffect, useState } from 'react';
import { MARX_FACE, FRIEDMAN_FACE } from '../lib/theme';

// The two clerks lean in from the right edge on finance routes, the way Jane
// does in the Reading Room and Gus does everywhere else. Gus does not work
// this floor. Clicking a head asks the page to open the drawer at that man's
// desk, so which face you poke is how you choose who you are talking to.
//
// They sway on different clocks. Two heads bobbing in unison reads as one
// animation applied twice, which is exactly what it is, so the delays differ.

// No name tab under the heads. Two of the most caricatured faces in economics
// do not need labelling, and the hover bubble says who anyway.
const PAIR = [
  { id: 'friedman', face: FRIEDMAN_FACE, name: 'Friedman', bubble: 'A word about that?', delay: '0s' },
  { id: 'marx', face: MARX_FACE, name: 'Marx', bubble: 'We should talk.', delay: '-5.5s' },
];

export default function ClerkPeek() {
  const [chatOpen, setChatOpen] = useState(false);

  useEffect(() => {
    const handler = (e) => setChatOpen(!!e.detail?.open);
    window.addEventListener('clerk-panel', handler);
    return () => window.removeEventListener('clerk-panel', handler);
  }, []);

  if (chatOpen) return null;

  return (
    <div className="fin-peek-stack">
      {PAIR.map((c) => (
        <div
          key={c.id}
          className={`fin-peek fin-peek-${c.id}`}
          onClick={() => window.dispatchEvent(new CustomEvent('clerk-consult', { detail: { who: c.id } }))}
        >
          <div className="fin-peek-bust" style={{ animationDelay: c.delay }}>
            <img className="fin-peek-face" src={c.face} alt="" draggable={false} />
          </div>
          <span className="fin-peek-bubble"><b>{c.name}</b> · {c.bubble}</span>
        </div>
      ))}
    </div>
  );
}
