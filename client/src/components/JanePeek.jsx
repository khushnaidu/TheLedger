import { useEffect, useState } from 'react';
import { JANE_HEAD } from '../lib/theme';

// Jane leans in from the right edge on research routes, the way Gus does
// everywhere else — just the big head. Clicking him asks the current page
// to open a consult: ReadingRoom opens the drawer, PaperReader switches the
// rail to JANE. While any chat panel is open he steps aside entirely.
export default function JanePeek() {
  const [chatOpen, setChatOpen] = useState(false);

  useEffect(() => {
    const handler = (e) => setChatOpen(!!e.detail?.open);
    window.addEventListener('jane-panel', handler);
    return () => window.removeEventListener('jane-panel', handler);
  }, []);

  if (chatOpen) return null;

  return (
    <div className="jn-peek" onClick={() => window.dispatchEvent(new CustomEvent('jane-consult'))}>
      <div className="jn-peek-bust">
        <img className="jn-peek-face" src={JANE_HEAD} alt="" draggable={false} />
      </div>
      <span className="jn-peek-tab">Jane</span>
      <span className="jn-peek-bubble">A word?</span>
    </div>
  );
}
