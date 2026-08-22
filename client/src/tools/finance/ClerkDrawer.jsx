import { useEffect } from 'react';
import ClerkPanel from './ClerkPanel';

// Neither clerk sits in a rail. They are a drawer: closed unless one of them
// is called, and while the drawer is open the pair stop peeking from the edge
// so there is only ever one of each man on screen.

export default function ClerkDrawer({ who, onSwitch, onClose, onPosted }) {
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('clerk-panel', { detail: { open: true } }));
    return () => window.dispatchEvent(new CustomEvent('clerk-panel', { detail: { open: false } }));
  }, []);

  return (
    <div className="fin-drawer" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="fin-drawer-body">
        <button className="fin-drawer-close" onClick={onClose} title="Close">✕</button>
        <ClerkPanel who={who} onSwitch={onSwitch} onPosted={onPosted} />
      </div>
    </div>
  );
}
