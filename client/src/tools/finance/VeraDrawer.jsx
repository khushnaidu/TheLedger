import VeraPanel from './VeraPanel';

// Vera used to sit in a rail beside the book, which meant a chat window was
// always on screen whether or not anyone was talking to her. She is a drawer
// now: closed unless called.

export default function VeraDrawer({ onClose, onPosted }) {
  return (
    <div className="fin-drawer" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="fin-drawer-body">
        <button className="fin-drawer-close" onClick={onClose} title="Close">✕</button>
        <VeraPanel onPosted={onPosted} />
      </div>
    </div>
  );
}
